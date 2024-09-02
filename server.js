import { WebSocketServer } from 'ws';
import http from 'http';
import { parse } from 'url';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
    });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on('connection', (ws, req) => {
  const { roomId, playerId } = parse(req.url, true).query;
  
  console.log(`Player ${playerId} connected to room ${roomId}`);

  if (!rooms.has(roomId)) {
    rooms.set(roomId, { players: new Map(), readyPlayers: new Set() });
  }
  rooms.get(roomId).players.set(playerId, ws);

  // Notify all players in the room about the current player list
  broadcastPlayerList(roomId);

  function broadcastPlayerList(roomId) {
    const room = rooms.get(roomId);
    if (room) {
      const playerList = Array.from(room.players.keys());
      const message = {
        type: 'player_list',
        players: playerList,
        readyPlayers: Array.from(room.readyPlayers)
      };
      broadcastToRoom(roomId, message);
    }
  }
  

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'player_ready':
          handlePlayerReady(roomId, playerId);
          break;
        case 'game_state':
          broadcastToRoom(roomId, data, playerId);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Player ${playerId} disconnected from room ${roomId}`);
    const room = rooms.get(roomId);
    if (room) {
      room.players.delete(playerId);
      room.readyPlayers.delete(playerId);
      if (room.players.size === 0) {
        rooms.delete(roomId);
      } else {
        broadcastPlayerList(roomId);
      }
    }
  });

  // Set up ping-pong to keep the connection alive
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

function broadcastToRoom(roomId, message, excludePlayerId) {
  const room = rooms.get(roomId);
  if (room) {
    room.forEach((ws, pid) => {
      if (pid !== excludePlayerId && ws.readyState === WebSocketServer.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }
}

function handlePlayerReady(roomId, playerId) {
  const room = rooms.get(roomId);
  if (room) {
    room.readyPlayers.add(playerId);
    console.log(`Player ${playerId} is ready in room ${roomId}`);
    broadcastPlayerList(roomId);

    // Check if all players are ready and start the game if so
    if (room.readyPlayers.size === room.players.size && room.players.size === 2) {
      startGame(roomId);
    }
  }
}

function startGame(roomId) {
  console.log(`Starting game in room ${roomId}`);
  broadcastToRoom(roomId, { type: 'game_start' });
}


// Set up an interval to check for dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server is listening on port ${PORT}`);
});