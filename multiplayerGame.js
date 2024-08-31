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
  }

  async setupMultiplayerEvents() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${CONFIG.GAME_WEBSOCKET_URL}?roomId=${this.roomId}&playerId=${this.playerId}`);
      
      this.ws.onopen = () => {
        console.log(`Connected to game server for room ${this.roomId}`);
        this.isConnected = true;
        resolve();
      };

      this.ws.onmessage = this.handleGameStateUpdate.bind(this);
      
      this.ws.onclose = () => {
        console.log(`Disconnected from game server for room ${this.roomId}`);
        this.isConnected = false;
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.nostrClient.on('roomJoined', this.handlePlayerJoined.bind(this));
      this.nostrClient.on('roomLeft', this.handlePlayerLeft.bind(this));
    });
  }

  async start() {
    try {
      await this.setupMultiplayerEvents();
      super.start();
      console.log(`Starting multiplayer game in room ${this.roomId}`);
    } catch (error) {
      console.error('Failed to start multiplayer game:', error);
      // Handle the error (e.g., show an error message to the user)
    }
  }

  update() {
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
}
