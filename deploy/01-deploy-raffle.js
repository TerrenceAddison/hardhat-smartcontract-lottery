const { getNamedAccounts, deployments, network, ethers } = require("hardhat");
const { developmentChains, networkConfig, VERIFICATION_BLOCK_CONFIRMATIONS } = require("../helper-hardhat.config");
const { verify } = require("../utils/verify")


const VRF_SUBSCRIPTION_FUND_AMOUNT = ethers.utils.parseEther("2");

module.exports = async function ({getNamedAccounts, deployments}) {
    const{deploy, log } = deployments;
    const {deployer} = await getNamedAccounts();
    const chainId = network.config.chainId;
    let vrfCoordinatorV2address, subscriptionId;

    if(developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2address = vrfCoordinatorV2Mock.address;
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await transactionResponse.wait(1);
        subscriptionId = transactionReceipt.events[0].args.subId;
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUBSCRIPTION_FUND_AMOUNT);
    } else {
        vrfCoordinatorV2address = networkConfig[chainId]["VRFCoordinatorV2"];
        subscriptionId = networkConfig[chainId]["subscriptionId"];

    }
    const waitBlockConfirmations = developmentChains.includes(network.name) ? 1 : VERIFICATION_BLOCK_CONFIRMATIONS
    const entranceFee = networkConfig[chainId]["entranceFee"];
    const gasLane = networkConfig[chainId]["gasLane"];
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
    const interval = networkConfig[chainId]["interval"];
    const args = [vrfCoordinatorV2address, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval];
    const raffle = await deploy("Raffle", {
        from:deployer,
        args: args,
        log: true,
        waitConfirmations: waitBlockConfirmations,

    })

    if(!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log(process.env.ETHERSCAN_API_KEY);
        log("verifying");
        await verify(raffle.address, args);
    }
    log("done");
}

module.exports.tags = ["all", "raffle"];