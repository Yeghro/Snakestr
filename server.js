const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on('connection', (ws, req) => {
  const { roomId, playerId } = url.parse(req.url, true).query;
  
  console.log(`Player ${playerId} connected to room ${roomId}`);

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  rooms.get(roomId).set(playerId, ws);

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'game_state') {
      broadcastToRoom(roomId, data, playerId);
    }
  });

  ws.on('close', () => {
    console.log(`Player ${playerId} disconnected from room ${roomId}`);
    rooms.get(roomId).delete(playerId);
    if (rooms.get(roomId).size === 0) {
      rooms.delete(roomId);
    }
  });
});

function broadcastToRoom(roomId, message, excludePlayerId) {
  const room = rooms.get(roomId);
  if (room) {
    room.forEach((ws, pid) => {
      if (pid !== excludePlayerId) {
        ws.send(JSON.stringify(message));
      }
    });
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server is listening on port ${PORT}`);
});
