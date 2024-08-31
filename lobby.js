import { NostrClient } from './nostrUtils.js';
import { CONFIG } from './config.js';
import { MultiplayerGame } from './multiplayerGame.js';

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
    try {
      const roomId = await this.nostrClient.createRoom(this.npub);
      console.log('Creating a new room:', roomId);
      this.showWaitingRoom(roomId);
    } catch (error) {
      console.error('Error creating room:', error);
      // Show error message to user
    }
  }

  async joinRoom(roomId) {
    try {
      await this.nostrClient.joinRoom(roomId, this.npub);
      console.log(`Joining room ${roomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      // Show error message to user
    }
  }

  handleRoomCreated(roomId) {
    console.log(`Room created: ${roomId}`);
    this.joinRoom(roomId);
  }

  handleRoomJoined(roomId) {
    console.log(`Joined room: ${roomId}`);
    this.startMultiplayerGame(roomId);
  }

  startMultiplayerGame(roomId) {
    const game = new MultiplayerGame('game-canvas', roomId, this.npub);
    game.start();
    this.startGameCallback(roomId);
  }

  returnToSinglePlayer() {
    this.returnToSinglePlayerCallback();
  }

  showWaitingRoom(roomId) {
    const lobbyContainer = document.getElementById('lobby-container');
    lobbyContainer.innerHTML = `
      <h2>Waiting Room</h2>
      <p>Room ID: ${roomId}</p>
      <p>Waiting for other players to join...</p>
      <button id="start-game">Start Game</button>
      <button id="leave-room">Leave Room</button>
    `;
    
    document.getElementById('start-game').addEventListener('click', () => this.startMultiplayerGame(roomId));
    document.getElementById('leave-room').addEventListener('click', () => this.leaveRoom(roomId));
  }

  async leaveRoom(roomId) {
    try {
      await this.nostrClient.leaveRoom(roomId, this.npub);
      console.log(`Left room ${roomId}`);
      this.showLobby();
    } catch (error) {
      console.error('Error leaving room:', error);
      // Show error message to user
    }
  }

  showLobby() {
    const lobbyContainer = document.getElementById('lobby-container');
    lobbyContainer.innerHTML = `
      <h2>Multiplayer Lobby</h2>
      <div id="room-list"></div>
      <button id="create-room">Create Room</button>
      <button id="back-to-menu">Back to Menu</button>
    `;
    
    document.getElementById('create-room').addEventListener('click', () => this.createRoom());
    document.getElementById('back-to-menu').addEventListener('click', () => this.returnToSinglePlayer());
    
    this.updateRoomList();
  }

  async updateRoomList() {
    try {
      const rooms = await this.nostrClient.fetchRooms();
      const roomListElement = document.getElementById('room-list');
      roomListElement.innerHTML = '';
      rooms.forEach(room => {
        const roomElement = document.createElement('div');
        roomElement.textContent = `Room ${room.id} (Created by: ${room.creator})`;
        const joinButton = document.createElement('button');
        joinButton.textContent = 'Join';
        joinButton.addEventListener('click', () => this.joinRoom(room.id));
        roomElement.appendChild(joinButton);
        roomListElement.appendChild(roomElement);
      });
    } catch (error) {
      console.error('Error fetching rooms:', error);
      // Show error message to user
    }
  }
}
