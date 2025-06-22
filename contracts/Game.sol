// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// @title Decentralized Number Guessing Game
// @notice Players commit a number between 0 and 1000; winner is closest to 2/3 of average
// @dev Uses commit-reveal, block.number for phase timing, pull-payments, and simple reentrancy guard

/* ───── Custom Errors: TOP Level ───── */
error OnlyFactory();
error OnlyGameMaster();
error WrongAmount(uint got, uint exp);
error MaxPlayersReached();
error AlreadyCommitted();
error NotInCommit();
error NotInReveal();
error RevealPhaseNotEndedYet();
error NumberOutOfRange();
error NoBalance();
error TransferFailed(); 


contract Game{

	// Errors specific for Game Instances
	error AlreadyFinalized();
	error NoCommitmentFound();
	error AlreadyRevealed();
	error HashMismatch();
	error ReentrantCall();
	error DirectEtherNotAllowed();

    // ---- Game parameters ----
    uint public immutable entryFee;               // amount each player must pay to join (bet)
    uint public immutable serviceFeePercent;      // percent fee (0‑100) sent to game master
    uint public immutable depositPercent;         // anti‑grief deposit as % of entryFee (1‑100)
    uint public immutable depositAmount;          // anti‑grief deposit in wei (computed once)
    uint public immutable commitPhaseEnd;         // block number when commit phase ends
    uint public immutable revealPhaseEnd;         // block number when reveal phase ends
    uint public immutable maxPlayers;             // maximum number of players allowed
    address public immutable gameMaster;          // game master can later withdraw service fees
    address public immutable factory;             // factory address (deployment gate‑keeper)

    // ---- Game state ----
    address[] public players;                            // all players who committed
    mapping(address => bytes32) public commitments;      // player's hashed commit
    mapping(address => uint)    public revealed;         // player's revealed number
    mapping(address => bool)    public hasRevealed;      // whether player has revealed
    mapping(address => uint)    public deposits;         // per‑player anti‑grief deposit
    uint public pot;                                     // sum of entryFees (extra deposits excluded)
    bool public executed;                                // whether finalize() has been called
    address public winner;                               // final winner
	
	// Reine Konstanten 
	uint private constant BLOCKHASH_RETENTION = 256; // Variable für eine Maßnahme gegen 0-Hash Attacken beim Random Number Picking 

    // events
    event GameFinalized(address indexed gameAddress, address indexed winnerAddress, uint indexed winningNumber, uint payoutAmount);
    event GameRefund(address indexed gameAddress);

    // balances for pull‑pattern payouts (winnings, refunds, deposit returns, service fee)
    mapping(address => uint) public balances;

    // ---- Reentrancy guard ----
    bool private locked;
    modifier noReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    // ---- Phase modifiers ----
    modifier onlyDuringCommit() {
        if (block.number > commitPhaseEnd) revert NotInCommit();
        _;
    }
    modifier onlyDuringReveal() {
        if (block.number <= commitPhaseEnd || block.number > revealPhaseEnd) revert NotInReveal();
        _;
    }
    modifier onlyAfterReveal() {
        if (block.number <= revealPhaseEnd) revert RevealPhaseNotEndedYet();
        _;
    }

    /* -------------------------------------------------------------------------
       Constructor
       --------------------------------------------------------------------- */
    /// @param _entryFee           Fee per player (in wei)
    /// @param _serviceFeePercent  Percent of pot to master (1‑100)
    /// @param _depositPercent     Deposit as % of _entryFee (1‑100)
    /// @param _commitBlocks       Number of blocks for commit phase (>=10)
    /// @param _revealBlocks       Number of blocks for reveal phase (>=10)
    /// @param _maxPlayers         Maximum players allowed (>=3)
    /// @param _gameMaster         Address that receives service fees
    /// @param _factory            Factory address that deploys the contract
    constructor(
        uint _entryFee,
        uint _serviceFeePercent,
        uint _depositPercent,
        uint _commitBlocks,
        uint _revealBlocks,
        uint _maxPlayers,
        address _gameMaster,
        address _factory
    ) {
        if (msg.sender != _factory) revert OnlyFactory();
        if (_entryFee == 0) revert WrongAmount(_entryFee, 10);
        if (_serviceFeePercent == 0 || _serviceFeePercent > 100) revert WrongAmount(_serviceFeePercent, 10);
        if (_depositPercent == 0 || _depositPercent > 100) revert WrongAmount(_depositPercent, 50);
        if (_commitBlocks < 10) revert WrongAmount(_commitBlocks, 50);
		if (_revealBlocks < 10) revert WrongAmount(_revealBlocks, 50);
        if (_maxPlayers < 3 || _maxPlayers > 100000) revert WrongAmount(_maxPlayers, 50);

        entryFee = _entryFee;
        serviceFeePercent = _serviceFeePercent;
        depositPercent = _depositPercent;
        depositAmount = (_entryFee * _depositPercent) / 100; // pre‑computed once
        commitPhaseEnd = block.number + _commitBlocks;
        revealPhaseEnd = commitPhaseEnd + _revealBlocks;
        maxPlayers = _maxPlayers;
        gameMaster = _gameMaster;
        factory = _factory;
    }

    /* -------------------------------------------------------------------------
       Commit‑phase: player submits hash(number,salt) + entryFee + deposit
       --------------------------------------------------------------------- */
    /// @param _commitment keccak256(abi.encodePacked(number, salt))
    function commit(bytes32 _commitment) external payable onlyDuringCommit {
        if (msg.value != entryFee + depositAmount) revert WrongAmount(msg.value, entryFee + depositAmount); 
        if (players.length >= maxPlayers) revert MaxPlayersReached();
        if (commitments[msg.sender] != bytes32(0)) revert AlreadyCommitted();

        commitments[msg.sender] = _commitment;
        players.push(msg.sender);
        deposits[msg.sender] = depositAmount; // store deposit for later refund/forfeit
        pot += entryFee;                      // only the bet flows into pot
    }

    /* -------------------------------------------------------------------------
       Reveal‑phase: player discloses number and salt. Honest reveal triggers
       immediate credit of the deposit to their pull‑balance.
       --------------------------------------------------------------------- */
    /// @param number Original number (0‑1000)
    /// @param salt   Same salt used during commit
    function reveal(uint number, string calldata salt) external onlyDuringReveal {
        if (commitments[msg.sender] == bytes32(0)) revert NoCommitmentFound();
        if (hasRevealed[msg.sender]) revert AlreadyRevealed();
        if (number > 1000) revert NumberOutOfRange();
        
        // verify hash
        bytes32 h = keccak256(abi.encodePacked(number, salt));
        if (h != commitments[msg.sender]) revert HashMismatch();

        revealed[msg.sender] = number;
        hasRevealed[msg.sender] = true;

        // refund deposit via pull‑payments
        uint dep = deposits[msg.sender];
        if (dep > 0) {
            deposits[msg.sender] = 0;
            balances[msg.sender] += dep;
        }
    }

        /* -------------------------------------------------------------------------
       Finalization: after reveal phase ends
       - refunds if <3 reveals
       - otherwise determines 2/3-winner and distributes pot
       - forfeited deposits from non-revealers are added to pot
       --------------------------------------------------------------------- */
    function finalize() external onlyAfterReveal {
        if (executed) revert AlreadyFinalized();
        executed = true;
		
		uint len = players.length;
		uint validCount;
        uint forfeited;
		address[] memory revealedPlayers = new address[](len);
		uint sum;
		
		// 1) Too-late-case: automatischer REFUND gegen 0-Hash-Attacken
		if (block.number > revealPhaseEnd + BLOCKHASH_RETENTION) {
			for (uint i = 0; i < len;) {
				address p = players[i];
				// Für Reveal-Spieler ist deposit bereits 0, für andere nicht
				balances[p] += entryFee + deposits[p];
				deposits[p] = 0;
				unchecked{ ++i; } // without overflow check, len <= 100000
			}
			emit GameRefund(address(this));
			return;
		}

        // 2) count valid reveals, collect sum and forfeited deposits
        for (uint i = 0; i < len; ) {
            address p = players[i];
            if (hasRevealed[p]) {
				revealedPlayers[validCount] = p;
                unchecked{ ++validCount; }
				sum += revealed[p];
            } else {
                // unrevealed player loses deposit, added to pot
                forfeited += deposits[p];
                deposits[p] = 0;
            }
			unchecked{ ++i; } // without overflow check, len <= 100000
        }
        pot += forfeited;

        // 3) Not enough reveals -> refund everyone (entryFee + deposit)
        if (validCount < 3) {
            for (uint i = 0; i < len; ) {
                address p = players[i];
                balances[p] += entryFee + deposits[p];
                deposits[p] = 0;
				unchecked{ ++i; }
            }
            emit GameRefund(address(this));
            return;
        }

        uint target = (sum * 2) / (validCount * 3);
        
        // 4) Determine minimal distance and tie lists on the fly
        uint minDiff = type(uint).max;
		address[] memory ties = new address[](validCount);
        uint winnerCount;
        for (uint i = 0; i < validCount; ) {
			address r = revealedPlayers[i];
            uint diff = revealed[r] > target
                ? revealed[r] - target
                : target - revealed[r];
            if (diff < minDiff) {
                minDiff = diff;
                ties[0] = r;
				winnerCount = 1;
            } else if (diff == minDiff) {
                ties[winnerCount] = r;
				unchecked{++winnerCount;}
            }
			unchecked{ ++i; }
        }
	
	    // 5) pick random winner from ties
        uint rand = uint(keccak256(abi.encodePacked(block.prevrandao, blockhash(revealPhaseEnd), block.timestamp, validCount)));
        winner = ties[rand % winnerCount];

        // 6) Distribute pot (pot already includes forfeited deposits)
        uint fee = (pot * serviceFeePercent) / 100;
        uint payout = pot - fee;
        balances[gameMaster] += fee;
        balances[winner] += payout;

        emit GameFinalized(address(this), winner, revealed[winner], payout);
    }

    /* -------------------------------------------------------------------------
       Pull‑Payment: Withdraw your balance (refund or winnigs)
       --------------------------------------------------------------------- */
    function withdraw() external noReentrant {
        uint amount = balances[msg.sender];
        if (amount == 0) revert NoBalance();
        balances[msg.sender] = 0;
        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    /* -------------------------------------------------------------------------
       Fallbacks
       --------------------------------------------------------------------- */
    receive() external payable { revert DirectEtherNotAllowed(); }
    fallback() external payable { revert DirectEtherNotAllowed(); }

    /* -------------------------------------------------------------------------
       View Helpers
       --------------------------------------------------------------------- */
    function totalPlayers() external view returns (uint) {
        return players.length;
    }

    // 0 = commit, 1 = reveal, 2 = ended
    function currentPhase() external view returns (uint) {
        if (block.number <= commitPhaseEnd) return 0;
        if (block.number <= revealPhaseEnd) return 1;
        return 2;
    }
}