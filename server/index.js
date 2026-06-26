const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { UnoGame } = require('./game');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // allow all in dev
        methods: ["GET", "POST"]
    }
});

const games = {}; // roomId -> UnoGame instance

function broadcastGameState(roomId) {
    const game = games[roomId];
    if (!game) return;

    for (const pid of Object.keys(game.players)) {
        if (!game.players[pid].isAI) {
            io.to(pid).emit('gameState', game.getGameState(pid));
        }
    }

    // After state update, check if it's AI's turn
    if (game.status === 'playing') {
        const currentPlayerId = game.turnOrder[game.currentPlayerIndex];
        const currentPlayer = game.players[currentPlayerId];
        
        if (currentPlayer && currentPlayer.isAI) {
            // Give a slight delay for realism
            setTimeout(() => {
                // Ensure it's still their turn and game is playing
                if (game.status !== 'playing' || game.turnOrder[game.currentPlayerIndex] !== currentPlayerId) return;

                const action = game.playAITurn();
                if (action) {
                    if (action.action === 'play') {
                        game.playCard(currentPlayerId, action.cardId, action.chosenColor);
                    } else if (action.action === 'draw') {
                        game.draw(currentPlayerId);
                    }
                    broadcastGameState(roomId);
                }
            }, 1500);
        }
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        games[roomId] = new UnoGame(roomId);
        games[roomId].addPlayer(socket.id, playerName);
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        broadcastGameState(roomId);
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        const game = games[roomId];
        if (!game) {
            socket.emit('error', 'Room not found');
            return;
        }
        if (game.status !== 'waiting') {
            socket.emit('error', 'Game already started');
            return;
        }

        game.addPlayer(socket.id, playerName);
        socket.join(roomId);
        broadcastGameState(roomId);
    });

    socket.on('addAI', ({ roomId }) => {
        const game = games[roomId];
        if (game && game.status === 'waiting') {
            const aiId = 'AI_' + Math.random().toString(36).substring(2, 6);
            game.addPlayer(aiId, `Bot ${Math.floor(Math.random() * 1000)}`, true);
            broadcastGameState(roomId);
        }
    });

    socket.on('startGame', ({ roomId }) => {
        const game = games[roomId];
        if (game && game.status === 'waiting') {
            const started = game.start();
            if (started) {
                broadcastGameState(roomId);
            } else {
                socket.emit('error', 'Need at least 2 players to start');
            }
        }
    });

    socket.on('playCard', ({ roomId, cardId, chosenColor }) => {
        const game = games[roomId];
        if (game) {
            const result = game.playCard(socket.id, cardId, chosenColor);
            if (result.error) {
                socket.emit('error', result.error);
            } else {
                broadcastGameState(roomId);
            }
        }
    });

    socket.on('drawCard', ({ roomId }) => {
        const game = games[roomId];
        if (game) {
            const result = game.draw(socket.id);
            if (result.error) {
                socket.emit('error', result.error);
            } else {
                broadcastGameState(roomId);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find which room user was in
        for (const roomId in games) {
            const game = games[roomId];
            if (game.players[socket.id]) {
                game.removePlayer(socket.id);
                
                // If game is empty or only AI left, clean up
                const humanPlayers = Object.values(game.players).filter(p => !p.isAI);
                if (humanPlayers.length === 0) {
                    delete games[roomId];
                } else {
                    broadcastGameState(roomId);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
