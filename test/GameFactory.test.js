const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameFactory", function () {
    let GameFactory;
    let gameFactory;
    let Game;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    beforeEach(async function () {
        // Get the ContractFactory and Signers here.
        GameFactory = await ethers.getContractFactory("GameFactory");
        Game = await ethers.getContractFactory("Game");
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        // Deploy GameFactory
        gameFactory = await GameFactory.deploy();
        await gameFactory.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the right game master", async function () {
            expect(await gameFactory.gameMaster()).to.equal(owner.address);
        });

        it("Should start with zero games", async function () {
            expect(await gameFactory.totalGames()).to.equal(0);
            const allGames = await gameFactory.getAllGames();
            expect(allGames.length).to.equal(0);
        });
    });

    describe("Game Creation", function () {
        const entryFee = ethers.parseEther("0.1");
        const serviceFeePercent = 10;
        const depositPercent = 50;
        const commitBlocks = 50;
        const revealBlocks = 50;
        const maxPlayers = 10;

        it("Should create a game with valid parameters", async function () {
            const tx = await gameFactory.createGame(
                entryFee,
                serviceFeePercent,
                depositPercent,
                commitBlocks,
                revealBlocks,
                maxPlayers
            );

            const receipt = await tx.wait();
            
            // Check that totalGames increased
            expect(await gameFactory.totalGames()).to.equal(1);
            
            // Check that the game was added to allGames
            const allGames = await gameFactory.getAllGames();
            expect(allGames.length).to.equal(1);
            
            // Verify the game address is valid
            const gameAddress = allGames[0];
            expect(gameAddress).to.not.equal(ethers.ZeroAddress);
            
            // Check that GameCreated event was emitted
            const events = receipt.logs.filter(log => {
                try {
                    return gameFactory.interface.parseLog(log).name === 'GameCreated';
                } catch {
                    return false;
                }
            });
            expect(events.length).to.equal(1);
            
            const parsedEvent = gameFactory.interface.parseLog(events[0]);
            expect(parsedEvent.args.gameAddress).to.equal(gameAddress);
            expect(parsedEvent.args.master).to.equal(owner.address);
            expect(parsedEvent.args.entryFee).to.equal(entryFee);
            expect(parsedEvent.args.serviceFeePercent).to.equal(serviceFeePercent);
            expect(parsedEvent.args.depositPercent).to.equal(depositPercent);
            expect(parsedEvent.args.commitBlocks).to.equal(commitBlocks);
            expect(parsedEvent.args.revealBlocks).to.equal(revealBlocks);
            expect(parsedEvent.args.maxPlayers).to.equal(maxPlayers);
        });

        it("Should create multiple games", async function () {
            // Create first game
            await gameFactory.createGame(
                entryFee,
                serviceFeePercent,
                depositPercent,
                commitBlocks,
                revealBlocks,
                maxPlayers
            );

            // Create second game with different parameters
            await gameFactory.createGame(
                ethers.parseEther("0.2"),
                20,
                25,
                100,
                100,
                20
            );

            expect(await gameFactory.totalGames()).to.equal(2);
            const allGames = await gameFactory.getAllGames();
            expect(allGames.length).to.equal(2);
            expect(allGames[0]).to.not.equal(allGames[1]);
        });

        it("Should only allow game master to create games", async function () {
            await expect(
                gameFactory.connect(addr1).createGame(
                    entryFee,
                    serviceFeePercent,
                    depositPercent,
                    commitBlocks,
                    revealBlocks,
                    maxPlayers
                )
            ).to.be.revertedWithCustomError(gameFactory, "OnlyGameMaster");
        });

        it("Should validate game parameters through Game contract", async function () {
            // Test invalid entry fee (0)
            await expect(
                gameFactory.createGame(
                    0,
                    serviceFeePercent,
                    depositPercent,
                    commitBlocks,
                    revealBlocks,
                    maxPlayers
                )
            ).to.be.reverted; // Game contract will revert

            // Test invalid service fee percent (0)
            await expect(
                gameFactory.createGame(
                    entryFee,
                    0,
                    depositPercent,
                    commitBlocks,
                    revealBlocks,
                    maxPlayers
                )
            ).to.be.reverted;

            // Test invalid max players (<3)
            await expect(
                gameFactory.createGame(
                    entryFee,
                    serviceFeePercent,
                    depositPercent,
                    commitBlocks,
                    revealBlocks,
                    2
                )
            ).to.be.reverted;
        });
    });

    describe("Game Instance Verification", function () {
        it("Should create Game instances with correct parameters", async function () {
            const entryFee = ethers.parseEther("0.1");
            const serviceFeePercent = 10;
            const depositPercent = 50;
            const commitBlocks = 50;
            const revealBlocks = 50;
            const maxPlayers = 10;

            await gameFactory.createGame(
                entryFee,
                serviceFeePercent,
                depositPercent,
                commitBlocks,
                revealBlocks,
                maxPlayers
            );

            const allGames = await gameFactory.getAllGames();
            const gameAddress = allGames[0];
            
            // Connect to the created Game instance
            const game = Game.attach(gameAddress);
            
            // Verify game parameters
            expect(await game.entryFee()).to.equal(entryFee);
            expect(await game.serviceFeePercent()).to.equal(serviceFeePercent);
            expect(await game.depositPercent()).to.equal(depositPercent);
            expect(await game.maxPlayers()).to.equal(maxPlayers);
            expect(await game.gameMaster()).to.equal(owner.address);
            expect(await game.factory()).to.equal(await gameFactory.getAddress());
            
            // Verify phase timing
            const currentBlock = await ethers.provider.getBlockNumber();
            expect(await game.commitPhaseEnd()).to.equal(currentBlock + commitBlocks);
            expect(await game.revealPhaseEnd()).to.equal(currentBlock + commitBlocks + revealBlocks);
            
            // Verify initial state
            expect(await game.totalPlayers()).to.equal(0);
            expect(await game.currentPhase()).to.equal(0); // commit phase
            expect(await game.executed()).to.equal(false);
            expect(await game.pot()).to.equal(0);
        });
    });

    describe("View Functions", function () {
        it("Should return correct game count and list", async function () {
            expect(await gameFactory.totalGames()).to.equal(0);
            expect((await gameFactory.getAllGames()).length).to.equal(0);

            // Create first game
            await gameFactory.createGame(
                ethers.parseEther("0.1"),
                10,
                50,
                50,
                50,
                10
            );

            expect(await gameFactory.totalGames()).to.equal(1);
            expect((await gameFactory.getAllGames()).length).to.equal(1);

            // Create second game
            await gameFactory.createGame(
                ethers.parseEther("0.2"),
                20,
                25,
                100,
                100,
                20
            );

            expect(await gameFactory.totalGames()).to.equal(2);
            const allGames = await gameFactory.getAllGames();
            expect(allGames.length).to.equal(2);
            
            // Verify games are different
            expect(allGames[0]).to.not.equal(allGames[1]);
        });
    });
});

