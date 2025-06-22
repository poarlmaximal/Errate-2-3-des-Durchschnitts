// Smart Contract ABIs
const GAME_FACTORY_ABI = [
    "function createGame(uint entryFee, uint serviceFeePercent, uint depositPercent, uint commitBlocks, uint revealBlocks, uint maxPlayers)",
	"function getAllGames() external view returns (address[] memory)",
	"function totalGames() external view returns (uint)",
	"function gameMaster() external view returns (address)",
    "event GameCreated(address indexed gameAddress, address indexed master, uint entryFee, uint serviceFeePercent, uint depositPercent, uint commitBlocks, uint revealBlocks, uint maxPlayers)"
];

const GAME_ABI = [
    // ----- Read-only (view) -----
  "function entryFee() external view returns (uint)",
  "function serviceFeePercent() external view returns (uint)",
  "function depositPercent() external view returns (uint)",
  "function depositAmount() external view returns (uint)",
  "function commitPhaseEnd() external view returns (uint)",
  "function revealPhaseEnd() external view returns (uint)",
  "function maxPlayers() external view returns (uint)",
  "function totalPlayers() external view returns (uint)",
  "function currentPhase() external view returns (uint)",
  "function executed() external view returns (bool)",
  "function pot() external view returns (uint)",           
  "function winner() external view returns (address)",
  "function balances(address) external view returns (uint)",
  "function deposits(address) external view returns (uint)",
  "function hasRevealed(address) external view returns (bool)",
  "function commitments(address) external view returns (bytes32)",
  "function revealed(address) external view returns (uint)",
  // ----- State-changing -----
  "function commit(bytes32 _commitment) external payable",
  "function reveal(uint number, string calldata salt) external",
  "function finalize() external",
  "function withdraw() external",
  // ----- Events -----
  "event GameFinalized(address indexed gameAddress, address indexed winnerAddress, uint winningNumber, uint payoutAmount)",
  "event GameRefund(address indexed gameAddress)"
];

// Global variables
let provider;
let signer;
let userAddress;
let gameFactoryContract;
let gameFactoryAddress; // Will be set from config.js
let refreshIntervalId = null;

// DOM elements
const connectWalletBtn = document.getElementById('connectWallet');
const disconnectWalletBtn = document.getElementById('disconnectWallet');
const walletInfo = document.getElementById('walletInfo');
const walletAddress = document.getElementById('walletAddress');
const rulesSection = document.getElementById('rulesSection');
const gamesSection = document.getElementById('gamesSection');
const gamesList = document.getElementById('gamesList');
const refreshGamesBtn = document.getElementById('refreshGames');
const gameModal = document.getElementById('gameModal');
const closeModalBtn = document.getElementById('closeModal');
const modalTitle = document.getElementById('modalTitle');
const gameDetails = document.getElementById('gameDetails');
const loadingOverlay = document.getElementById('loadingOverlay');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notificationText');
const closeNotificationBtn = document.getElementById('closeNotification');
const createGameBtn = document.getElementById('createGameBtn');
const createGameModal = document.getElementById('createGameModal');
const closeCreateModal = document.getElementById('closeCreateModal');
const confirmCreateBtn = document.getElementById('confirmCreateBtn');
const commitBlocksInput = document.getElementById('commitBlocksInput');
const revealBlocksInput = document.getElementById('revealBlocksInput');
const maxPlayersInput   = document.getElementById('maxPlayersInput');
const depositPercentInput = document.getElementById('depositPercentInput');

// Modal sections
const commitSection = document.getElementById('commitSection');
const revealSection = document.getElementById('revealSection');
const finalizeSection = document.getElementById('finalizeSection');
const withdrawSection = document.getElementById('withdrawSection');

// Input elements
const numberInput = document.getElementById('numberInput');
const saltInput = document.getElementById('saltInput');
const revealNumberInput = document.getElementById('revealNumberInput');
const revealSaltInput = document.getElementById('revealSaltInput');

// Action buttons
const commitBtn = document.getElementById('commitBtn');
const revealBtn = document.getElementById('revealBtn');
const finalizeBtn = document.getElementById('finalizeBtn');
const withdrawBtn = document.getElementById('withdrawBtn');

// Balance display
const userBalance = document.getElementById('userBalance');

// Current game being viewed
let currentGameContract;
let currentGameAddress;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Check if MetaMask is installed
    if (typeof window.ethereum === 'undefined') {
        showNotification('MetaMask ist nicht installiert. Bitte installieren Sie MetaMask um fortzufahren.', 'error');
        // Don't return early - still set up the app for testing
    }

    // Load GameFactory address from config
    gameFactoryAddress = config.gameFactoryAddress;

    // Validate address format
    if (!ethers.utils.isAddress(gameFactoryAddress)) {
        showNotification('Ungültige Contract-Adresse in config.js. Bitte geben Sie eine gültige Ethereum-Adresse ein.', 'error');
        return;
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Check if already connected
    checkConnection();
}

function setupEventListeners() {
    connectWalletBtn.addEventListener('click', connectWallet);
    disconnectWalletBtn.addEventListener('click', disconnectWallet);
    refreshGamesBtn.addEventListener('click', loadGames);
    closeModalBtn.addEventListener('click', closeModal);
    closeNotificationBtn.addEventListener('click', closeNotification);
    
	// Action buttons
    commitBtn.addEventListener('click', commitNumber);
    revealBtn.addEventListener('click', revealNumber);
    finalizeBtn.addEventListener('click', finalizeGame);
    withdrawBtn.addEventListener('click', withdrawBalance);
    createGameBtn.addEventListener('click', () => createGameModal.classList.remove('hidden'));
	closeCreateModal.addEventListener('click', () => createGameModal.classList.add('hidden'));
	confirmCreateBtn.addEventListener('click', createNewGame);
		
    // Close modal when clicking outside
    gameModal.addEventListener('click', function(e) {
        if (e.target === gameModal) {
            closeModal();
        }
    });
}

async function checkConnection() {
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWallet();
        }
    } catch (error) {
        console.error('Error checking connection:', error);
    }
}

async function connectWallet() {
    try {
        showLoading(true);

        // Check if MetaMask is available
        if (typeof window.ethereum === 'undefined') {
            showNotification('MetaMask ist nicht installiert. Bitte installieren Sie MetaMask um fortzufahren.', 'error');
            return;
        }

        // Request account access with timeout
        const accounts = await Promise.race([
            window.ethereum.request({ method: 'eth_requestAccounts' }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: Wallet-Verbindung dauert zu lange')), 30000)
            )
        ]);

        if (accounts.length === 0) {
            showNotification('Keine Accounts gefunden. Bitte entsperren Sie MetaMask.', 'error');
            return;
        }

        // Initialize provider and signer (immer neu instanziieren)
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        console.log('Aktueller Account:', userAddress);

        // Check network
        const network = await provider.getNetwork();
        console.log('Netzwerk:', network);
        
        // Warn if not on localhost
        if (network.chainId !== 31337 && network.chainId !== 1337) {
            showNotification(`Warnung: Sie sind nicht mit dem lokalen Hardhat-Netzwerk verbunden (Chain ID: ${network.chainId}). Bitte wechseln Sie zu localhost:8545.`, 'error');
        }

        // Initialize GameFactory contract (immer neu instanziieren)
        gameFactoryContract = new ethers.Contract(gameFactoryAddress, GAME_FACTORY_ABI, signer);

		const gameMaster = await gameFactoryContract.gameMaster();
		const isGameMaster = gameMaster.toLowerCase() === userAddress.toLowerCase();
		createGameBtn.classList.toggle('hidden', !isGameMaster);

        // Reset current game contract/address, damit keine alten Instanzen verwendet werden
        currentGameContract = null;
        currentGameAddress = null;

        // Update UI
        updateWalletUI();

        // Load games
        await loadGames();
		startAutoRefresh();

        showNotification('Wallet erfolgreich verbunden!', 'success');
    } catch (error) {
        console.error('Error connecting wallet:', error);
        if (error.message.includes('User rejected')) {
            showNotification('Wallet-Verbindung wurde vom Benutzer abgelehnt.', 'error');
        } else if (error.message.includes('Timeout')) {
            showNotification('Timeout: Wallet-Verbindung dauert zu lange. Bitte versuchen Sie es erneut.', 'error');
        } else {
            showNotification('Fehler beim Verbinden des Wallets: ' + error.message, 'error');
        }
    } finally {
        showLoading(false);
    }
}

function disconnectWallet() {
    stopAutoRefresh();
	provider = null;
    signer = null;
    userAddress = null;
    gameFactoryContract = null;
    
    updateWalletUI();
    showNotification('Wallet getrennt.', 'info');
}

function updateWalletUI() {
    if (userAddress) {
        connectWalletBtn.classList.add('hidden');
        walletInfo.classList.remove('hidden');
        walletAddress.textContent = `${userAddress}`;
        
        rulesSection.classList.add('hidden');
        gamesSection.classList.remove('hidden');
    } else {
        connectWalletBtn.classList.remove('hidden');
        walletInfo.classList.add('hidden');
        
        rulesSection.classList.remove('hidden');
        gamesSection.classList.add('hidden');
    }
}

async function loadGames({ silent = false } =  {}) {
    if (!gameFactoryContract) {
        showNotification('GameFactory Contract nicht initialisiert.', 'error');
        return;
    }
    
    try {
        if (!silent) showLoading(true);
        
        // Add timeout for contract calls
        const gameAddresses = await Promise.race([
            gameFactoryContract.getAllGames(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout beim Laden der Spiele')), 15000)
            )
        ]);
        
        const fragment = document.createDocumentFragment()
        
        if (gameAddresses.length === 0) {
            gamesList.innerHTML = '<p class="text-center">Keine Spiele verfügbar.</p>';
            return;
        }
        
		const sortedGameAddresses = [...gameAddresses].reverse();
		
        for (const gameAddress of sortedGameAddresses) {
            const card = await loadGameCard(gameAddress);
			fragment.appendChild(card)
        }
		gamesList.replaceChildren(...fragment.childNodes);
        
    } catch (error) {
        console.error('Error loading games:', error);
        if (error.message.includes('Timeout')) {
            showNotification('Timeout beim Laden der Spiele. Bitte überprüfen Sie Ihre Netzwerkverbindung.', 'error');
        } else {
            showNotification('Fehler beim Laden der Spiele: ' + error.message, 'error');
        }
    } finally {
        if (!silent) showLoading(false);
    }
}

async function loadGameCard(gameAddress) {
    try {
        const gameContract = new ethers.Contract(gameAddress, GAME_ABI, provider);
        
        // Get game data
        const [entryFee, depositPercent, depositAmount,	maxPlayers, totalPlayers, currentPhase, executed, commitEnd, revealEnd] = await Promise.all([
			gameContract.entryFee(),
			gameContract.depositPercent(),   
			gameContract.depositAmount(),    
			gameContract.maxPlayers(),
			gameContract.totalPlayers(),
			gameContract.currentPhase(),
			gameContract.executed(),
			gameContract.commitPhaseEnd(),
			gameContract.revealPhaseEnd()
		]);
		
		        
        // Create game card
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        gameCard.addEventListener('click', () => openGameModal(gameAddress));
        
        const phaseText = getPhaseText(currentPhase.toNumber(), executed);
        const phaseClass = getPhaseClass(currentPhase.toNumber(), executed);
        
		// Aktuellen Block vom Provider holen
		const currentBlock = await provider.getBlockNumber();

		// Wie viele Blöcke bleiben?
		let remainingBlocks = 0;
		if (!executed) {
			if (currentPhase.toNumber() === 0) {       // Commit-Phase
				remainingBlocks = Math.max(0, commitEnd - currentBlock);
			} else if (currentPhase.toNumber() === 1) {// Reveal-Phase
				remainingBlocks = Math.max(0, revealEnd - currentBlock);
			}
		}
		
		
        gameCard.innerHTML = `
            <h3>Spiel ${gameAddress.slice(0, 8)}...</h3>
            <div class="game-stats">
                <div class="stat-item">
                    <span class="stat-label">Teilnahmegebühr</span>
                    <span class="stat-value">${ethers.utils.formatEther(entryFee)} ETH</span>
                </div>
				<div class="stat-item">
					<span class="stat-label">Deposit</span>
					<span class="stat-value">${depositPercent}% (${ethers.utils.formatEther(depositAmount)} ETH)</span>
				</div>
                <div class="stat-item">
                    <span class="stat-label">Spieler</span>
                    <span class="stat-value">${totalPlayers}/${maxPlayers}</span>
                </div>
            </div>
            <div class="phase-indicator ${phaseClass}">
                ${phaseText}
				${executed ? '' : `<span class="remaining">${remainingBlocks} Blöcke übrig</span>`}
            </div>
        `;
        
        return gameCard;
		
        
    } catch (error) {
        console.error('Error loading game card:', error);
    }
}

// ─── Auto-Refresh (Polling) ─────────────────────────────────────────────
function startAutoRefresh() {
	// doppelte Timer vermeiden
	if (refreshIntervalId) return;

	refreshIntervalId = setInterval(async () => {
		try {
			// globale Spielübersicht
			await loadGames({ silent : true });

			// falls ein Spiel­-Modal offen ist -> Details nachziehen
			if (currentGameAddress) {
				await loadGameDetails();
			}
		} catch (err) {
			console.error('Auto-Refresh-Fehler:', err);
		}
	}, 10_000);   // Intervall anpassen (ms)
}

function stopAutoRefresh() {
	clearInterval(refreshIntervalId);
	refreshIntervalId = null;
}

function getPhaseText(phase, executed) {
    if (executed) return 'Beendet';
    switch (phase) {
        case 0: return 'Commit Phase';
        case 1: return 'Reveal Phase';
        case 2: return 'Bereit zur Finalisierung';
        default: return 'Unbekannt';
    }
}

function getPhaseClass(phase, executed) {
    if (executed) return 'phase-ended';
    switch (phase) {
        case 0: return 'phase-commit';
        case 1: return 'phase-reveal';
        case 2: return 'phase-ended';
        default: return 'phase-ended';
    }
}

async function openGameModal(gameAddress) {
    currentGameAddress = gameAddress;
    currentGameContract = new ethers.Contract(gameAddress, GAME_ABI, signer);
    
    try {
        showLoading(true);
        
        // Load game details
        await loadGameDetails();
        
        // Show modal
        gameModal.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error opening game modal:', error);
        showNotification('Fehler beim Laden der Spieldetails: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function loadGameDetails() {
    try {
        const [
			entryFee, serviceFeePercent, depositPercent, depositAmount,
			commitPhaseEnd, revealPhaseEnd,
			maxPlayers, totalPlayers, currentPhase, executed, winner,
			userBalance, hasRevealed, commitment
		] = await Promise.all([
			currentGameContract.entryFee(),
			currentGameContract.serviceFeePercent(),
			currentGameContract.depositPercent(),     
			currentGameContract.depositAmount(),      
			currentGameContract.commitPhaseEnd(),
			currentGameContract.revealPhaseEnd(),
			currentGameContract.maxPlayers(),
			currentGameContract.totalPlayers(),
			currentGameContract.currentPhase(),
			currentGameContract.executed(),
			currentGameContract.winner(),
			currentGameContract.balances(userAddress),
			currentGameContract.hasRevealed(userAddress),
			currentGameContract.commitments(userAddress)
        ]);
		
		// Wenn das Spiel beendet ist: Gewinner + Siegerzahl holen
		let winnerAddr   = "";
		let winnerNumber = 0;
		if (executed) {
			winnerAddr   = await currentGameContract.winner();
			winnerNumber = await currentGameContract.revealed(winnerAddr);
		}
        
        // Update modal title
        modalTitle.textContent = `Spiel ${currentGameAddress}`;
        
        // Update game details
        const currentBlock = await provider.getBlockNumber();
        const phaseText = getPhaseText(currentPhase.toNumber(), executed);
        
        gameDetails.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Teilnahmegebühr:</span>
                    <span class="detail-value">${ethers.utils.formatEther(entryFee)} ETH</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Servicegebühr:</span>
                    <span class="detail-value">${serviceFeePercent}%</span>
                </div>
				<div class="detail-item">
					<span class="detail-label">Deposit-Prozentsatz:</span>
					<span class="detail-value">${depositPercent}%</span>
				</div>
				<div class="detail-item">
					<span class="detail-label">Deposit-Betrag:</span>
					<span class="detail-value">${ethers.utils.formatEther(depositAmount)} ETH</span>
				</div>
				<div class="detail-item">
                    <span class="detail-label">Spieler:</span>
                    <span class="detail-value">${totalPlayers}/${maxPlayers}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Aktuelle Phase:</span>
                    <span class="detail-value">${phaseText}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Commit Phase Ende:</span>
                    <span class="detail-value">Block ${commitPhaseEnd}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Reveal Phase Ende:</span>
                    <span class="detail-value">Block ${revealPhaseEnd}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Aktueller Block:</span>
                    <span class="detail-value">${currentBlock}</span>
                </div>
                ${executed ? `
                <div class="detail-item">
                    <span class="detail-label">Gewinner:</span>
                    <span class="detail-value">${winnerAddr === ethers.constants.AddressZero ? 'Kein Gewinner' : winnerAddr}</span>
                </div>
				<div class="detail-item">
                    <span class="detail-label">Tipp des Gewinners:</span>
                    <span class="detail-value">${winnerNumber === ethers.constants.AddressZero ? 'Kein Gewinner' : winnerNumber}</span>
                </div>
                ` : ''}
            </div>
        `;
        
        // Update balance display
        document.getElementById('userBalance').textContent = ethers.utils.formatEther(userBalance);
        
        // Show/hide action sections based on game state
        updateActionSections(currentPhase.toNumber(), executed, commitment !== ethers.constants.HashZero, hasRevealed, userBalance.gt(0));
        
    } catch (error) {
        console.error('Error loading game details:', error);
        throw error;
    }
}

function updateActionSections(phase, executed, hasCommitted, hasRevealed, hasBalance) {
    // Hide all sections first
    commitSection.classList.add('hidden');
    revealSection.classList.add('hidden');
    finalizeSection.classList.add('hidden');
    withdrawSection.classList.add('hidden');
    
    if (executed) {
        // Game is finished
        if (hasBalance) {
            withdrawSection.classList.remove('hidden');
        }
    } else {
        switch (phase) {
            case 0: // Commit phase
                if (!hasCommitted) {
                    commitSection.classList.remove('hidden');
                }
                break;
            case 1: // Reveal phase
                if (hasCommitted && !hasRevealed) {
                    revealSection.classList.remove('hidden');
                }
                break;
            case 2: // Ended, ready for finalization
                finalizeSection.classList.remove('hidden');
                break;
        }
        
        // Always show withdraw if user has balance
        if (hasBalance) {
            withdrawSection.classList.remove('hidden');
        }
    }
}

async function commitNumber() {
    try {
        if (!currentGameContract) {
            showNotification('Kein Spiel ausgewählt oder Contract nicht initialisiert!', 'error');
            console.error('currentGameContract ist null!');
            return;
        }
        
        const number = parseInt(numberInput.value);
        let salt = saltInput.value;

        if (isNaN(number) || number < 0 || number > 1000) {
            showNotification('Bitte geben Sie eine Zahl zwischen 0 und 1000 ein.', 'error');
            return;
        }

        if (!salt) {
            showNotification('Bitte geben Sie ein Salt ein.', 'error');
            return;
        }

        showLoading(true);

        // Commitment-Hash wie im Smart Contract (abi.encodePacked)
        const commitment = ethers.utils.keccak256(
            ethers.utils.solidityPack(['uint', 'string'], [number, salt])
        );
        console.log('Commitment:', commitment, 'Number:', number, 'Salt:', salt);

        // Get entry fee + deposit
        const [entryFee, depositAmount] = await Promise.all([currentGameContract.entryFee(), currentGameContract.depositAmount()]);
		const totalValue = entryFee.add(depositAmount);
		console.log(`entryFee = ${ethers.utils.formatEther(entryFee)} ETH, ` +
					`deposit = ${ethers.utils.formatEther(depositAmount)} ETH, ` +
					`total = ${ethers.utils.formatEther(totalValue)} ETH`);
		
        // Send commit transaction
		const tx = await currentGameContract.commit(commitment, { value: totalValue });
		await tx.wait();
		
		const entryEth   = ethers.utils.formatEther(entryFee);
		const depositEth = ethers.utils.formatEther(depositAmount);
		const totalEth   = ethers.utils.formatEther(totalValue);
 
		showNotification(`Commit gesendet – Teilnahmegebühr ${entryEth} ETH + Deposit ${depositEth} ETH = ${totalEth} ETH.`, 'success');

        // Clear inputs
        numberInput.value = '';
        saltInput.value = '';

        // Reload game details
        await loadGameDetails();
    } catch (error) {
        console.error('Error committing:', error);
        showNotification('Fehler beim Commit: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function revealNumber() {
    try {
        const number = parseInt(revealNumberInput.value);
        const salt = revealSaltInput.value;
        
        if (isNaN(number) || number < 0 || number > 1000) {
            showNotification('Bitte geben Sie eine gültige Zahl zwischen 0 und 1000 ein.', 'error');
            return;
        }
        
        if (!salt) {
            showNotification('Bitte geben Sie das Salt ein.', 'error');
            return;
        }
        
        showLoading(true);
        
        // Send reveal transaction
        const tx = await currentGameContract.reveal(number, salt);
        await tx.wait();
        
        showNotification('Reveal erfolgreich gesendet!', 'success');
        
        // Clear inputs
        revealNumberInput.value = '';
        revealSaltInput.value = '';
        
        // Reload game details
        await loadGameDetails();
        
    } catch (error) {
        console.error('Error revealing:', error);
        showNotification('Fehler beim Reveal: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function finalizeGame() {
	try {
		showLoading(true);
		const tx = await currentGameContract.finalize();
		const rc = await tx.wait();
		if (rc.status === 0) {
			showNotification('Finalize revertet.', 'error');
		} else {
			showNotification('Spiel finalisiert.', 'success');
		}
	} catch (err) {
		console.error(err);
		showNotification('Fehler: ' + err.message, 'error');
	} finally {
		await loadGameDetails();          // <-- egal ob Erfolg oder Revert
		showLoading(false);
	}
}

async function withdrawBalance() {
	try {
		showLoading(true);
		const tx = await currentGameContract.withdraw();
		const rc = await tx.wait();
		if (rc.status === 0) {
			showNotification('Withdraw revertet.', 'error');
		} else {
			showNotification('Auszahlung erfolgreich.', 'success');
		}
	} catch (err) {
		console.error(err);
		showNotification('Fehler: ' + err.message, 'error');
	} finally {
		await loadGameDetails();          // <-- auch hier
		showLoading(false);
	}
}

async function createNewGame() {
  try {
    showLoading(true);

    // --- Eingaben auslesen ---
    const entryEth  = entryFeeInput.value;
    const feePct    = parseInt(serviceFeeInput.value, 10);
	const depPct    = parseInt(depositPercentInput.value, 10);
    const commitBlk = parseInt(commitBlocksInput.value, 10);
    const revealBlk = parseInt(revealBlocksInput.value, 10);
    const maxPly    = parseInt(maxPlayersInput.value, 10);

    // --- Plausibilitäts-Checks ---
    if (entryEth <= 0) {
      showNotification('Teilnahmegebühr muss > 0 sein.', 'error'); return;
    }
    if (feePct < 0 || feePct > 100) {
      showNotification('Service-Gebühr muss zwischen 1 und 100 liegen.', 'error'); return;
    }
	if (depPct < 1 || depPct > 100) {
		showNotification('Deposit-Prozentsatz muss zwischen 1 und 100 liegen.', 'error'); return;
	}
    if (commitBlk < 10 || revealBlk < 10) {
      showNotification('Commit/Reveal-Blöcke müssen > 9 sein.', 'error'); return;
    }
    if (maxPly < 3) {
      showNotification('Mindestens 3 Spieler erforderlich.', 'error'); return;
    }
	

    // --- ETH → Wei ---
    const entryWei = ethers.utils.parseEther(entryEth);

    // --- Transaktion senden ---
    const tx = await gameFactoryContract.createGame(
      entryWei,
      feePct,
	  depPct,
      commitBlk,
      revealBlk,
      maxPly
    );
    await tx.wait();

    showNotification('Neues Spiel erstellt', 'success');
    createGameModal.classList.add('hidden');
    await loadGames();

  } catch (err) {
    console.error(err);
    showNotification('Fehler beim Erstellen: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

function closeModal() {
    gameModal.classList.add('hidden');
    currentGameContract = null;
    currentGameAddress = null;
}

function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    notificationText.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        closeNotification();
    }, 5000);
}

function closeNotification() {
    notification.classList.add('hidden');
}

// Handle account changes
if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
        if (accounts.length === 0) {
            disconnectWallet();
        } else {
            connectWallet(); // Seite nicht neu laden, sondern gezielt Wallet/UI aktualisieren
        }
    });
    
    window.ethereum.on('chainChanged', function (chainId) {
        window.location.reload();
    });
}

