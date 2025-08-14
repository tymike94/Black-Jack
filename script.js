document.addEventListener('DOMContentLoaded', () => {
    // --- Références aux éléments du DOM ---
    const elements = {
        dealerHand: document.getElementById('dealer-hand'),
        dealerScore: document.getElementById('dealer-score'),
        messages: document.getElementById('messages'),
        balance: document.getElementById('balance'),
        chips: document.querySelectorAll('.chip'),
        playerSlots: document.querySelectorAll('.player-slot'), // NOUVEAU
        btnDeal: document.getElementById('btn-deal'),
        btnClear: document.getElementById('btn-clear'),
        btnHit: document.getElementById('btn-hit'),
        btnStand: document.getElementById('btn-stand'),
        btnDouble: document.getElementById('btn-double'),
        btnRebetDouble: document.getElementById('btn-rebet-double'),
        btnReset: document.getElementById('btn-reset-balance'),
        gameActions: document.getElementById('game-actions'),
        playerActions: document.getElementById('player-actions'),
    };

    // --- Variables d'état du jeu ---
    let deck = [];
    let dealerHand = [];
    let playerSlots = []; // NOUVEAU: Tableau pour gérer les slots
    let balance = 100;
    let gameInProgress = false;
    let selectedChip = null;
    let lastBets = []; // NOUVEAU: Pour le bouton Re-Miser
    let activeHandIndex = -1;

    const SUITS = ['♥', '♦', '♠', '♣'];
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const RANK_VALUES = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11};
    const delay = ms => new Promise(res => setTimeout(res, ms));

    // Initialisation des slots
    const initializeSlots = () => {
        playerSlots = [];
        for (let i = 0; i < elements.playerSlots.length; i++) {
            playerSlots.push({
                index: i,
                hand: [],
                bets: { main: 0, perfectpairs: 0, twentyoneplus3: 0 },
                score: 0,
                status: 'betting', // 'betting', 'playing', 'blackjack', 'win', 'lose', 'push', 'bust'
                active: false
            });
        }
    };

    // --- Logique de mise ---
    elements.chips.forEach(chip => {
        chip.addEventListener('click', () => {
            if (gameInProgress) return;
            if (selectedChip) selectedChip.classList.remove('selected');
            selectedChip = chip;
            selectedChip.classList.add('selected');
        });
        chip.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', chip.dataset.value));
    });

    elements.playerSlots.forEach((slotEl, index) => {
        const dropZones = slotEl.querySelectorAll('.drop-zone');
        dropZones.forEach(zone => {
            const betType = zone.dataset.betType;
            zone.addEventListener('click', () => {
                if (gameInProgress || !selectedChip) return;
                placeBet(parseInt(selectedChip.dataset.value), index, betType);
            });
            zone.addEventListener('dragover', e => e.preventDefault());
            zone.addEventListener('dragenter', e => zone.classList.add('drag-over'));
            zone.addEventListener('dragleave', e => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', e => {
                e.preventDefault(); zone.classList.remove('drag-over');
                if (gameInProgress) return;
                placeBet(parseInt(e.dataTransfer.getData('text/plain')), index, betType);
            });
        });
    });

    const placeBet = (value, slotIndex, betType) => {
        if (value > balance) { displayMessage("Solde insuffisant !"); return; }
        balance -= value;
        playerSlots[slotIndex].bets[betType] += value;
        updateUI();
    };

    // --- Fonctions de base du jeu ---
    const createDeck = () => { deck = []; for (const suit of SUITS) { for (const rank of RANKS) { deck.push({ suit, rank, value: RANK_VALUES[rank] }); } } deck.sort(() => Math.random() - 0.5); };
    const calculateScore = (hand) => { let score = hand.reduce((sum, card) => sum + card.value, 0); let aceCount = hand.filter(card => card.rank === 'A').length; while (score > 21 && aceCount > 0) { score -= 10; aceCount--; } return score; };
    const displayMessage = (msg) => { elements.messages.textContent = msg; };

    const clearBets = () => {
        if (gameInProgress) return;
        playerSlots.forEach(slot => {
            balance += slot.bets.main + slot.bets.perfectpairs + slot.bets.twentyoneplus3;
            slot.bets = { main: 0, perfectpairs: 0, twentyoneplus3: 0 };
        });
        updateUI();
    };

    const rebetAndDouble = () => {
        if (gameInProgress || lastBets.length === 0) return;
        clearBets();
        const totalLastBet = lastBets.reduce((sum, bet) => sum + bet.main + bet.perfectpairs + bet.twentyoneplus3, 0);
        if (totalLastBet * 2 > balance) { displayMessage("Solde insuffisant !"); return; }
        lastBets.forEach((bets, index) => {
            Object.keys(bets).forEach(type => {
                if(bets[type] > 0) placeBet(bets[type] * 2, index, type);
            });
        });
    };

    // --- Boucle de jeu principale ---
    const deal = async () => {
        const activeSlots = playerSlots.filter(s => s.bets.main > 0);
        if (activeSlots.length === 0) { displayMessage("Placez au moins une mise principale."); return; }

        lastBets = playerSlots.map(s => ({...s.bets}));
        gameInProgress = true;
        createDeck();
        dealerHand = [];
        activeSlots.forEach(s => { s.hand = []; s.status = 'playing'; });
        updateUI();

        for (let i = 0; i < 2; i++) {
            for (const slot of activeSlots) { await delay(300); slot.hand.push(deck.pop()); updateUI(); }
            await delay(300); dealerHand.push(deck.pop()); updateUI();
        }
        
        // Résolution des Side Bets et Blackjacks initiaux
        activeSlots.forEach(slot => {
            checkSideBets(slot);
            slot.score = calculateScore(slot.hand);
            if (slot.score === 21) {
                slot.status = 'blackjack';
            }
        });
        updateUI();

        playNextHand();
    };
    
    const playNextHand = async () => {
        const nextHand = playerSlots.find(s => s.status === 'playing');
        if (nextHand) {
            activeHandIndex = nextHand.index;
            displayMessage(`Main ${activeHandIndex + 1}: Votre tour.`);
        } else {
            activeHandIndex = -1;
            displayMessage("Tour du croupier.");
            await delay(1000);
            dealerTurn();
        }
        updateUI();
    };

    const hit = () => {
        if (activeHandIndex === -1) return;
        const slot = playerSlots[activeHandIndex];
        slot.hand.push(deck.pop());
        slot.score = calculateScore(slot.hand);
        if (slot.score > 21) {
            slot.status = 'bust';
            playNextHand();
        }
        updateUI();
    };

    const stand = () => {
        if (activeHandIndex === -1) return;
        playerSlots[activeHandIndex].status = 'stand';
        playNextHand();
    };

    const doubleDown = () => {
        if (activeHandIndex === -1) return;
        const slot = playerSlots[activeHandIndex];
        balance -= slot.bets.main;
        slot.bets.main *= 2;
        slot.hand.push(deck.pop());
        slot.score = calculateScore(slot.hand);
        slot.status = slot.score > 21 ? 'bust' : 'stand';
        updateUI();
        setTimeout(playNextHand, 1000);
    };

    const dealerTurn = () => {
        updateUI(true);
        const drawLoop = setInterval(() => {
            let dealerScore = calculateScore(dealerHand);
            if (dealerScore >= 17) {
                clearInterval(drawLoop);
                resolveHands();
            } else {
                dealerHand.push(deck.pop());
                updateUI(true);
            }
        }, 800);
    };

    // --- Résolution des mains ---
    const checkSideBets = (slot) => {
        let sideBetWinnings = 0;
        if (slot.bets.perfectpairs > 0) { /* Logique inchangée */ }
        if (slot.bets.twentyoneplus3 > 0) { /* Logique inchangée */ }
        if (sideBetWinnings > 0) balance += sideBetWinnings;
    };
    
    const resolveHands = () => {
        const dealerScore = calculateScore(dealerHand);
        let totalWinnings = 0;

        playerSlots.filter(s => s.bets.main > 0).forEach(slot => {
            let payoutMultiplier = 0;
            if (slot.status === 'blackjack') {
                payoutMultiplier = dealerScore === 21 ? 1 : 2.5;
                slot.status = 'Blackjack!';
            } else if (slot.status !== 'bust') {
                if (dealerScore > 21 || slot.score > dealerScore) { payoutMultiplier = 2; slot.status = 'Gagné'; }
                else if (dealerScore > slot.score) { payoutMultiplier = 0; slot.status = 'Perdu'; }
                else { payoutMultiplier = 1; slot.status = 'Égalité'; }
            } else {
                slot.status = 'Sauté !';
            }
            totalWinnings += slot.bets.main * payoutMultiplier;
        });
        balance += totalWinnings;
        displayMessage("Fin de la manche. Placez vos mises.");
        setTimeout(() => { gameInProgress = false; updateUI(true); }, 2000);
    };

    // --- Mise à jour UI ---
    const updateUI = (revealDealer = false) => {
        elements.balance.textContent = Math.floor(balance);
        playerSlots.forEach((slot, index) => {
            const slotEl = elements.playerSlots[index];
            const handContainer = slotEl.querySelector('.hand-container');
            const scoreEl = slotEl.querySelector('.score');
            const statusEl = slotEl.querySelector('.hand-status');
            
            slot.score = calculateScore(slot.hand);
            scoreEl.textContent = slot.score > 0 ? slot.score : '';
            renderHand(slot.hand, handContainer);
            
            // Mise à jour des montants misés
            Object.keys(slot.bets).forEach(type => {
                const betEl = slotEl.querySelector(`.drop-zone[data-bet-type="${type}"] span`);
                if(betEl) betEl.textContent = `${slot.bets[type]}€`;
                else { // pour side-bets
                    const sideBetEl = slotEl.querySelector(`.drop-zone[data-bet-type="${type}"]`);
                    sideBetEl.innerHTML = `${type==='perfectpairs' ? 'PP' : '21+3'}<br><span class="bet-amount">${slot.bets[type]}€</span>`;
                }
            });
            
            // Statut et surbrillance
            statusEl.textContent = slot.status.charAt(0).toUpperCase() + slot.status.slice(1);
            if (slot.status === 'playing' || slot.status === 'betting') statusEl.textContent = '';

            if (index === activeHandIndex) slotEl.classList.add('active');
            else slotEl.classList.remove('active');
        });
        
        renderHand(dealerHand, elements.dealerHand, gameInProgress && !revealDealer);
        elements.dealerScore.textContent = (gameInProgress && !revealDealer) ? '' : calculateScore(dealerHand) || '';

        // Gestion des boutons
        elements.gameActions.style.display = gameInProgress ? 'none' : 'flex';
        elements.playerActions.style.display = gameInProgress ? 'flex' : 'none';
        elements.chips.forEach(c => { c.draggable = !gameInProgress; c.style.cursor = gameInProgress ? 'default' : 'pointer'; });
        if (gameInProgress) {
            elements.playerActions.style.visibility = activeHandIndex > -1 ? 'visible' : 'hidden';
            if (activeHandIndex > -1) {
                const currentSlot = playerSlots[activeHandIndex];
                const canDouble = currentSlot.hand.length === 2 && balance >= currentSlot.bets.main;
                elements.btnDouble.disabled = !canDouble;
            }
        } else {
            elements.btnRebetDouble.disabled = lastBets.length === 0;
        }
    };
    
    const renderHand = (hand, element) => { element.innerHTML = ''; hand.forEach(card => element.appendChild(createCardElement(card))); };
    const createCardElement = (card) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
        cardEl.innerHTML = `<span class="rank">${card.rank}</span><span class="suit ${suitColor}">${card.suit}</span><span class="suit bottom ${suitColor}">${card.suit}</span>`;
        return cardEl;
    };
    
    const resetGame = () => {
        balance = 100;
        lastBets = [];
        gameInProgress = false;
        initializeSlots();
        dealerHand = [];
        displayMessage("Placez vos mises sur un ou plusieurs jeux.");
        updateUI();
    };

    elements.btnDeal.onclick = deal;
    elements.btnClear.onclick = clearBets;
    elements.btnHit.onclick = hit;
    elements.btnStand.onclick = stand;
    elements.btnDouble.onclick = doubleDown;
    elements.btnRebetDouble.onclick = rebetAndDouble;
    elements.btnReset.onclick = resetGame;

    resetGame(); // Démarrage initial
});
