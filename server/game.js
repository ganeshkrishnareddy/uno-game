const COLORS = ['Red', 'Green', 'Blue', 'Yellow'];
const TYPES = {
    NUMBER: 'Number',
    SKIP: 'Skip',
    REVERSE: 'Reverse',
    DRAW_TWO: 'DrawTwo',
    WILD: 'Wild',
    WILD_DRAW_FOUR: 'WildDrawFour'
};

function createDeck() {
    let deck = [];
    let idCounter = 0;

    // Colored cards
    for (const color of COLORS) {
        // 0 card (1 per color)
        deck.push({ id: `card_${idCounter++}`, color, type: TYPES.NUMBER, value: 0 });
        
        // 1-9, Skip, Reverse, DrawTwo (2 per color)
        for (let i = 1; i <= 9; i++) {
            deck.push({ id: `card_${idCounter++}`, color, type: TYPES.NUMBER, value: i });
            deck.push({ id: `card_${idCounter++}`, color, type: TYPES.NUMBER, value: i });
        }
        
        for (let i = 0; i < 2; i++) {
            deck.push({ id: `card_${idCounter++}`, color, type: TYPES.SKIP });
            deck.push({ id: `card_${idCounter++}`, color, type: TYPES.REVERSE });
            deck.push({ id: `card_${idCounter++}`, color, type: TYPES.DRAW_TWO });
        }
    }

    // Wild cards (4 each)
    for (let i = 0; i < 4; i++) {
        deck.push({ id: `card_${idCounter++}`, color: null, type: TYPES.WILD });
        deck.push({ id: `card_${idCounter++}`, color: null, type: TYPES.WILD_DRAW_FOUR });
    }

    return shuffle(deck);
}

function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

class UnoGame {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = {}; // socketId -> { id, name, hand, isAI }
        this.turnOrder = [];
        this.currentPlayerIndex = 0;
        this.direction = 1;
        this.deck = [];
        this.discardPile = [];
        this.status = 'waiting'; // waiting, playing, finished
        this.activeColor = null;
        this.winner = null;
    }

    addPlayer(id, name, isAI = false) {
        if (this.status !== 'waiting') return false;
        if (this.players[id]) return false;
        
        this.players[id] = { id, name, hand: [], isAI };
        this.turnOrder.push(id);
        return true;
    }

    removePlayer(id) {
        if (!this.players[id]) return;
        
        // If playing and someone leaves, they forfeit or we handle it gracefully.
        // For simplicity, just remove them and adjust turn order.
        const idx = this.turnOrder.indexOf(id);
        if (idx !== -1) {
            this.turnOrder.splice(idx, 1);
            if (this.currentPlayerIndex >= this.turnOrder.length) {
                this.currentPlayerIndex = 0;
            }
        }
        delete this.players[id];
        
        if (this.turnOrder.length < 2 && this.status === 'playing') {
            this.status = 'finished';
            this.winner = this.turnOrder[0] || null;
        }
    }

    start() {
        if (this.turnOrder.length < 2) return false;
        
        this.deck = createDeck();
        this.discardPile = [];
        this.direction = 1;
        this.currentPlayerIndex = 0;
        this.status = 'playing';
        this.winner = null;

        // Deal 7 cards to each player
        for (const pid of this.turnOrder) {
            this.players[pid].hand = [];
            for (let i = 0; i < 7; i++) {
                this.players[pid].hand.push(this.drawCard());
            }
        }

        // Draw first card for discard pile (ensure it's not a wild draw four for simplicity)
        let firstCard = this.drawCard();
        while (firstCard.type === TYPES.WILD_DRAW_FOUR) {
            this.deck.push(firstCard);
            this.deck = shuffle(this.deck);
            firstCard = this.drawCard();
        }
        this.discardPile.push(firstCard);
        this.activeColor = firstCard.color || COLORS[Math.floor(Math.random() * COLORS.length)];

        // Handle first card effects
        if (firstCard.type === TYPES.SKIP) {
            this.nextTurn();
        } else if (firstCard.type === TYPES.REVERSE) {
            this.direction = -1;
            if (this.turnOrder.length === 2) {
                this.nextTurn();
            }
        } else if (firstCard.type === TYPES.DRAW_TWO) {
            const nextPid = this.turnOrder[this.currentPlayerIndex];
            this.players[nextPid].hand.push(this.drawCard());
            this.players[nextPid].hand.push(this.drawCard());
            this.nextTurn();
        }

        return true;
    }

    drawCard() {
        if (this.deck.length === 0) {
            // Reshuffle discard pile into deck, keeping top card
            const topCard = this.discardPile.pop();
            this.deck = shuffle(this.discardPile);
            this.discardPile = [topCard];
        }
        return this.deck.pop();
    }

    canPlay(card) {
        const topCard = this.discardPile[this.discardPile.length - 1];
        if (card.type === TYPES.WILD || card.type === TYPES.WILD_DRAW_FOUR) return true;
        if (card.color === this.activeColor) return true;
        if (card.type === topCard.type && card.type !== TYPES.NUMBER) return true;
        if (card.type === TYPES.NUMBER && topCard.type === TYPES.NUMBER && card.value === topCard.value) return true;
        return false;
    }

    playCard(playerId, cardId, chosenColor) {
        if (this.status !== 'playing') return { error: 'Game not in progress' };
        if (this.turnOrder[this.currentPlayerIndex] !== playerId) return { error: 'Not your turn' };

        const player = this.players[playerId];
        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        
        if (cardIndex === -1) return { error: 'Card not in hand' };
        
        const card = player.hand[cardIndex];
        
        if (!this.canPlay(card)) return { error: 'Invalid play' };

        // Play the card
        player.hand.splice(cardIndex, 1);
        this.discardPile.push(card);

        // Check for win
        if (player.hand.length === 0) {
            this.status = 'finished';
            this.winner = playerId;
            return { success: true };
        }

        // Handle card effects
        this.activeColor = card.color;
        
        if (card.type === TYPES.WILD || card.type === TYPES.WILD_DRAW_FOUR) {
            this.activeColor = chosenColor || COLORS[0];
        }

        let skipNext = false;
        
        if (card.type === TYPES.REVERSE) {
            this.direction *= -1;
            if (this.turnOrder.length === 2) {
                skipNext = true; // In 2 player, reverse acts like skip
            }
        } else if (card.type === TYPES.SKIP) {
            skipNext = true;
        } else if (card.type === TYPES.DRAW_TWO) {
            const nextIdx = this.getNextPlayerIndex();
            const nextPid = this.turnOrder[nextIdx];
            this.players[nextPid].hand.push(this.drawCard());
            this.players[nextPid].hand.push(this.drawCard());
            skipNext = true;
        } else if (card.type === TYPES.WILD_DRAW_FOUR) {
            const nextIdx = this.getNextPlayerIndex();
            const nextPid = this.turnOrder[nextIdx];
            for (let i = 0; i < 4; i++) this.players[nextPid].hand.push(this.drawCard());
            skipNext = true;
        }

        this.nextTurn();
        if (skipNext) {
            this.nextTurn();
        }

        return { success: true };
    }

    draw(playerId) {
        if (this.status !== 'playing') return { error: 'Game not in progress' };
        if (this.turnOrder[this.currentPlayerIndex] !== playerId) return { error: 'Not your turn' };

        const card = this.drawCard();
        this.players[playerId].hand.push(card);
        this.nextTurn();
        
        return { success: true, card };
    }

    getNextPlayerIndex() {
        let nextIdx = this.currentPlayerIndex + this.direction;
        if (nextIdx < 0) nextIdx = this.turnOrder.length - 1;
        if (nextIdx >= this.turnOrder.length) nextIdx = 0;
        return nextIdx;
    }

    nextTurn() {
        this.currentPlayerIndex = this.getNextPlayerIndex();
    }

    getGameState(playerId) {
        const topCard = this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null;
        
        // Hide hands of other players
        const safePlayers = {};
        for (const [id, p] of Object.entries(this.players)) {
            safePlayers[id] = {
                id: p.id,
                name: p.name,
                isAI: p.isAI,
                cardCount: p.hand.length,
                hand: id === playerId ? p.hand : undefined
            };
        }

        return {
            roomId: this.roomId,
            status: this.status,
            players: safePlayers,
            turnOrder: this.turnOrder,
            currentPlayerId: this.turnOrder[this.currentPlayerIndex],
            direction: this.direction,
            topCard,
            activeColor: this.activeColor,
            winner: this.winner
        };
    }

    // AI Logic helper
    playAITurn() {
        const aiId = this.turnOrder[this.currentPlayerIndex];
        const aiPlayer = this.players[aiId];
        if (!aiPlayer || !aiPlayer.isAI) return null;

        // Simple AI: play first playable card. If wild, pick random color or most common color in hand.
        let playableCard = null;
        for (const card of aiPlayer.hand) {
            if (this.canPlay(card)) {
                playableCard = card;
                break;
            }
        }

        if (playableCard) {
            let chosenColor = null;
            if (playableCard.type === TYPES.WILD || playableCard.type === TYPES.WILD_DRAW_FOUR) {
                // Pick color AI has most of
                const colorCounts = { Red: 0, Green: 0, Blue: 0, Yellow: 0 };
                for (const c of aiPlayer.hand) {
                    if (c.color) colorCounts[c.color]++;
                }
                chosenColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b);
            }
            return { action: 'play', cardId: playableCard.id, chosenColor };
        } else {
            return { action: 'draw' };
        }
    }
}

module.exports = { UnoGame, COLORS, TYPES };
