// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./Game.sol";

/// @title Factory for deploying Game instances
/// @notice Only the designated game master can deploy new Game contracts
contract GameFactory {
    /// @notice Address with exclusive rights to create games
    address public immutable gameMaster;
    /// @notice List of all deployed Game addresses
    address[] public allGames;

    /// @notice Emitted when a new Game is created
    /// @param gameAddress         Address of the new Game contract
    /// @param master              The game master who deployed the game
    /// @param entryFee            Fee per player (wei)
    /// @param serviceFeePercent   Service fee percentage (0-100)
	/// @param depositPercent	   Anti-grief deposit percentage of entryFee (1-100)
    /// @param commitBlocks        Block duration of the commit phase
    /// @param revealBlocks        Block duration of the reveal phase
    /// @param maxPlayers          Maximum allowed players
    event GameCreated(
        address indexed gameAddress,
        address indexed master, 
        uint entryFee,
        uint serviceFeePercent,
		uint depositPercent,
        uint commitBlocks,
        uint revealBlocks,
        uint maxPlayers
    );

    /// @notice Restricts function to the game master
    modifier onlyGameMaster() {
		if (msg.sender != gameMaster) revert OnlyGameMaster();
        _;
    }

    /// @notice Sets deployer as the game master
    constructor() {
        gameMaster = msg.sender;
    }

    /// @notice Creates a new Game instance with given parameters
    /// @dev Master address passed to each Game to receive service fees
    function createGame(
        uint entryFee,
        uint serviceFeePercent,
		uint depositPercent,
        uint commitBlocks,
        uint revealBlocks,
        uint maxPlayers
    ) external onlyGameMaster returns (address) {
        Game game = new Game(
            entryFee,
            serviceFeePercent,
			depositPercent,
            commitBlocks,
            revealBlocks,
            maxPlayers,
            gameMaster, 
            address(this) // Factory address
        );
        allGames.push(address(game));
		
        emit GameCreated(
            address(game),
            gameMaster,
            entryFee,
            serviceFeePercent,
			depositPercent,
            commitBlocks,
            revealBlocks,
            maxPlayers
        );
        return address(game);
    }

    /// @notice Returns list of all deployed games
    function getAllGames() external view returns (address[] memory) {
        return allGames;
    }

    /// @notice Returns total number of games created
    function totalGames() external view returns (uint) {
        return allGames.length;
    }
}