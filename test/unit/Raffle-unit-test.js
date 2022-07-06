const {network,ethers,getNamedAccounts, deployments} = require("hardhat")
const {developmentChains,networkConfig} = require("../../helper-hardhat-config.js")
const {assert, expect}= require("chai")


!developmentChains.includes(network.name)
    ? describe.skip
    :describe("Raffle Contract", ()=>{
   let deployer, raffle,raffleContract, chainId, player, accounts;
   let interval, raffleState, raffleValue, VRFCoordinatorV2Mock;

    beforeEach(async()=>{
       await deployments.fixture("all");
       raffleContract = await ethers.getContract("Raffle");
       accounts = await ethers.getSigners()
       player = accounts[1];
       raffle = await raffleContract.connect(player);
       interval = await raffle.getInterval();
       chainId = network.config.chainId
       raffleState = await raffle.getRaffleState()
       raffleValue = await ethers.utils.parseEther("1")

       VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");

    })

    // ============ CONSTRUCTOR ==========
    describe("Constructor",()=>{
        it("sets arguments correctly",async()=>{
          assert.equal (interval.toString(), networkConfig[chainId]["interval"])
          assert.equal (raffleState, "0")
        })
    });

    // ================ Enter Raffle ================= 
    describe("EnterRaffle", ()=>{
        it("Reverts when no enough value is sent",async()=>{
           await expect(raffle.enterRaffle([])).to.be.revertedWith("Raffle__NOT_ENOUGH_ENTRANCE_FEE()");
        })

        it("does not allow when the raffle is calculating",async()=>{
            await raffle.enterRaffle({value: raffleValue })
            await network.provider.send("evm_increaseTime", [interval.toNumber()+1]);  // increases time or jumps forward in time
            await network.provider.request({method: "evm_mine", params: []});
            await raffle.performUpkeep([]);
            await  expect (raffle.enterRaffle({value: raffleValue })).to.be.revertedWith('Raffle__RaffleNotOpen()')
        })

        it("pushes players on array", async()=>{
           await raffle.enterRaffle({value: raffleValue })
           const connectedPlayer = await raffle.getPlayer(0)
           assert.equal(connectedPlayer, player.address)
        })

        it("Emits an Event", async()=>{
         await expect (raffle.enterRaffle({value: raffleValue })).to.emit(raffle, "RaffleEnter")
         
        })
    })

    // ================ upkeep ==============
    describe("upkeep",()=>{
        it("returns true for if all conditions  are met", async()=>{
            await raffle.enterRaffle({value: raffleValue })
            await network.provider.send("evm_increaseTime", [interval.toNumber()+1]); 
            await network.provider.request({method: "evm_mine", params: []});
            const  {upkeepNeeded} = await raffle.callStatic.checkUpkeep([]);
            assert(upkeepNeeded)
        })

        it("returns falls if enough time has not passed", async()=>{
            await raffle.enterRaffle({value: raffleValue })
            await network.provider.send("evm_increaseTime", [interval.toNumber()-5]); 
            await network.provider.request({method: "evm_mine", params: []});
            const  {upkeepNeeded} = await raffle.callStatic.checkUpkeep([]);
            assert(!upkeepNeeded)
        })
    })

    // ================= perform upkeep ==================
    describe("perform upkeep", ()=>{
        it("Reverts if  upkeep is  fasle", async()=>{
            await expect(raffle.performUpkeep([])).to.be.revertedWith('Raffle__UpkeepNotNeeded()');
        })

        it("Sets raffle state to calculating", async()=>{
            await raffle.enterRaffle({value: raffleValue })
            await network.provider.send("evm_increaseTime", [interval.toNumber()+1]); 
            await network.provider.request({method: "evm_mine", params: []});
            await raffle.performUpkeep([]);
            assert.equal(await raffle.getRaffleState(),1)
        })

        it("emits a request id ", async()=>{
            await raffle.enterRaffle({value: raffleValue })
            await network.provider.send("evm_increaseTime", [interval.toNumber()+1]); 
            await network.provider.request({method: "evm_mine", params: []});
            const txResponse = await raffle.performUpkeep([]);
            const  txReceipt = await txResponse.wait(1);
            const requestId = await txReceipt.events[1].args.requestId;
            assert(requestId.toNumber() > 0)
        })
    })

    // ======================== fulfill randomWords   ===============
    describe("FulfullRandomWords",()=>{
        beforeEach(async()=>{
            await raffle.enterRaffle({value: raffleValue })
            await network.provider.send("evm_increaseTime", [interval.toNumber()+1]); 
            await network.provider.request({method: "evm_mine", params: []});
        })

        it("Can only be called after perform upkeep", async()=>{
             await expect(VRFCoordinatorV2Mock.fulfillRandomWords(0,raffle.address)).to.be.revertedWith("nonexistent request");
        })

        it("Picks a winner, resets everything and sends money", async()=>{
            //  connet some players 
            const additionalEntrances = 3
            const startingIndex = 2
            for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                raffle = raffleContract.connect(accounts[i])
                await raffle.enterRaffle({ value: raffleValue })
            }

            // get timestamp
          //  const startingTimeStamp = await raffle.getLastTimeStamp()

            // get winner in  a promise
            await new Promise(async(resolve, reject) => { 
              raffle.once("WinnerPicked", async()=>{
                try {
                    const recentWinner = await raffle.getWinner()
                    const raffleState = await raffle.getRaffleState()
                    const winnerBalance = await accounts[2].getBalance()
                   // const endingTimeStamp = await raffle.getLastTimeStamp()
                    await expect(raffle.getPlayer(0)).to.be.reverted
                    assert.equal(recentWinner.toString(), accounts[2].address)
                    assert.equal(raffleState, 0)
                    assert.equal(
                        winnerBalance.toString(),
                        startingBalance
                            .add(
                                raffleValue
                                    .mul(additionalEntrances)
                                    .add(raffleValue)
                            )
                            .toString()
                    )
                  //  assert(endingTimeStamp > startingTimeStamp)
                    resolve()
                } catch (error) {
                    reject(error)
                }
              }) // end of WinnerPicked event 
              
              const tx = await raffle.performUpkeep([])
              const txReceipt = await tx.wait(1)
              const startingBalance = await accounts[2].getBalance()
              await VRFCoordinatorV2Mock.fulfillRandomWords(
                  txReceipt.events[1].args.requestId,
                  raffle.address
              )
             }) // end of promise
        })

        
    })

})