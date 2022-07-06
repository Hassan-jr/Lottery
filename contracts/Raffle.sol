// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";


error Raffle__NOT_ENOUGH_ENTRANCE_FEE();
error  Raffle__TransferFailed();
error  Raffle__RaffleNotOpen();
error Raffle__UpkeepNotNeeded();

contract Raffle is VRFConsumerBaseV2,KeeperCompatibleInterface {
    // type declarations
    enum RaffleState {
          OPEN,
        CALCULATING
    }

    // state variables
    //Chainlink variables
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint64 private immutable i_subscriptionId;
    bytes32  immutable private i_gasLane;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;


    // contract variables
    address  payable[] private s_players;
    uint256  immutable private i_entranceFees;
    address  payable private s_recentWinner;
    uint256  immutable private i_interval;
    uint256 private s_lastTimeStamp;
    RaffleState private s_raffleState;

    // events
      event RaffleEnter(address indexed player);
      event WinnerPicked(address indexed player);
      event RequestedRaffleWinner(uint256 indexed requestId);

    // constructor
    constructor(
        uint256 entranceFees, 
        address vrfCoordinator,
        uint64 subscriptionId,
        bytes32 gasLane, // keyHash
        uint256 interval,
        uint32 callbackGasLimit
    )  VRFConsumerBaseV2(vrfCoordinator){
        i_entranceFees = entranceFees;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinator);
        i_gasLane = gasLane; 
        i_interval = interval;
        i_subscriptionId = subscriptionId;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_callbackGasLimit = callbackGasLimit;
    }

    // functons

    // ENTER RAFFLE
    function enterRaffle() public payable {
        if (msg.value < i_entranceFees){
            revert Raffle__NOT_ENOUGH_ENTRANCE_FEE();
        }
         if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__RaffleNotOpen();
        }
        //    push players in an array
        s_players.push(payable(msg.sender));
        // emit the entered player for the frontend
        emit RaffleEnter(msg.sender);
    }
       
    //    chainlink keepers
    function checkUpkeep(bytes memory /* checkData */) public view override returns (bool upkeepNeeded, bytes memory /* performData */) {
        bool timePassed = (block.timestamp - s_lastTimeStamp) > i_interval;
        bool isOpen =   RaffleState.OPEN == s_raffleState ;
        bool hasPlayers  = s_players.length > 0;
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers);

        return (upkeepNeeded, "0x0");

    }




    //  RANDOM NUMBER (2 functions)

 function performUpkeep(bytes calldata /* performData */) external override  {
        (bool upkeepNeeded, ) = checkUpkeep("");
       if (!upkeepNeeded){
        revert Raffle__UpkeepNotNeeded();
       }
      s_raffleState = RaffleState.CALCULATING;
      uint256 requestId = i_vrfCoordinator.requestRandomWords(
          i_gasLane,
          i_subscriptionId,
          REQUEST_CONFIRMATIONS,
          i_callbackGasLimit,
          NUM_WORDS
        );
         emit RequestedRaffleWinner(requestId); // redundant and does not do anything
  }
    
    // get  random number in array and pick a winner
   function fulfillRandomWords(
    uint256, /* requestId */
    uint256[] memory randomWords
  ) internal override {
    uint256 indexOfWinner = randomWords[0] % s_players.length;
    address payable recentWinner = s_players[indexOfWinner];
    s_recentWinner = recentWinner;
     s_raffleState = RaffleState.OPEN;
    // s_lastTimeStamp = block.timestamp;

    s_players = new address payable[](0);
    (bool  success,  ) = s_recentWinner.call{value: address(this).balance}("");

    if (!success){
        revert  Raffle__TransferFailed();
    }

      emit WinnerPicked(recentWinner);

  }

    // view / pure functions

    //  get  a specific player
    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    // get winner
    function getWinner() public  view  returns(address){
        return s_recentWinner;
    }
    // get entrance fee
    function getEntranceFee () public view returns(uint256){
        return i_entranceFees;
    }
    // get raffle state
    function getRaffleState() public view  returns (RaffleState) {
        return s_raffleState;
    }
    // get interval
    function getInterval  () public view returns (uint256){
        return i_interval;
    }
  
}
