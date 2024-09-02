import { SnakeGame } from './game.js';
import { CONFIG } from './config.js';
import { NostrClient } from './nostrUtils.js';

export class MultiplayerGame extends SnakeGame {
  constructor(canvasId, roomId, playerId) {
    super(canvasId);
    this.roomId = roomId;
    this.playerId = playerId;
    this.otherPlayers = new Map();
    this.nostrClient = new NostrClient(CONFIG.WEBSOCKET_URL);
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.gameStarted = false;

    // Bind methods
    this.handleGameStateUpdate = this.handleGameStateUpdate.bind(this);
    this.handlePlayerJoined = this.handlePlayerJoined.bind(this);
    this.handlePlayerLeft = this.handlePlayerLeft.bind(this);
    this.handleGameStart = this.handleGameStart.bind(this);
  }

  async checkServerReachable() {
    const healthUrl = CONFIG.GAME_WEBSOCKET_URL.replace('ws', 'http') + '/health';
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        console.log('Game server is reachable');
        return true;
      } else {
        console.error('Game server health check failed');
        return false;
      }
    } catch (error) {
      console.error('Error checking server reachability:', error);
      return false;
    }
  }

  async setupMultiplayerEvents() {
    return new Promise(async (resolve, reject) => {
      const isServerReachable = await this.checkServerReachable();
      if (!isServerReachable) {
        reject(new Error('Game server is not reachable. Please ensure the server is running and try again.'));
        return;
      }

      const wsUrl = `${CONFIG.GAME_WEBSOCKET_URL}?roomId=${this.roomId}&playerId=${this.playerId}`;
      console.log(`Attempting to connect to WebSocket server at: ${wsUrl}`);
      
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(new Error('Failed to create WebSocket connection. Please try again later.'));
        return;
      }

      this.ws.onopen = () => {
        console.log(`Connected to game server for room ${this.roomId}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = this.handleGameStateUpdate;
      
      this.ws.onclose = (event) => {
        console.log(`Disconnected from game server for room ${this.roomId}. Code: ${event.code}, Reason: ${event.reason}`);
        this.isConnected = false;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!this.isConnected) {
          reject(new Error('WebSocket connection error. Please try again later.'));
        }
      };

      // Set a timeout in case the connection takes too long
      setTimeout(() => {
        if (!this.isConnected) {
          console.error('WebSocket connection timed out');
          reject(new Error('WebSocket connection timed out. Please try again later.'));
        }
      }, 5000);

      this.nostrClient.on('roomJoined', this.handlePlayerJoined);
      this.nostrClient.on('roomLeft', this.handlePlayerLeft);
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.setupMultiplayerEvents(), 2000);
    } else {
      console.error('Max reconnection attempts reached. Please refresh the page.');
      alert('Connection to the game server lost. Please refresh the page to reconnect.');
    }
  }

  async start() {
    try {
      await this.setupMultiplayerEvents();
      console.log(`Waiting for game start signal in room ${this.roomId}`);
      // Note: super.start() is not called here. It will be called in handleGameStart
      // when the server sends the game_start event
      return true;
    } catch (error) {
      console.error('Failed to start multiplayer game:', error);
      alert(`Failed to start multiplayer game: ${error.message}`);
      return false;
    }
  }
  
  update() {
    if (!this.gameStarted) return;
    super.update();
    if (this.isConnected) {
      this.sendGameState();
    }
  }

  sendGameState() {
    if (this.isConnected) {
      const state = {
        snake: this.snake,
        score: this.score
      };
      this.ws.send(JSON.stringify({
        type: 'game_state',
        roomId: this.roomId,
        playerId: this.playerId,
        state: state
      }));
    }
  }

  handlePlayerJoined(playerId) {
    this.addPlayer(playerId);
  }

  handlePlayerLeft(playerId) {
    this.removePlayer(playerId);
  }

  updateOtherPlayers() {
    // TODO: Update positions of other players
    console.log('Updating other players');
  }

  addPlayer(playerId) {
    this.otherPlayers.set(playerId, {
      snake: [],
      score: 0
    });
    console.log(`Player ${playerId} added to the game`);
  }

  removePlayer(playerId) {
    this.otherPlayers.delete(playerId);
    console.log(`Player ${playerId} removed from the game`);
  }

  handlePlayerUpdate(playerId, playerState) {
    if (playerId !== this.playerId) {
      this.otherPlayers.set(playerId, playerState);
    }
  }

  draw() {
    if (!this.gameStarted) return;
    super.draw();
    this.drawOtherPlayers();
  }

  drawOtherPlayers() {
    this.ctx.fillStyle = CONFIG.OTHER_PLAYER_COLOR;
    for (const [playerId, playerState] of this.otherPlayers) {
      for (const segment of playerState.snake) {
        this.ctx.fillRect(
          segment.x * this.cellSize,
          segment.y * this.cellSize,
          this.cellSize,
          this.cellSize
        );
      }
    }
  }

  onGameOver(score) {
    super.onGameOver(score);
    if (this.ws) {
      this.ws.close();
    }
    this.nostrClient.leaveRoom(this.roomId, this.playerId).catch(console.error);
    console.log(`Game over for player ${this.playerId} with score ${score}`);
  }

  handleGameStateUpdate(event) {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'game_start':
          this.handleGameStart();
          break;
        case 'game_state':
          if (data.playerId !== this.playerId) {
            this.handlePlayerUpdate(data.playerId, data.state);
          }
          break;
        case 'player_joined':
          this.handlePlayerJoined(data.playerId);
          break;
        case 'player_left':
          this.handlePlayerLeft(data.playerId);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling game state update:', error);
    }
  }

  handleGameStart() {
    console.log('Game start signal received');
    this.gameStarted = true;
    super.start(); // Initialize the game
  }
}