export class MultiplayerClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.eventListeners = new Map();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.onmessage = this.handleMessage.bind(this);
    this.socket.onopen = () => this.emit('connected');
    this.socket.onclose = () => this.emit('disconnected');
    this.socket.onerror = (error) => this.emit('error', error);
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    this.emit(message.type, message.data);
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => callback(data));
    }
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  send(type, data) {
    this.socket.send(JSON.stringify({ type, data }));
  }

  joinRoom(roomId, playerId) {
    this.send('joinRoom', { roomId, playerId });
  }

  leaveRoom() {
    this.send('leaveRoom');
  }

  sendGameState(state) {
    this.send('gameState', state);
  }
}
