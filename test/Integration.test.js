const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Integration Tests", function () {
    let GameFactory;
    let gameFactory;
    let Game;
    let owner;
    let player1;
    let player2;
    let player3;
    let player4;

    beforeEach(async function () {
        [owner, player1, player2, player3, player4] = await ethers.getSigners();

        GameFactory = await ethers.getContractFactory("GameFactory");
        Game = await ethers.getContractFactory("Game");
        
        gameFactory = await GameFactory.deploy();
        await gameFactory.waitForDeployment();
    });

    describe("Full Game Lifecycle", function () {
        it("Should complete a full game from creation to payout", async function () {
            const entryFee = ethers.parseEther("0.1");
            const serviceFeePercent = 10;
            const depositPercent = 50;
            const commitBlocks = 50;
            const revealBlocks = 50;
            const maxPlayers = 10;

            // 1. Create game
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
            const game = Game.attach(gameAddress);

            // 2. Players commit
            const numbers = [300, 600, 900]; // Average = 600, target = 400
            const salts = ["salt1", "salt2", "salt3"];
            const players = [player1, player2, player3];
            const totalAmount = entryFee + (entryFee * BigInt(depositPercent)) / 100n;

            for (let i = 0; i < players.length; i++) {
                const commitment = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [numbers[i], salts[i]]));
                await game.connect(players[i]).commit(commitment, { value: totalAmount });
            }

            expect(await game.totalPlayers()).to.equal(3);
            expect(await game.pot()).to.equal(entryFee * 3n);

            // 3. Move to reveal phase
            for (let i = 0; i < commitBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }

            // 4. Players reveal
            for (let i = 0; i < players.length; i++) {
                await game.connect(players[i]).reveal(numbers[i], salts[i]);
            }

            // Verify deposits were refunded
            const depositAmount = (entryFee * BigInt(depositPercent)) / 100n;
            for (let i = 0; i < players.length; i++) {
                expect(await game.balances(players[i].address)).to.equal(depositAmount);
            }

            // 5. Move to finalization phase
            for (let i = 0; i < revealBlocks + 1; i++) {
                await ethers.provider.send("evm_mine");
            }

            // 6. Finalize game
            await game.finalize();

            // Winner should be player1 (300 is closest to target 400)
            expect(await game.winner()).to.equal(player1.address);
            expect(await game.executed()).to.equal(true);

            // 7. Check payouts
            const totalPot = entryFee * 3n;
            const serviceFee = (totalPot * BigInt(serviceFeePercent)) / 100n;
            const payout = totalPot - serviceFee;

            expect(await game.balances(owner.address)).to.equal(serviceFee);
            expect(await game.balances(player1.address)).to.equal(depositAmount + payout);

            // 8. Players withdraw
            const player1BalanceBefore = await ethers.provider.getBalance(player1.address);
            const tx = await game.connect(player1).withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;
            const player1BalanceAfter = await ethers.provider.getBalance(player1.address);

            expect(player1BalanceAfter).to.equal(
                player1BalanceBefore + depositAmount + payout - gasUsed
            );
            expect(await game.balances(player1.address)).to.equal(0);
        });

        it("Should handle multiple concurrent games", async function () {
            const entryFee1 = ethers.parseEther("0.1");
            const entryFee2 = ethers.parseEther("0.2");

            // Create two games with different parameters
            await gameFactory.createGame(entryFee1, 10, 50, 50, 50, 10);
            await gameFactory.createGame(entryFee2, 20, 25, 100, 100, 20);

            const allGames = await gameFactory.getAllGames();
            expect(allGames.length).to.equal(2);

            const game1 = Game.attach(allGames[0]);
            const game2 = Game.attach(allGames[1]);

            // Verify games have different parameters
            expect(await game1.entryFee()).to.equal(entryFee1);
            expect(await game2.entryFee()).to.equal(entryFee2);
            expect(await game1.serviceFeePercent()).to.equal(10);
            expect(await game2.serviceFeePercent()).to.equal(20);

            // Players can participate in both games
            const commitment1 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [300, "salt1"]));
            const commitment2 = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [600, "salt2"]));

            const totalAmount1 = entryFee1 + (entryFee1 * 50n) / 100n;
            const totalAmount2 = entryFee2 + (entryFee2 * 25n) / 100n;

            await game1.connect(player1).commit(commitment1, { value: totalAmount1 });
            await game2.connect(player1).commit(commitment2, { value: totalAmount2 });

            expect(await game1.totalPlayers()).to.equal(1);
            expect(await game2.totalPlayers()).to.equal(1);
        });

        it("Should handle game with minimum parameters", async function () {
            // Test with minimum valid parameters
            const minEntryFee = 1; // 1 wei
            const minServiceFee = 1; // 1%
            const minDeposit = 1; // 1%
            const minCommitBlocks = 10;
            const minRevealBlocks = 10;
            const minPlayers = 3;

            await gameFactory.createGame(
                minEntryFee,
                minServiceFee,
                minDeposit,
                minCommitBlocks,
                minRevealBlocks,
                minPlayers
            );

            const allGames = await gameFactory.getAllGames();
            const game = Game.attach(allGames[0]);

            expect(await game.entryFee()).to.equal(minEntryFee);
            expect(await game.serviceFeePercent()).to.equal(minServiceFee);
            expect(await game.depositPercent()).to.equal(minDeposit);
            expect(await game.maxPlayers()).to.equal(minPlayers);
        });

        it("Should handle game with maximum reasonable parameters", async function () {
            // Test with high but valid parameters
            const highEntryFee = ethers.parseEther("10");
            const maxServiceFee = 100; // 100%
            const maxDeposit = 100; // 100%
            const highCommitBlocks = 1000;
            const highRevealBlocks = 1000;
            const highMaxPlayers = 1000;

            await gameFactory.createGame(
                highEntryFee,
                maxServiceFee,
                maxDeposit,
                highCommitBlocks,
                highRevealBlocks,
                highMaxPlayers
            );

            const allGames = await gameFactory.getAllGames();
            const game = Game.attach(allGames[0]);

            expect(await game.entryFee()).to.equal(highEntryFee);
            expect(await game.serviceFeePercent()).to.equal(maxServiceFee);
            expect(await game.depositPercent()).to.equal(maxDeposit);
            expect(await game.maxPlayers()).to.equal(highMaxPlayers);
        });
    });

    describe("Error Scenarios", function () {
        it("Should handle game creation failures gracefully", async function () {
            // Try to create game with invalid parameters
            await expect(
                gameFactory.createGame(0, 10, 50, 50, 50, 10) // Invalid entry fee
            ).to.be.reverted;

            // Factory should still be in valid state
            expect(await gameFactory.totalGames()).to.equal(0);
            expect((await gameFactory.getAllGames()).length).to.equal(0);

            // Should be able to create valid game after failure
            await gameFactory.createGame(
                ethers.parseEther("0.1"),
                10,
                50,
                50,
                50,
                10
            );

            expect(await gameFactory.totalGames()).to.equal(1);
        });

        it("Should handle non-game master trying to create games", async function () {
            await expect(
                gameFactory.connect(player1).createGame(
                    ethers.parseEther("0.1"),
                    10,
                    50,
                    50,
                    50,
                    10
                )
            ).to.be.revertedWithCustomError(gameFactory, "OnlyGameMaster");

            expect(await gameFactory.totalGames()).to.equal(0);
        });
    });

    describe("Gas Optimization Tests", function () {
        it("Should have reasonable gas costs for common operations", async function () {
            const entryFee = ethers.parseEther("0.1");
            
            // Game creation
            const createTx = await gameFactory.createGame(entryFee, 10, 50, 50, 50, 10);
            const createReceipt = await createTx.wait();
            console.log("Game creation gas:", createReceipt.gasUsed.toString());

            const allGames = await gameFactory.getAllGames();
            const game = Game.attach(allGames[0]);
            const totalAmount = entryFee + (entryFee * 50n) / 100n;

            // Commit
            const commitment = ethers.keccak256(ethers.solidityPacked(["uint256", "string"], [300, "salt"]));
            const commitTx = await game.connect(player1).commit(commitment, { value: totalAmount });
            const commitReceipt = await commitTx.wait();
            console.log("Commit gas:", commitReceipt.gasUsed.toString());

            // Move to reveal phase
            for (let i = 0; i < 51; i++) {
                await ethers.provider.send("evm_mine");
            }

            // Reveal
            const revealTx = await game.connect(player1).reveal(300, "salt");
            const revealReceipt = await revealTx.wait();
            console.log("Reveal gas:", revealReceipt.gasUsed.toString());

            // These are just informational - in a real test you might want to assert upper bounds
            expect(createReceipt.gasUsed).to.be.lessThan(3000000); // 3M gas limit
            expect(commitReceipt.gasUsed).to.be.lessThan(200000);
            expect(revealReceipt.gasUsed).to.be.lessThan(100000);
        });
    });
});

