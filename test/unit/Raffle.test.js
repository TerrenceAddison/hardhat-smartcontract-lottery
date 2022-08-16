const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const {developmentChains, networkConfig} = require("../../helper-hardhat.config");

!developmentChains.includes(network.name) ? describe.skip : describe("Raffle Unit Tests", async function () {
    let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
    const chainId = network.config.chainId;


    beforeEach(async function () {
        deployer= (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        raffle = await ethers.getContract("Raffle", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
        raffleEntranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
    })

    describe("constructor", function () {
        it("initializes Raffle correctly", async function () {
            const raffleState = await raffle.getRaffleState();
            assert.equal(raffleState.toString(), '0');
            assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        })
    })

    describe("enterRaffle", function () {
        it("reverts when not enough ETH", async function () {
            await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughEth()");
        })
        it("player is recorded when enterring raffle", async function() {
            await raffle.enterRaffle({value: raffleEntranceFee})
            const playerFromContract = await raffle.getPlayer(0);
            assert.equal(playerFromContract, deployer);
        })
        it("emits event when enterring raffle", async function () {
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.emit(raffle, "RaffleEnter");
        })
        it("doesn't allow entrance when raffle is calculating", async function () {
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])

            await raffle.performUpkeep([])
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.be.revertedWith("Raffle__NotOpen()");
        })
    })

    describe("checkUpKeep", function () {
        it("returns false if people haven't sent any ETH", async function () {
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])

            const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([]) // take the return value of upkeepNeeded
            assert(!upkeepNeeded);
        })
        it("returns false if raffle state is false", async function () {
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            await raffle.performUpkeep([])
            const raffleState = await raffle.getRaffleState();
            const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([]) // take the return value of upkeepNeeded
            assert.equal(raffleState.toString(), "1");
            assert.equal(upkeepNeeded, false);
        })
        it("returns false if enough time hasn't passed", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() - 10])
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) // can be [] or "0x" for blank (hardhat)
            assert.equal(upkeepNeeded, false);
        })
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // can be [] or "0x" for blank (hardhat)
            assert(upkeepNeeded)
        })
    })

    describe("performUpkeep", function () {
        it("can only perform if checkupkeep is true", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const tx = await raffle.performUpkeep([]);
            assert(tx);                 
        })
        it("reverts when checkupkeep is false", async function () {
            await expect(raffle.performUpkeep([])).to.be.revertedWith("Raffle__UpkeepNotNeeded");
        })
        it("updates the raffle state and emits a requestId", async () => {
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const txResponse = await raffle.performUpkeep("0x")
            const txReceipt = await txResponse.wait(1)
            const raffleState = await raffle.getRaffleState()
            const requestId = txReceipt.events[1].args.requestId
            assert(requestId.toNumber() > 0)
            assert(raffleState == 1) // 0 = open, 1 = calculating
        })
    })

    describe("fullfillRandomWords", function () {
        beforeEach(async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
        })
        it("can only becalled after PerformUpkeep", async function () {
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith("nonexistent request");
        })
        it("picks winner, reset lottery, and send money", async function () {
            const additionalEntrants = 3;
            const startingAccountIndex = 1;
            const accounts = await ethers.getSigners();
            for(i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                const accountConnectedRaffle = raffle.connect(accounts[i]);
                await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee });
            }

            const startingTimeStamp = await raffle.getLatestTimeStamp();

            await new Promise(async (resolve, reject) => {
                raffle.once("WinnerPicked", async () => {
                    console.log("event detected")
                    try {
                        const recentWinner = await raffle.getRecentWinner();
                        const raffleState = await raffle.getRaffleState();
                        const endingTimeStamp = await raffle.getLatestTimeStamp();
                        const numPlayers = await raffle.getNumberOfPlayers();
                        const winnerEndingBalance = await accounts[1].getBalance();
                        
                        assert.equal(numPlayers.toString(), "0");
                        assert.equal(raffleState.toString(), "0");
                        assert(endingTimeStamp > startingTimeStamp);

                        assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(raffleEntranceFee.mul(additionalEntrants).add(raffleEntranceFee).toString()))
                    } catch(e) {
                        reject(e)
                    }
                    resolve()
                })
                
                const tx = await raffle.performUpkeep([])
                const txReceipt = await tx.wait(1);
                const winnerStartingBalance = await accounts[1].getBalance();
                await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, raffle.address);
            })


        })
    })
});