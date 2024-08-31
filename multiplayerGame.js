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
    this.ws = new WebSocket(`${CONFIG.GAME_WEBSOCKET_URL}?roomId=${roomId}&playerId=${playerId}`);
    this.setupMultiplayerEvents();
  }

  setupMultiplayerEvents() {
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'game_state') {
        this.handlePlayerUpdate(data.playerId, data.state);
      }
    };

    this.nostrClient.on('playerJoined', this.handlePlayerJoined.bind(this));
    this.nostrClient.on('playerLeft', this.handlePlayerLeft.bind(this));
  }

  start() {
    super.start();
    console.log(`Starting multiplayer game in room ${this.roomId}`);
  }

  update() {
    super.update();
    this.sendGameState();
  }

  sendGameState() {
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
    this.nostrClient.postHighScore(this.playerId, score);
    console.log(`Game over for player ${this.playerId} with score ${score}`);
  }
}
