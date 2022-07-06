const {network,ethers} = require("hardhat")
const {developmentChains,networkConfig} = require("../helper-hardhat-config.js")
const { verify } = require("../utils/verify")

module.exports = async({getNamedAccounts, deployments})=>{
         const {deploy, log} = deployments;
         const {deployer} = await getNamedAccounts();
         const chainId = network.config.chainId;
         const  FUND_AMOUNT =  "1000000000000000000000";
         let vrfCoordinator,subscriptionId

         if (developmentChains.includes(network.name)){
            VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
            vrfCoordinator = VRFCoordinatorV2Mock.address;
            // get subscription id and fund it
            const txResponse = await VRFCoordinatorV2Mock.createSubscription()
            const txReceipt = await txResponse.wait()
            subscriptionId = txReceipt.events[0].args.subId
            await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT)
         }else{
            vrfCoordinator = await networkConfig[chainId]["vrfCoordinator"];
            subscriptionId = await networkConfig[chainId]["subscriptionId"];
         }


        // ===============
        const arguments = [
            networkConfig[chainId]["entranceFees"],
            vrfCoordinator,
            subscriptionId,
            networkConfig[chainId]["gasLane"],
            networkConfig[chainId]["interval"],
            networkConfig[chainId]["callbackGasLimit"],
        ]
        const waitConfirmationsBlock = developmentChains.includes(network.name) ? 1 : network.config.waitConfirmationsBlock


      const raffle =  await deploy("Raffle",{
            from: deployer,
            log: true,
            args: arguments,
            waitConfirmations: waitConfirmationsBlock,
        })

        log("Raffle Deployed =================================================")
        // verify

        if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
            log("Verifying...")
            await verify(raffle.address, arguments)
        }
}


module.exports.tags = ["all", "raffle"]