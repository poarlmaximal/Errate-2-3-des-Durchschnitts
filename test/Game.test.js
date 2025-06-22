const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Game", function () {
    let GameFactory;
    let gameFactory;
    let Game;
    let game;
    let owner;
    let player1;
    let player2;
    let player3;
    let player4;
    let addrs;

    // Game parameters
    const entryFee = ethers.parseEther("0.1");
    const serviceFeePercent = 10;
    const depositPercent = 50;
    const commitBlocks = 50;
    const revealBlocks = 50;
    const maxPlayers = 10;

    beforeEach(async function () {
        [owner, player1, player2, player3, player4, ...addrs] = await ethers.getSigners();

        // Deploy GameFactory
        GameFactory = await ethers.getContractFactory("GameFactory");
        gameFactory = await GameFactory.deploy();
        await gameFactory.waitForDeployment();

        // Create a game
        await gameFactory.createGame(
            entryFee,
            serviceFeePercent,
            depositPercent,
            commitBlocks,
            revealBlocks,
            maxPlayers
        );

        // Get the game instance
        const allGames = await gameFactory.getAllGames();
        const gameAddress = allGames[0];
        Game = await ethers.getContractFactory("Game");
        game = Game.attach(gameAddress);
    });

    describe("Deployment and Initial State", function () {
        it("Should set correct game parameters", async function () {
            expect(await game.entryFee()).to.equal(entryFee);
            expect(await game.serviceFeePercent()).to.equal(serviceFeePercent);
            expect(await game.depositPercent()).to.equal(depositPercent);
            expect(await game.maxPlayers()).to.equal(maxPlayers);
            expect(await game.gameMaster()).to.equal(owner.address);
            expect(await game.factory()).to.equal(await gameFactory.getAddress());
        });

        it("Should calculate deposit amount correctly", async function () {
            const expectedDeposit = (entryFee * BigInt(depositPercent)) / 100n;
            expect(await game.depositAmount()).to.equal(expectedDeposit);
        });

        it("Should set correct phase timing", async function () {
            const currentBlock = await ethers.provider.getBlockNumber();
            expect(await game.commitPhaseEnd()).to.equal(currentBlock + commitBlocks);
            expect(await game.revealPhaseEnd()).to.equal(currentBlock + commitBlocks + revealBlocks);
        });

        it("Should start in commit phase", async function () {
            expect(await game.currentPhase()).to.equal(0);
        });

        it("Should have initial state values", async function () {
            expect(await game.totalPlayers()).to.equal(0);
            expect(await game.pot()).to.equal(0);
            expect(await game.executed()).to.equal(false);
            expect(await game.winner()).to.equal(ethers.ZeroAddress);
        });

        it("Should reject direct ether transfers", async function () {
            await expect(
                player1.sendTransaction({
                    to: await game.getAddress(),
                    value: ethers.parseEther("1.0")
                })
            ).to.be.revertedWithCustomError(game, "DirectEtherNotAllowed");
        });
    });

    describe("Commit Phase", function () {
        const number = 500;
        const salt = "mysecret";
        let commitment;
        let totalAmount;

        beforeEach(function () {
            commitment = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [number, salt]));
            totalAmount = entryFee + (entryFee * BigInt(depositPercent)) / 100n;
        });

        it("Should allow valid commits", async function () {
            await expect(
                game.connect(player1).commit(commitment, { value: totalAmount })
            ).to.not.be.reverted;

            expect(await game.totalPlayers()).to.equal(1);
            expect(await game.commitments(player1.address)).to.equal(commitment);
            expect(await game.deposits(player1.address)).to.equal((entryFee * BigInt(depositPercent)) / 100n);
            expect(await game.pot()).to.equal(entryFee);
        });

        it("Should reject commits with wrong amount", async function () {
            const wrongAmount = entryFee; // Missing deposit
            await expect(
                game.connect(player1).commit(commitment, { value: wrongAmount })
            ).to.be.revertedWithCustomError(game, "WrongAmount");
        });

        it("Should reject commits when max players reached", async function () {
            // Fill up the game to max players
            for (let i = 0; i < maxPlayers; i++) {
                const playerCommitment = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [100 + i, "salt" + i]));
                await game.connect(addrs[i]).commit(playerCommitment, { value: totalAmount });
            }

            // Try to add one more player
            await expect(
                game.connect(player1).commit(commitment, { value: totalAmount })
            ).to.be.revertedWithCustomError(game, "MaxPlayersReached");
        });

        it("Should reject duplicate commits from same player", async function () {
            await game.connect(player1).commit(commitment, { value: totalAmount });
            
            await expect(
                game.connect(player1).commit(commitment, { value: totalAmount })
            ).to.be.revertedWithCustomError(game, "AlreadyCommitted");
        });

        it("Should reject commits outside commit phase", async function () {
            // Mine blocks to move past commit phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }

            await expect(
                game.connect(player1).commit(commitment, { value: totalAmount })
            ).to.be.revertedWithCustomError(game, "NotInCommit");
        });
    });

    describe("Reveal Phase", function () {
        const number1 = 500;
        const salt1 = "mysecret1";
        const number2 = 300;
        const salt2 = "mysecret2";
        const number3 = 700;
        const salt3 = "mysecret3";
        
        let commitment1, commitment2, commitment3;
        let totalAmount;

        beforeEach(async function () {
            commitment1 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [number1, salt1]));
            commitment2 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [number2, salt2]));
            commitment3 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [number3, salt3]));
            totalAmount = entryFee + (entryFee * BigInt(depositPercent)) / 100n;

            // Commit phase
            await game.connect(player1).commit(commitment1, { value: totalAmount });
            await game.connect(player2).commit(commitment2, { value: totalAmount });
            await game.connect(player3).commit(commitment3, { value: totalAmount });

            // Move to reveal phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }
        });

        it("Should allow valid reveals", async function () {
            await expect(
                game.connect(player1).reveal(number1, salt1)
            ).to.not.be.reverted;

            expect(await game.revealed(player1.address)).to.equal(number1);
            expect(await game.hasRevealed(player1.address)).to.equal(true);
            expect(await game.deposits(player1.address)).to.equal(0); // Deposit refunded
            expect(await game.balances(player1.address)).to.equal((entryFee * BigInt(depositPercent)) / 100n);
        });

        it("Should reject reveals with wrong hash", async function () {
            await expect(
                game.connect(player1).reveal(number1, "wrongsalt")
            ).to.be.revertedWithCustomError(game, "HashMismatch");
        });

        it("Should reject reveals with number out of range", async function () {
            const invalidNumber = 1001;
            const invalidSalt = "salt";
            const invalidCommitment = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [invalidNumber, invalidSalt]));
            
            // Create a new game for this test since we're already in reveal phase
            const GameFactory = await ethers.getContractFactory("GameFactory");
            const newGameFactory = await GameFactory.deploy();
            await newGameFactory.waitForDeployment();

            await newGameFactory.createGame(entryFee, serviceFeePercent, depositPercent, commitBlocks, revealBlocks, maxPlayers);
            const allGames = await newGameFactory.getAllGames();
            const newGame = Game.attach(allGames[0]);
            
            // First commit with invalid number (this should work)
            await newGame.connect(player4).commit(invalidCommitment, { value: totalAmount });
            
            // Move to reveal phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }
            
            // Then try to reveal (this should fail)
            await expect(
                newGame.connect(player4).reveal(invalidNumber, invalidSalt)
            ).to.be.revertedWithCustomError(newGame, "NumberOutOfRange");
        });

        it("Should reject reveals from non-committed players", async function () {
            await expect(
                game.connect(player4).reveal(number1, salt1)
            ).to.be.revertedWithCustomError(game, "NoCommitmentFound");
        });

        it("Should reject duplicate reveals", async function () {
            await game.connect(player1).reveal(number1, salt1);
            
            await expect(
                game.connect(player1).reveal(number1, salt1)
            ).to.be.revertedWithCustomError(game, "AlreadyRevealed");
        });

        it("Should reject reveals outside reveal phase", async function () {
            // Move past reveal phase
            for (let i = 0; i < revealBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }

            await expect(
                game.connect(player1).reveal(number1, salt1)
            ).to.be.revertedWithCustomError(game, "NotInReveal");
        });
    });

    describe("Finalization Phase", function () {
        const number1 = 300; // Target will be 2/3 * (300+600+900)/3 = 2/3 * 600 = 400
        const salt1 = "salt1";
        const number2 = 600;
        const salt2 = "salt2";
        const number3 = 900;
        const salt3 = "salt3";
        
        let commitment1, commitment2, commitment3;
        let totalAmount;

        beforeEach(async function () {
            commitment1 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [number1, salt1]));
            commitment2 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [number2, salt2]));
            commitment3 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [number3, salt3]));
            totalAmount = entryFee + (entryFee * BigInt(depositPercent)) / 100n;

            // Commit phase
            await game.connect(player1).commit(commitment1, { value: totalAmount });
            await game.connect(player2).commit(commitment2, { value: totalAmount });
            await game.connect(player3).commit(commitment3, { value: totalAmount });

            // Move to reveal phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }

            // Reveal phase
            await game.connect(player1).reveal(number1, salt1);
            await game.connect(player2).reveal(number2, salt2);
            await game.connect(player3).reveal(number3, salt3);

            // Move past reveal phase
            for (let i = 0; i < revealBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }
        });

        it("Should finalize game and determine winner correctly", async function () {
            const tx = await game.finalize();
            const receipt = await tx.wait();

            expect(await game.executed()).to.equal(true);
            
            // Target = 2/3 * (300+600+900)/3 = 2/3 * 600 = 400
            // Distances: |300-400|=100, |600-400|=200, |900-400|=500
            // Winner should be player1 (300)
            expect(await game.winner()).to.equal(player1.address);

            // Check pot distribution
            const totalPot = entryFee * 3n;
            const serviceFee = (totalPot * BigInt(serviceFeePercent)) / 100n;
            const payout = totalPot - serviceFee;

            expect(await game.balances(owner.address)).to.equal(serviceFee); // Game master gets service fee
            expect(await game.balances(player1.address)).to.be.greaterThan(payout / 2n); // Winner gets payout + deposit refund

            // Check GameFinalized event
            const events = receipt.logs.filter(log => {
                try {
                    return game.interface.parseLog(log).name === 'GameFinalized';
                } catch {
                    return false;
                }
            });
            expect(events.length).to.equal(1);
            
            const parsedEvent = game.interface.parseLog(events[0]);
            expect(parsedEvent.args.winnerAddress).to.equal(player1.address);
            expect(parsedEvent.args.winningNumber).to.equal(number1);
        });

        it("Should reject finalization before reveal phase ends", async function () {
            // Reset to reveal phase
            const GameFactory = await ethers.getContractFactory("GameFactory");
            const newGameFactory = await GameFactory.deploy();
            await newGameFactory.waitForDeployment();

            await newGameFactory.createGame(entryFee, serviceFeePercent, depositPercent, commitBlocks, revealBlocks, maxPlayers);
            const allGames = await newGameFactory.getAllGames();
            const newGame = Game.attach(allGames[0]);

            // Commit and reveal but don't move past reveal phase
            await newGame.connect(player1).commit(commitment1, { value: totalAmount });
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }
            await newGame.connect(player1).reveal(number1, salt1);

            await expect(
                newGame.finalize()
            ).to.be.revertedWithCustomError(newGame, "RevealPhaseNotEndedYet");
        });

        it("Should reject duplicate finalization", async function () {
            await game.finalize();
            
            await expect(
                game.finalize()
            ).to.be.revertedWithCustomError(game, "AlreadyFinalized");
        });
    });

    describe("Withdrawal and Pull Payments", function () {
        let totalAmount;

        beforeEach(async function () {
            totalAmount = entryFee + (entryFee * BigInt(depositPercent)) / 100n;
        });

        it("Should allow withdrawal of balances", async function () {
            const commitment1 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [300, "salt1"]));
            
            await game.connect(player1).commit(commitment1, { value: totalAmount });

            // Move to reveal phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }

            await game.connect(player1).reveal(300, "salt1");

            // Player should have deposit refund in balance
            const depositAmount = (entryFee * BigInt(depositPercent)) / 100n;
            expect(await game.balances(player1.address)).to.equal(depositAmount);

            const balanceBefore = await ethers.provider.getBalance(player1.address);
            const tx = await game.connect(player1).withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;
            const balanceAfter = await ethers.provider.getBalance(player1.address);

            expect(balanceAfter).to.equal(balanceBefore + depositAmount - gasUsed);
            expect(await game.balances(player1.address)).to.equal(0);
        });

        it("Should reject withdrawal when no balance", async function () {
            await expect(
                game.connect(player1).withdraw()
            ).to.be.revertedWithCustomError(game, "NoBalance");
        });
    });

    describe("Phase Management", function () {
        it("Should return correct current phase", async function () {
            // Initially in commit phase
            expect(await game.currentPhase()).to.equal(0);

            // Move to reveal phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }
            expect(await game.currentPhase()).to.equal(1);

            // Move to ended phase
            for (let i = 0; i < revealBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }
            expect(await game.currentPhase()).to.equal(2);
        });
    });

    describe("Edge Cases and Security", function () {
        it("Should handle boundary numbers (0 and 1000)", async function () {
            const totalAmount = entryFee + (entryFee * BigInt(depositPercent)) / 100n;
            
            const commitment0 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [0, "salt0"]));
            const commitment1000 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [1000, "salt1000"]));
            const commitment500 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [500, "salt500"]));

            await game.connect(player1).commit(commitment0, { value: totalAmount });
            await game.connect(player2).commit(commitment1000, { value: totalAmount });
            await game.connect(player3).commit(commitment500, { value: totalAmount });

            // Move to reveal phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }

            await expect(game.connect(player1).reveal(0, "salt0")).to.not.be.reverted;
            await expect(game.connect(player2).reveal(1000, "salt1000")).to.not.be.reverted;
            await expect(game.connect(player3).reveal(500, "salt500")).to.not.be.reverted;

            expect(await game.revealed(player1.address)).to.equal(0);
            expect(await game.revealed(player2.address)).to.equal(1000);
            expect(await game.revealed(player3.address)).to.equal(500);
        });
    });
});

