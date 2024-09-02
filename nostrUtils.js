export class NostrClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.eventListeners = {};
    this.connectionPromise = null;
  }

  async connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        console.log("WebSocket connected");
        resolve();
      };
      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      };
    });

    return this.connectionPromise;
  }

  async ensureConnected() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
  }

  async fetchProfile(pubkey) {
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).substring(7);
      console.log(`Fetching profile for ${pubkey}`);
      this.ws.send(
        JSON.stringify(["REQ", reqId, { kinds: [0], authors: [pubkey] }])
      );

      const handleMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data[0] === "EVENT" && data[1] === reqId && data[2].content) {
          try {
            const profile = JSON.parse(data[2].content);
            console.log(`Profile fetched for ${pubkey}:`, profile);
            this.ws.removeEventListener("message", handleMessage);
            resolve(profile);
          } catch (error) {
            console.error(`Error parsing profile JSON for ${pubkey}:`, error);
            this.ws.removeEventListener("message", handleMessage);
            resolve({ name: pubkey, picture: null });
          }
        } else if (data[0] === "EOSE" && data[1] === reqId) {
          console.log(`No profile found for ${pubkey}`);
          this.ws.removeEventListener("message", handleMessage);
          resolve({ name: pubkey, picture: null });
        }
      };

      this.ws.addEventListener("message", handleMessage);
    });
  }

  async fetchHighScores() {
    return new Promise((resolve, reject) => {
      const highScores = [];
      const reqId = Math.random().toString(36).substring(7);
      console.log("Fetching high scores");
      this.ws.send(JSON.stringify(["REQ", reqId, { kinds: [69420] }]));

      const handleMessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data[0] === "EVENT" && data[2].kind === 69420) {
          const scoreTag = data[2].tags.find((tag) => tag[0] === "s");
          if (scoreTag) {
            const score = scoreTag[1];
            const pubkey = data[2].pubkey;
            console.log(`Found high score: ${score} for ${pubkey}`);
            const profileData = await this.fetchProfile(pubkey);
            highScores.push({
              name: profileData.name || pubkey,
              picture: profileData.picture,
              score: parseInt(score, 10),
            });
            console.log(
              `Added high score: ${JSON.stringify(
                highScores[highScores.length - 1]
              )}`
            );
          }
        } else if (data[0] === "EOSE" && data[1] === reqId) {
          console.log("Finished fetching high scores");
          this.ws.removeEventListener("message", handleMessage);
          const uniqueScores = this.removeDuplicates(highScores);
          console.log("Unique scores:", uniqueScores);
          resolve(uniqueScores.sort((a, b) => b.score - a.score));
        }
      };

      this.ws.addEventListener("message", handleMessage);
    });
  }

  async postHighScore(npub, score, unlockedEmojis) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);

      ws.onopen = async () => {
        try {
          const event = {
            kind: 69420,
            pubkey: npub,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ["t", "snakegame"],
              ["s", score.toString()],
              ["u", unlockedEmojis.join(",")],
            ],
            content: `I scored ${score} in the snake game! #snakegame`,
          };

          // Sign the event using the window.nostr API
          const signedEvent = await window.nostr.signEvent(event);

          // Send the signed event to the relay
          ws.send(JSON.stringify(["EVENT", signedEvent]));
        } catch (error) {
          reject(error);
        }
      };

      ws.onmessage = (msg) => {
        console.log("High score posted:", msg.data);
        ws.close();
        resolve(msg.data);
      };

      ws.onerror = (error) => {
        console.error("Error posting high score:", error);
        reject(error);
      };
    });
  }

  removeDuplicates(highScores) {
    const seen = new Map();
    return highScores.filter((score) => {
      if (seen.has(score.name)) {
        return seen.get(score.name).score < score.score;
      }
      seen.set(score.name, score);
      return true;
    });
  }

  async fetchUserHighScores(pubkey) {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(7);
      const req = [
        "REQ",
        requestId,
        { kinds: [69420], authors: [pubkey], limit: 50 }, // Increased limit to get more scores
      ];

      this.ws.send(JSON.stringify(req));

      const scores = [];
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Received data:", data);
          if (data[0] === "EVENT" && data[1] === requestId) {
            const scoreTag = data[2].tags.find((tag) => tag[0] === "s");
            if (scoreTag) {
              const score = parseInt(scoreTag[1], 10); // Parse score as integer
              scores.push(score);
              console.log("Added score:", score);
            }
          } else if (data[0] === "EOSE" && data[1] === requestId) {
            this.ws.removeEventListener("message", handler);
            const sortedScores = scores.sort((a, b) => b - a); // Sort scores in descending order
            const topScores = sortedScores.slice(0, 5); // Get top 5 scores
            resolve(topScores);
          }
        } catch (error) {
          console.error("Error processing message:", error);
          reject(error);
        }
      };

      this.ws.addEventListener("message", handler);

      setTimeout(() => {
        this.ws.removeEventListener("message", handler);
        reject(new Error("Timeout fetching user's high scores"));
      }, 5000);
    });
  }

  async createRoom(creatorPubkey) {
    await this.ensureConnected();
    const roomId = Math.random().toString(36).substring(7);
    const event = {
      kind: 30000,
      tags: [
        ['e', roomId],
        ['p', creatorPubkey],
        ['status', 'open']
      ],
      content: JSON.stringify({ type: 'room_created', roomId, status: 'open' })
    };
    await this.publishEvent(event);
    return roomId;
  }

  async joinRoom(roomId, playerPubkey) {
    await this.ensureConnected();
    const event = {
      kind: 30000,
      tags: [
        ['e', roomId],
        ['p', playerPubkey],
        ['action', 'join']
      ],
      content: JSON.stringify({ type: 'room_joined', roomId })
    };
    console.log(`Attempting to join room ${roomId}`);
    
    return new Promise((resolve, reject) => {
      this.publishEvent(event)
        .then((eventId) => {
          console.log(`Published join event for room ${roomId}, event ID: ${eventId}`);
          
          const handleMessage = (messageEvent) => {
            const data = JSON.parse(messageEvent.data);
            if (data[0] === 'OK' && data[1] === eventId) {
              console.log(`Received OK for join event ${eventId}`);
              cleanup();
              this.emit('roomJoined', roomId);
              resolve(roomId);
            } else if (data[0] === 'EVENT' && data[2].kind === 30000 && data[2].tags.find(tag => tag[0] === 'e' && tag[1] === roomId)) {
              console.log(`Received room event confirmation for ${roomId}`);
              cleanup();
              this.emit('roomJoined', roomId);
              resolve(roomId);
            }
          };
  
          const cleanup = () => {
            clearTimeout(timeoutId);
            this.ws.removeEventListener('message', handleMessage);
          };
  
          this.ws.addEventListener('message', handleMessage);
  
          const timeoutId = setTimeout(() => {
            console.warn(`Timeout waiting for join confirmation for event ${eventId}`);
            cleanup();
            // Resolve anyway, assuming the join was successful
            this.emit('roomJoined', roomId);
            resolve(roomId);
          }, 30000); // Increased timeout to 30 seconds
        })
        .catch((error) => {
          console.error('Error publishing join event:', error);
          reject(new Error('Failed to join room'));
        });
    });
  }

  async publishEvent(event) {
    await this.ensureConnected();
    event.created_at = Math.floor(Date.now() / 1000);
    event.pubkey = await window.nostr.getPublicKey();
    const signedEvent = await window.nostr.signEvent(event);
    return new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(['EVENT', signedEvent]));
      const handleOk = (okEvent) => {
        const data = JSON.parse(okEvent.data);
        if (data[0] === 'OK' && data[1] === signedEvent.id) {
          console.log(`Received OK for event ${signedEvent.id}`);
          this.ws.removeEventListener('message', handleOk);
          resolve(signedEvent.id);
        }
      };
      this.ws.addEventListener('message', handleOk);
      // Set a timeout in case we don't receive the OK message
      setTimeout(() => {
        this.ws.removeEventListener('message', handleOk);
        reject(new Error('Timeout waiting for event confirmation'));
      }, 5000);
    });
  }
  
  handleEvent(event) {
    if (event.kind === 30000) {
      const content = JSON.parse(event.content);
      if (content.type === 'room_created') {
        this.emit('roomCreated', content.roomId);
      }
    } else if (event.kind === 30001) {
      const content = JSON.parse(event.content);
      if (content.type === 'room_joined') {
        this.emit('roomJoined', content.roomId);
      }
    }
    // Add more event handling as needed
  }

  on(eventName, callback) {
    if (!this.eventListeners) {
      this.eventListeners = {};
    }
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);
  }

  emit(eventName, data) {
    if (this.eventListeners && this.eventListeners[eventName]) {
      this.eventListeners[eventName].forEach(callback => callback(data));
    }
  }

  async leaveRoom(roomId, playerPubkey) {
    await this.ensureConnected();
    const event = {
      kind: 30002,
      tags: [
        ['e', roomId],
        ['p', playerPubkey]
      ],
      content: JSON.stringify({ type: 'room_left', roomId })
    };
    await this.publishEvent(event);
  }

  async fetchRooms() {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      const rooms = new Map();
      const reqId = Math.random().toString(36).substring(7);
      console.log('Sending request for rooms...');
      this.ws.send(JSON.stringify(["REQ", reqId, { kinds: [30000], limit: 20 }]));

      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received data:', data);
          if (data[0] === "EVENT" && data[2].kind === 30000) {
            const eventData = data[2];
            console.log('Processing event data:', eventData);
            
            // Try to parse the content as JSON
            let contentData;
            try {
              contentData = JSON.parse(eventData.content);
            } catch (e) {
              console.log('Content is not valid JSON:', eventData.content);
              contentData = { timestamp: eventData.content };
            }

            // Use the event ID as the room ID if 'e' tag is not present
            const roomId = eventData.tags.find(tag => tag[0] === 'e')?.[1] || eventData.id;
            const status = eventData.tags.find(tag => tag[0] === 'status')?.[1] || 'open';

            console.log('Extracted room data:', { roomId, status, contentData });

            // Consider all rooms as 'open' for now
            if (roomId) {
              rooms.set(roomId, { 
                id: roomId, 
                creator: eventData.pubkey,
                createdAt: eventData.created_at,
                content: contentData
              });
              console.log('Added room:', rooms.get(roomId));
            } else {
              console.log('Skipped room due to missing ID');
            }
          } else if (data[0] === "EOSE" && data[1] === reqId) {
            console.log('Finished fetching rooms, total:', rooms.size);
            this.ws.removeEventListener("message", handleMessage);
            resolve(Array.from(rooms.values()));
          }
        } catch (error) {
          console.error('Error parsing room data:', error);
        }
      };

      this.ws.addEventListener("message", handleMessage);

      // Set a timeout in case the EOSE event is not received
      setTimeout(() => {
        console.log('Timeout reached, resolving with current rooms:', Array.from(rooms.values()));
        this.ws.removeEventListener("message", handleMessage);
        resolve(Array.from(rooms.values()));
      }, 5000);
    });
  }

  async fetchRoomDetails(roomId) {
    await this.ensureConnected();
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).substring(7);
      console.log(`Fetching details for room ${roomId}`);
      this.ws.send(JSON.stringify(["REQ", reqId, { 
        kinds: [30000],
        "#e": [roomId],
        limit: 1
      }]));
  
      const handleMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data[0] === "EVENT" && data[1] === reqId) {
          const roomEvent = data[2];
          console.log(`Room details received for ${roomId}:`, roomEvent);
          this.ws.removeEventListener("message", handleMessage);
          resolve({
            id: roomId,
            creator: roomEvent.pubkey,
            createdAt: roomEvent.created_at,
            content: JSON.parse(roomEvent.content)
          });
        } else if (data[0] === "EOSE" && data[1] === reqId) {
          console.log(`No details found for room ${roomId}`);
          this.ws.removeEventListener("message", handleMessage);
          reject(new Error("Room not found"));
        }
      };
  
      this.ws.addEventListener("message", handleMessage);
  
      // Set a timeout in case we don't receive a response
      setTimeout(() => {
        this.ws.removeEventListener("message", handleMessage);
        reject(new Error("Timeout fetching room details"));
      }, 5000);
    });
  }

  async sendMessage(roomId, message) {
    await this.ensureConnected();
    const event = {
      kind: 30000, // You might want to use a different kind for messages
      tags: [
        ['e', roomId],
        ['p', await window.nostr.getPublicKey()]
      ],
      content: JSON.stringify(message)
    };
    return this.publishEvent(event);
  }

  
  async fetchRoomPlayers(roomId) {
    await this.ensureConnected();
    return new Promise((resolve) => {
      const reqId = Math.random().toString(36).substring(7);
      console.log(`Fetching players for room ${roomId}`);
      this.ws.send(JSON.stringify(["REQ", reqId, { 
        kinds: [30000],
        "#e": [roomId],
        since: Math.floor(Date.now() / 1000) - 3600 // Look for events in the last hour
      }]));
  
      const players = new Set();
      const readyPlayers = new Set();
      const handleMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data[0] === "EVENT" && data[1] === reqId) {
          const playerEvent = data[2];
          const playerPubkey = playerEvent.pubkey;
          const content = JSON.parse(playerEvent.content);
          if (content.type === 'room_joined') {
            players.add(playerPubkey);
          } else if (content.type === 'player_ready') {
            readyPlayers.add(playerPubkey);
          }
        } else if (data[0] === "EOSE" && data[1] === reqId) {
          console.log(`Players found for room ${roomId}:`, Array.from(players));
          console.log(`Ready players for room ${roomId}:`, Array.from(readyPlayers));
          cleanup();
          resolve({ players: Array.from(players), readyPlayers: Array.from(readyPlayers) });
        }
      };
        
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.ws.removeEventListener("message", handleMessage);
      };
  
      this.ws.addEventListener("message", handleMessage);
  
      const timeoutId = setTimeout(() => {
        console.warn(`Timeout reached while fetching players for room ${roomId}`);
        cleanup();
        resolve({ players: Array.from(players), readyPlayers: Array.from(readyPlayers) });
      }, 15000); // Increased timeout to 15 seconds
    });
  }
}