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
      content: JSON.stringify({ type: 'room_created', roomId })
    };
    await this.publishEvent(event);
    return roomId;
  }

  async joinRoom(roomId, playerPubkey) {
    await this.ensureConnected();
    const event = {
      kind: 30001,
      tags: [
        ['e', roomId],
        ['p', playerPubkey]
      ],
      content: JSON.stringify({ type: 'room_joined', roomId })
    };
    await this.publishEvent(event);
  }

  async publishEvent(event) {
    await this.ensureConnected();
    event.created_at = Math.floor(Date.now() / 1000);
    event.pubkey = await window.nostr.getPublicKey();
    const signedEvent = await window.nostr.signEvent(event);
    this.ws.send(JSON.stringify(['EVENT', signedEvent]));
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
      const rooms = [];
      const reqId = Math.random().toString(36).substring(7);
      this.ws.send(JSON.stringify(["REQ", reqId, { kinds: [30000], limit: 20 }]));

      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data[0] === "EVENT" && data[2].kind === 30000) {
            const eventData = data[2];
            const roomId = eventData.tags.find(tag => tag[0] === 'e')?.[1];
            if (roomId) {
              rooms.push({ id: roomId, creator: eventData.pubkey });
            }
          } else if (data[0] === "EOSE" && data[1] === reqId) {
            this.ws.removeEventListener("message", handleMessage);
            resolve(rooms);
          }
        } catch (error) {
          console.error('Error parsing room data:', error);
        }
      };

      this.ws.addEventListener("message", handleMessage);

      // Set a timeout in case the EOSE event is not received
      setTimeout(() => {
        this.ws.removeEventListener("message", handleMessage);
        resolve(rooms);
      }, 5000);
    });
  }
}
