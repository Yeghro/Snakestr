import { NostrClient } from './nostrUtils.js';
import { CONFIG } from './config.js';

export class Lobby {
  constructor(npub, startGameCallback, returnToSinglePlayerCallback) {
    this.npub = npub;
    this.startGameCallback = startGameCallback;
    this.returnToSinglePlayerCallback = returnToSinglePlayerCallback;
    this.rooms = [];
    this.nostrClient = new NostrClient(CONFIG.WEBSOCKET_URL);
    this.setupEventListeners();
  }

  async setupEventListeners() {
    await this.nostrClient.connect();

    const createRoomButton = document.getElementById('create-room');
    const backToMenuButton = document.getElementById('back-to-menu');

    createRoomButton.addEventListener('click', () => this.createRoom());
    backToMenuButton.addEventListener('click', () => this.returnToSinglePlayer());

    this.nostrClient.on('roomCreated', this.handleRoomCreated.bind(this));
    this.nostrClient.on('roomJoined', this.handleRoomJoined.bind(this));
  }
  
  async createRoom() {
    const roomId = await this.nostrClient.createRoom(this.npub);
    console.log('Creating a new room:', roomId);
  }

  async joinRoom(roomId) {
    await this.nostrClient.joinRoom(roomId, this.npub);
    console.log(`Joining room ${roomId}`);
  }

  handleRoomCreated(roomId) {
    console.log(`Room created: ${roomId}`);
    this.joinRoom(roomId);
  }

  handleRoomJoined(roomId) {
    console.log(`Joined room: ${roomId}`);
    this.startGameCallback(roomId);
  }

  returnToSinglePlayer() {
    this.returnToSinglePlayerCallback();
  }

  updateRoomList(rooms) {
    this.rooms = rooms;
    const roomListElement = document.getElementById('room-list');
    roomListElement.innerHTML = '';
    rooms.forEach(room => {
      const roomElement = document.createElement('div');
      roomElement.textContent = `Room ${room.id} (${room.players}/${room.maxPlayers})`;
      const joinButton = document.createElement('button');
      joinButton.textContent = 'Join';
      joinButton.addEventListener('click', () => this.joinRoom(room.id));
      roomElement.appendChild(joinButton);
      roomListElement.appendChild(roomElement);
    });
  }
}
