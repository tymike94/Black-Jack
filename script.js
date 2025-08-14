document.addEventListener('DOMContentLoaded', () => {
    // --- Références aux éléments du DOM ---
    const elements = {
        dealerHand: document.getElementById('dealer-hand'),
        playerHand: document.getElementById('player-hand'),
        dealerScore: document.getElementById('dealer-score'),
        playerScore: document.getElementById('player-score'),
        messages: document.getElementById('messages'),
        balance: document.getElementById('balance'),
        chips: document.querySelectorAll('.chip'),
        dropZones: document.querySelectorAll('.drop-zone'),
        betAmountMain: document.getElementById('bet-amount-main'),
        betAmountPP: document.getElementById('bet-amount-perfectpairs'),
        betAmount213: document.getElementById('bet-amount-21plus3'),
        btnDeal: document.getElementById('btn-deal'),
        btnClear: document.getElementById('btn-clear'),
        btnHit: document.getElementById('btn-hit'),
        btnStand: document.getElementById('btn-stand'),
        btnDouble: document.getElementById('btn-double'), // NOUVEAU
        btnReset: document.getElementById('btn-reset-balance'),
        gameActions: document.getElementById('game-actions'),
        playerActions: document.getElementById('player-actions'),
    };

    // --- Variables d'état du jeu ---
    let deck = [];
    let playerHand = [], dealerHand = [];
    let balance = 100;
    let bets = { main: 0, perfectpairs: 0, twentyoneplus3: 0 };
    let gameInProgress = false;

    const SUITS = ['♥', '♦', '♠', '♣'];
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const RANK_VALUES = {'2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':10, 'Q':10, 'K':10, 'A':11};
    const delay = ms => new Promise(res => setTimeout(res, ms)); // Helper pour les délais

    // --- Logique de Drag & Drop ---
    elements.chips.forEach(chip => {
        chip.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', chip.dataset.value);
        });
    });

    elements.dropZones.forEach(zone => {
        zone.addEventListener('dragover', e => e.preventDefault());
        zone.addEventListener('dragenter', e => zone.classList.add('drag-over'));
        zone.addEventListener('dragleave', e => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (gameInProgress) return;

            const chipValue = parseInt(e.dataTransfer.getData('text/plain'));
            if (chipValue > balance) {
                displayMessage("Solde insuffisant pour cette mise !");
                return;
            }
            balance -= chipValue;
            const betType = zone.dataset.betType;
            bets[betType] += chipValue;
            updateUI();
        });
    });

    // --- Fonctions de base du jeu ---
    const createDeck = () => {
        deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ suit, rank, value: RANK_VALUES[rank] });
            }
        }
        deck.sort(() => Math.random() - 0.5); // Shuffle
    };

    const calculateScore = (hand) => {
        let score = hand.reduce((sum, card) => sum + card.value, 0);
        let aceCount = hand.filter(card => card.rank === 'A').length;
        while (score > 21 && aceCount > 0) {
            score -= 10;
            aceCount--;
        }
        return score;
    };

    const displayMessage = (msg) => {
        elements.messages.textContent = msg;
    };
    
    // --- Logique des actions de jeu ---
    const clearBets = () => {
        if (gameInProgress) return;
        balance += bets.main + bets.perfectpairs + bets.twentyoneplus3;
        bets = { main: 0, perfectpairs: 0, twentyoneplus3: 0 };
        updateUI();
        displayMessage("Placez vos mises en glissant les jetons.");
    };

    // MODIFIÉ : Distribution animée
    const deal = async () => {
        if (bets.main === 0) {
            displayMessage("Vous devez placer une mise principale pour jouer.");
            return;
        }
        gameInProgress = true;
        playerHand = [];
        dealerHand = [];
        createDeck();
        updateUI();

        // Séquence de distribution animée
        await delay(500);
        playerHand.push(deck.pop());
        updateUI();

        await delay(500);
        dealerHand.push(deck.pop());
        updateUI();

        await delay(500);
        playerHand.push(deck.pop());
        updateUI();

        await delay(500);
        dealerHand.push(deck.pop());
        updateUI();
        
        let sideBetMessage = checkSideBets();
        if (sideBetMessage) {
            displayMessage(sideBetMessage);
            await delay(2000); // Laisse le temps de lire le message du side bet
        }

        const playerScore = calculateScore(playerHand);
        if (playerScore === 21) {
            setTimeout(stand, 500);
        } else {
            displayMessage("Votre tour : Tirer, Rester ou Doubler ?");
        }
    };

    const hit = () => {
        if (!gameInProgress) return;
        playerHand.push(deck.pop());
        updateUI();
        const playerScore = calculateScore(playerHand);
        if (playerScore > 21) {
            endRound("Vous avez sauté ! Le croupier gagne.");
        }
    };

    // NOUVEAU : Fonction pour doubler la mise
    const doubleDown = () => {
        if (!gameInProgress || playerHand.length !== 2 || balance < bets.main) return;
        
        balance -= bets.main;
        bets.main *= 2;
        playerHand.push(deck.pop());
        
        updateUI();
        
        // Après avoir reçu la carte, le tour s'arrête
        setTimeout(() => {
            if (calculateScore(playerHand) > 21) {
                endRound("Vous avez sauté ! Le croupier gagne.");
            } else {
                stand();
            }
        }, 1000); // Délai pour voir la carte avant que le croupier ne joue
    };

    const stand = () => {
        if (!gameInProgress) return;
        elements.playerActions.style.display = 'none';
        dealerTurn();
    };
    
    const dealerTurn = () => {
        let dealerScore = calculateScore(dealerHand);
        updateUI(true);

        const drawLoop = setInterval(() => {
            dealerScore = calculateScore(dealerHand);
            if (dealerScore >= 17) {
                clearInterval(drawLoop);
                determineWinner();
            } else {
                dealerHand.push(deck.pop());
                updateUI(true);
            }
        }, 800);
    };

    // --- Logique des Side Bets ---
    const checkSideBets = () => {
        let sideBetWinnings = 0;
        let sideBetMessages = [];

        if (bets.perfectpairs > 0) {
            const [p1, p2] = playerHand;
            const isRed = (card) => card.suit === '♥' || card.suit === '♦';
            let pairPayout = 0;
            if (p1.rank === p2.rank) {
                if (p1.suit === p2.suit) { pairPayout = 25; sideBetMessages.push(`Paire Parfaite (+${bets.perfectpairs * 25}€)`); }
                else if (isRed(p1) === isRed(p2)) { pairPayout = 12; sideBetMessages.push(`Paire Couleur (+${bets.perfectpairs * 12}€)`); }
                else { pairPayout = 6; sideBetMessages.push(`Paire Mixte (+${bets.perfectpairs * 6}€)`); }
            }
            if (pairPayout > 0) sideBetWinnings += bets.perfectpairs * (pairPayout + 1);
        }

        if (bets.twentyoneplus3 > 0) {
            const threeCards = [playerHand[0], playerHand[1], dealerHand[1]];
            const ranks = threeCards.map(c => RANK_VALUES[c.rank] === 11 ? 14 : RANK_VALUES[c.rank]).sort((a,b) => a - b);
            const suits = threeCards.map(c => c.suit);
            const isFlush = new Set(suits).size === 1;
            const isStraight = ranks[2] - ranks[0] === 2 && new Set(ranks).size === 3;
            const isThreeOfAKind = new Set(ranks).size === 1;
            let threePayout = 0;
            if (isFlush && isThreeOfAKind) { threePayout = 100; sideBetMessages.push(`Brelan Couleur (+${bets.twentyoneplus3 * 100}€)`); }
            else if (isFlush && isStraight) { threePayout = 40; sideBetMessages.push(`Quinte Couleur (+${bets.twentyoneplus3 * 40}€)`); }
            else if (isThreeOfAKind) { threePayout = 30; sideBetMessages.push(`Brelan (+${bets.twentyoneplus3 * 30}€)`); }
            else if (isStraight) { threePayout = 10; sideBetMessages.push(`Quinte (+${bets.twentyoneplus3 * 10}€)`); }
            else if (isFlush) { threePayout = 5; sideBetMessages.push(`Couleur (+${bets.twentyoneplus3 * 5}€)`); }
            if (threePayout > 0) sideBetWinnings += bets.twentyoneplus3 * (threePayout + 1);
        }
        
        if (sideBetWinnings > 0) balance += sideBetWinnings;
        return sideBetMessages.join(' | '); // Retourne le message à afficher
    };
    
    const determineWinner = () => {
        const playerScore = calculateScore(playerHand);
        const dealerScore = calculateScore(dealerHand);
        let msg = "";
        let payoutMultiplier = 0;

        if (dealerScore > 21 || (playerScore <= 21 && playerScore > dealerScore)) {
            msg = "Vous gagnez !";
            payoutMultiplier = 2; // 1:1 payout
        } else if (dealerScore > playerScore) {
            msg = "Le croupier gagne.";
            payoutMultiplier = 0;
        } else {
            msg = "Égalité (Push).";
            payoutMultiplier = 1;
        }
        
        if (playerScore === 21 && playerHand.length === 2 && dealerScore !== 21) {
            msg = "Blackjack !";
            payoutMultiplier = 2.5; // 3:2 payout
        }
        endRound(msg, payoutMultiplier);
    };

    const endRound = (msg, mainBetMultiplier = 0) => {
        gameInProgress = false;
        balance += bets.main * mainBetMultiplier;
        bets = { main: 0, perfectpairs: 0, twentyoneplus3: 0 };
        displayMessage(msg);
        updateUI(true);
    };

    const renderHand = (hand, element, hideFirstCard) => {
        element.innerHTML = '';
        hand.forEach((card, index) => {
            const cardEl = document.createElement('div');
            if (index === 0 && hideFirstCard) { cardEl.className = 'card hidden'; }
            else {
                cardEl.className = 'card';
                const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
                cardEl.innerHTML = `
                    <span class="rank">${card.rank}</span>
                    <span class="suit ${suitColor}">${card.suit}</span>
                    <span class="suit bottom ${suitColor}">${card.suit}</span>`;
            }
            element.appendChild(cardEl);
        });
    };

    const updateUI = (revealDealer = false) => {
        elements.balance.textContent = Math.floor(balance);
        elements.betAmountMain.textContent = `${bets.main}€`;
        elements.betAmountPP.textContent = `${bets.perfectpairs}€`;
        elements.betAmount213.textContent = `${bets.twentyoneplus3}€`;

        renderHand(playerHand, elements.playerHand);
        elements.playerScore.textContent = calculateScore(playerHand) || '';
        renderHand(dealerHand, elements.dealerHand, gameInProgress && !revealDealer);
        elements.dealerScore.textContent = (gameInProgress && !revealDealer) ? '' : calculateScore(dealerHand) || '';

        // MODIFIÉ : Gestion des boutons
        elements.gameActions.style.display = gameInProgress ? 'none' : 'flex';
        elements.playerActions.style.display = gameInProgress ? 'flex' : 'none';
        elements.chips.forEach(c => c.draggable = !gameInProgress);
        if (gameInProgress) {
            const canDouble = playerHand.length === 2 && balance >= bets.main;
            elements.btnDouble.disabled = !canDouble;
            elements.btnHit.disabled = false;
            elements.btnStand.disabled = false;
        } else {
            elements.btnHit.disabled = true;
            elements.btnStand.disabled = true;
            elements.btnDouble.disabled = true;
        }
    };

    const resetGame = () => {
        balance = 100;
        bets = { main: 0, perfectpairs: 0, twentyoneplus3: 0 };
        playerHand = [];
        dealerHand = [];
        gameInProgress = false;
        displayMessage("Placez vos mises en glissant les jetons.");
        updateUI();
    };

    // --- Écouteurs d'événements ---
    elements.btnDeal.onclick = deal;
    elements.btnClear.onclick = clearBets;
    elements.btnHit.onclick = hit;
    elements.btnStand.onclick = stand;
    elements.btnDouble.onclick = doubleDown; // NOUVEAU
    elements.btnReset.onclick = resetGame;

    // --- Initialisation ---
    resetGame();
});
