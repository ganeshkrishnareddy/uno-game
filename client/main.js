import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

// DOM Elements
const screens = {
    lobby: document.getElementById('lobby-screen'),
    room: document.getElementById('room-screen'),
    game: document.getElementById('game-screen')
};

// Lobby Elements
const inPlayerName = document.getElementById('player-name');
const inRoomId = document.getElementById('join-room-id');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const lobbyError = document.getElementById('lobby-error');

// Room Elements
const roomCodeDisplay = document.getElementById('room-code-display');
const waitingPlayersList = document.getElementById('waiting-players-list');
const btnAddAi = document.getElementById('btn-add-ai');
const btnStart = document.getElementById('btn-start');

// Game Elements
const opponentsContainer = document.getElementById('opponents-container');
const discardPile = document.getElementById('discard-pile');
const deck = document.getElementById('deck');
const myHand = document.getElementById('my-hand');
const myNameDisplay = document.getElementById('my-name');
const turnIndicator = document.getElementById('turn-indicator');
const directionIndicator = document.getElementById('direction-indicator');

// Modals
const colorPicker = document.getElementById('color-picker');
const winnerModal = document.getElementById('winner-modal');
const winnerName = document.getElementById('winner-name');
const btnLobbyReturn = document.getElementById('btn-lobby-return');

let currentRoomId = null;
let myId = null;
let gameState = null;
let pendingWildCardId = null;

// Helper: Show Screen
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

// Format Card Symbol
function getCardSymbol(card) {
    if (card.type === 'Number') return card.value;
    if (card.type === 'Skip') return '⊘';
    if (card.type === 'Reverse') return '⇄';
    if (card.type === 'DrawTwo') return '+2';
    if (card.type === 'Wild') return 'W';
    if (card.type === 'WildDrawFour') return '+4';
    return '';
}

// Generate Card DOM
function createCardElement(card, isPlayable = false) {
    const el = document.createElement('div');
    el.className = `card ${card.color || 'Wild'} ${card.type}`;
    
    if (!isPlayable) el.classList.add('disabled');

    const symbol = getCardSymbol(card);
    
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    inner.textContent = symbol;
    
    const miniTop = document.createElement('div');
    miniTop.className = 'card-mini';
    miniTop.textContent = symbol;

    const miniBottom = document.createElement('div');
    miniBottom.className = 'card-mini bottom-right';
    miniBottom.textContent = symbol;

    el.appendChild(miniTop);
    el.appendChild(inner);
    el.appendChild(miniBottom);

    return el;
}

// Connect
socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected', myId);
});

// Lobby Actions
btnCreate.addEventListener('click', () => {
    const name = inPlayerName.value.trim() || 'Player';
    socket.emit('createRoom', { playerName: name });
    myNameDisplay.textContent = name;
});

btnJoin.addEventListener('click', () => {
    const name = inPlayerName.value.trim() || 'Player';
    const room = inRoomId.value.trim().toUpperCase();
    if (room.length > 0) {
        socket.emit('joinRoom', { roomId: room, playerName: name });
        myNameDisplay.textContent = name;
    }
});

socket.on('roomCreated', (roomId) => {
    currentRoomId = roomId;
    roomCodeDisplay.textContent = roomId;
    showScreen('room');
});

socket.on('error', (msg) => {
    lobbyError.textContent = msg;
    setTimeout(() => lobbyError.textContent = '', 3000);
});

// Room Actions
btnAddAi.addEventListener('click', () => {
    if (currentRoomId) socket.emit('addAI', { roomId: currentRoomId });
});

btnStart.addEventListener('click', () => {
    if (currentRoomId) socket.emit('startGame', { roomId: currentRoomId });
});

// Game State Update
socket.on('gameState', (state) => {
    gameState = state;
    currentRoomId = state.roomId;
    
    if (state.status === 'waiting') {
        showScreen('room');
        roomCodeDisplay.textContent = state.roomId;
        renderWaitingList(state.players);
    } else if (state.status === 'playing') {
        showScreen('game');
        renderGame(state);
    } else if (state.status === 'finished') {
        showWinner(state);
    }
});

function renderWaitingList(players) {
    waitingPlayersList.innerHTML = '';
    Object.values(players).forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerHTML = `<span>${p.name}</span> ${p.isAI ? '<span class="ai-badge">AI</span>' : ''}`;
        waitingPlayersList.appendChild(div);
    });
}

function canPlay(card, activeColor, topCard) {
    if (!topCard) return true;
    if (card.type === 'Wild' || card.type === 'WildDrawFour') return true;
    if (card.color === activeColor) return true;
    if (card.type === topCard.type && card.type !== 'Number') return true;
    if (card.type === 'Number' && topCard.type === 'Number' && card.value === topCard.value) return true;
    return false;
}

function renderGame(state) {
    const isMyTurn = state.currentPlayerId === myId;
    if (isMyTurn) turnIndicator.classList.add('active');
    else turnIndicator.classList.remove('active');

    // Direction
    directionIndicator.style.transform = state.direction === 1 ? 'scaleX(1)' : 'scaleX(-1)';

    // Opponents
    opponentsContainer.innerHTML = '';
    Object.values(state.players).forEach(p => {
        if (p.id !== myId) {
            const oppDiv = document.createElement('div');
            oppDiv.className = `opponent ${p.id === state.currentPlayerId ? 'active' : ''}`;
            
            const avatar = document.createElement('div');
            avatar.className = 'opponent-avatar';
            avatar.textContent = p.name.substring(0, 2).toUpperCase();
            
            const cardsDiv = document.createElement('div');
            cardsDiv.className = 'opponent-cards';
            for(let i=0; i < Math.min(p.cardCount, 15); i++) {
                const cMini = document.createElement('div');
                cMini.className = 'opponent-card-mini';
                cardsDiv.appendChild(cMini);
            }
            if (p.cardCount > 15) {
                const more = document.createElement('span');
                more.textContent = `+${p.cardCount - 15}`;
                cardsDiv.appendChild(more);
            }

            oppDiv.appendChild(avatar);
            oppDiv.appendChild(cardsDiv);
            opponentsContainer.appendChild(oppDiv);
        }
    });

    // Discard Pile
    discardPile.innerHTML = '';
    if (state.topCard) {
        const topEl = createCardElement(state.topCard, true);
        // Force color if wild
        if (state.activeColor && (state.topCard.type === 'Wild' || state.topCard.type === 'WildDrawFour')) {
            topEl.style.boxShadow = `0 0 20px var(--uno-${state.activeColor.toLowerCase()})`;
        }
        discardPile.appendChild(topEl);
    }

    // My Hand
    myHand.innerHTML = '';
    const myPlayer = state.players[myId];
    if (myPlayer && myPlayer.hand) {
        myPlayer.hand.forEach(card => {
            const playable = isMyTurn && canPlay(card, state.activeColor, state.topCard);
            const cardEl = createCardElement(card, playable);
            
            if (playable) {
                cardEl.addEventListener('click', () => {
                    if (card.type === 'Wild' || card.type === 'WildDrawFour') {
                        pendingWildCardId = card.id;
                        colorPicker.classList.remove('hidden');
                    } else {
                        socket.emit('playCard', { roomId: currentRoomId, cardId: card.id });
                    }
                });
            }
            myHand.appendChild(cardEl);
        });
    }

    // Deck
    deck.onclick = () => {
        if (isMyTurn) {
            socket.emit('drawCard', { roomId: currentRoomId });
        }
    };
}

// Color Picker
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        if (pendingWildCardId && currentRoomId) {
            socket.emit('playCard', { 
                roomId: currentRoomId, 
                cardId: pendingWildCardId, 
                chosenColor: color 
            });
            pendingWildCardId = null;
            colorPicker.classList.add('hidden');
        }
    });
});

function showWinner(state) {
    const winner = state.players[state.winner];
    winnerName.textContent = winner ? `${winner.name} Wins!` : 'Game Over';
    winnerModal.classList.remove('hidden');
}

btnLobbyReturn.addEventListener('click', () => {
    winnerModal.classList.add('hidden');
    showScreen('lobby');
    currentRoomId = null;
    gameState = null;
});
