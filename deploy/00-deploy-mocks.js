const { getNamedAccounts, deployments, network } = require("hardhat")
const {developmentChains} = require("../helper-hardhat.config")


const BASE_FEE = ethers.utils.parseEther("0.25"); // premium LINK fee per request
const GAS_PRICE_LINK =1e9;  //calculated value based on gas price of the chain A.K.A LINK per gas

module.exports = async function ({getNamedAccounts, deployments}) {
    const {deploy, log} = deployments;
    const {deployer} = await getNamedAccounts();
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if(developmentChains.includes(network.name)) {
        log("local network detected. Deploying mocks");
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,

        })
        log("mock Deployed");
    }
}


module.exports.tags = ["all", "mocks"]