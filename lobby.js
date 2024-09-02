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
    this.updateRoomListInterval = null;
    this.lobbyContainer = document.getElementById('lobby-container');
    this.roomListElement = document.getElementById('room-list');
    this.players = new Set();
    this.readyPlayers = new Set();
    this.currentRoomId = null;
    this.playerUpdateInterval = null;

    this.nostrClient.on('playerListUpdate', this.handlePlayerListUpdate.bind(this));
    this.nostrClient.on('roomJoined', this.handleRoomJoined.bind(this));

    if (!this.lobbyContainer || !this.roomListElement) {
      console.error('Lobby container or room list element not found');
      return;
    }

    this.setupEventListeners();
    this.updateRoomList();
  }

  async setupEventListeners() {
    await this.nostrClient.connect();

    const createRoomButton = document.getElementById('create-room');
    const backToMenuButton = document.getElementById('back-to-menu');
    const refreshRoomListButton = document.getElementById('refresh-room-list');

    createRoomButton.addEventListener('click', () => this.createRoom());
    backToMenuButton.addEventListener('click', () => this.returnToSinglePlayer());
    refreshRoomListButton.addEventListener('click', () => this.updateRoomList());

    this.nostrClient.on('roomCreated', this.handleRoomCreated.bind(this));
    // Start periodic room list updates
    this.updateRoomListInterval = setInterval(() => this.updateRoomList(), 10000); // Update every 10 seconds
  }

  async showWaitingRoom(roomId) {
    console.log(`Showing waiting room for room: ${roomId}`);
    this.currentRoomId = roomId;
    this.lobbyContainer.innerHTML = `
      <h2>Waiting Room</h2>
      <p>Room ID: ${roomId}</p>
      <p>Waiting for other players to join...</p>
      <div id="player-list">Loading players...</div>
      <button id="ready-button">Ready</button>
      <button id="leave-room">Leave Room</button>
    `;
  
    document.getElementById('ready-button').addEventListener('click', () => this.setPlayerReady(roomId));
    document.getElementById('leave-room').addEventListener('click', () => this.leaveRoom(roomId));
  
    await this.updatePlayerList(roomId);
    this.checkRoomCreator(roomId); // Check if the current player is the room creator
    // Start periodic updates with a longer interval
    this.playerUpdateInterval = setInterval(() => this.updatePlayerList(roomId), 10000); // Update every 10 seconds
  }
  
  setPlayerReady(roomId) {
    console.log(`Player ${this.npub} is ready in room ${roomId}`);
    this.nostrClient.sendMessage(roomId, { type: 'player_ready', playerId: this.npub })
      .then(() => {
        document.getElementById('ready-button').disabled = true;
        this.readyPlayers.add(this.npub);
        this.renderPlayerList();
        this.checkGameStart(); // Check if we can start the game immediately
      })
      .catch(error => {
        console.error('Error setting player ready:', error);
        alert('Failed to set ready status. Please try again.');
      });
  }

  async updatePlayerList(roomId) {
    const playerListElement = document.getElementById('player-list');
    if (!playerListElement) {
      console.warn('Player list element not found');
      return;
    }
  
    playerListElement.innerHTML = 'Fetching players...';
  
    try {
      const { players, readyPlayers } = await this.nostrClient.fetchRoomPlayers(roomId);
      console.log('Fetched players:', players);
      console.log('Ready players:', readyPlayers);
  
      const newPlayers = new Set(players);
      const newReadyPlayers = new Set(readyPlayers);
  
      // Check if there are any changes in the player list or ready status
      const playersChanged = this.hasSetChanged(this.players, newPlayers);
      const readyStatusChanged = this.hasSetChanged(this.readyPlayers, newReadyPlayers);
  
      if (playersChanged || readyStatusChanged) {
        this.players = newPlayers;
        this.readyPlayers = newReadyPlayers;
        this.renderPlayerList();
      }
  
      // Add the current player if not in the list
      if (!this.players.has(this.npub)) {
        this.players.add(this.npub);
        this.renderPlayerList();
      }
  
      // Check if we should start the game
      this.checkGameStart();
    } catch (error) {
      console.error('Error updating player list:', error);
      playerListElement.innerHTML = '<p>Error fetching players. Please try refreshing.</p>';
    }
  }
  
  checkGameStart() {
    if (this.players.size === 2 && this.readyPlayers.size === 2) {
      console.log('All players are ready. Starting the game...');
      this.startMultiplayerGame(this.currentRoomId);
    }
  }

  hasSetChanged(oldSet, newSet) {
    if (oldSet.size !== newSet.size) return true;
    for (let item of oldSet) {
      if (!newSet.has(item)) return true;
    }
    return false;
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
      console.log(`Attempting to join room ${roomId}`);
      await this.nostrClient.joinRoom(roomId, this.npub);
      console.log(`Joined room ${roomId}`);
      this.showWaitingRoom(roomId);
    } catch (error) {
      console.error('Error joining room:', error);
      alert(`Failed to join room: ${error.message}`);
    }
  }

  handleRoomCreated(roomId) {
    console.log(`Room created: ${roomId}`);
    this.joinRoom(roomId);
  }

  handleRoomJoined(roomId) {
    console.log(`Successfully joined room ${roomId}`);
    this.showWaitingRoom(roomId);
  }

  async startMultiplayerGame(roomId) {
    clearInterval(this.playerUpdateInterval);

    if (this.players.size !== 2 || this.readyPlayers.size !== 2) {
      console.log('Not all players are ready. Waiting...');
      return;
    }

    const game = new MultiplayerGame('game-canvas', roomId, this.npub);
    await game.start();
    this.startGameCallback(roomId);
  }

  returnToSinglePlayer() {
    clearInterval(this.updateRoomListInterval);
    this.returnToSinglePlayerCallback();
  }

  async checkRoomCreator(roomId) {
    try {
      const roomDetails = await this.nostrClient.fetchRoomDetails(roomId);
      if (roomDetails.creator === this.npub) {
        const startGameButton = document.createElement('button');
        startGameButton.id = 'start-game';
        startGameButton.textContent = 'Start Game';
        startGameButton.className = 'btn btn-primary';
        startGameButton.addEventListener('click', () => this.startMultiplayerGame(roomId));
        this.lobbyContainer.appendChild(startGameButton);
      }
    } catch (error) {
      console.error('Error checking room creator:', error);
    }
  }

  leaveRoom(roomId) {
    clearInterval(this.playerUpdateInterval);

    try {
      this.nostrClient.leaveRoom(roomId, this.npub);
      console.log(`Left room ${roomId}`);
      this.showLobby();
    } catch (error) {
      console.error('Error leaving room:', error);
      // Show error message to user
    }
  }

  showLobby() {
    this.lobbyContainer.innerHTML = `
      <h1>Multiplayer Lobby</h1>
      <div id="room-list"></div>
      <button id="create-room" class="btn btn-primary">Create Room</button>
      <button id="refresh-room-list" class="btn btn-secondary">Refresh Room List</button>
      <button id="back-to-menu" class="btn btn-secondary">Back to Menu</button>
    `;

    this.roomListElement = document.getElementById('room-list');
    document.getElementById('create-room').addEventListener('click', () => this.createRoom());
    document.getElementById('refresh-room-list').addEventListener('click', () => this.updateRoomList());
    document.getElementById('back-to-menu').addEventListener('click', () => this.returnToSinglePlayer());

    this.updateRoomList();
  }

  async updateRoomList() {
    if (!this.roomListElement) {
      console.warn('Room list element not found. Skipping update.');
      return;
    }

    try {
      console.log('Fetching rooms...');
      const rooms = await this.nostrClient.fetchRooms();
      console.log('Fetched rooms:', rooms);

      this.roomListElement.innerHTML = '';

      if (!Array.isArray(rooms) || rooms.length === 0) {
        console.log('No rooms found or invalid room data');
        this.roomListElement.innerHTML = '<p>No active rooms found. Create a new room to start playing!</p>';
        return;
      }

      rooms.forEach(room => {
        console.log('Processing room:', room);
        const roomElement = document.createElement('div');
        roomElement.className = 'room-item';
        const createdAt = new Date(room.createdAt * 1000).toLocaleString();
        roomElement.innerHTML = `
          <span>Room ${room.id.substring(0, 8)}... (Created by: ${room.creator.substring(0, 8)}...)</span>
          <span>Created at: ${createdAt}</span>
          <button class="btn btn-sm btn-primary join-room-btn">Join</button>
        `;
        const joinButton = roomElement.querySelector('.join-room-btn');
        joinButton.addEventListener('click', () => this.joinRoom(room.id));
        this.roomListElement.appendChild(roomElement);
      });

      console.log('Room list updated');
    } catch (error) {
      console.error('Error fetching rooms:', error);
      if (this.roomListElement) {
        this.roomListElement.innerHTML = '<p>Error fetching room list. Please try again later.</p>';
      }
    }
  }

  renderPlayerList() {
    const playerListElement = document.getElementById('player-list');
    if (playerListElement) {
      if (this.players.size > 0) {
        playerListElement.innerHTML = '<h3>Players:</h3>' + 
          Array.from(this.players).map(player => 
            `<p>${player.substring(0, 8)}... ${this.readyPlayers.has(player) ? '(Ready)' : '(Not Ready)'}</p>`
          ).join('');
      } else {
        playerListElement.innerHTML = '<p>No players in the room yet.</p>';
      }
    } else {
      console.error('Player list element not found when rendering');
    }

    const readyButton = document.getElementById('ready-button');
    if (readyButton) {
      readyButton.disabled = this.readyPlayers.has(this.npub);
    }
  }

  handlePlayerListUpdate(data) {
    if (data.roomId === this.currentRoomId) {
      this.players = new Set(data.players);
      this.readyPlayers = new Set(data.readyPlayers);
      this.renderPlayerList();
    }
  }
}