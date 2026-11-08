// Human-readable ABI for contracts/HeadlineDuel.sol (full JSON ABI: contracts/abi.json)
const DUEL_TUPLE =
  'tuple(address creator, string question, uint8 category, string a, string b, bool isImage, uint8 aiPick, uint8 aiConfidence, bytes32 aiReasonHash, uint64 endsAt, uint32 votesA, uint32 votesB, uint64 createdBlock, bool ended, bool hidden)';

export const ABI = [
  'function startDuel(string question, uint8 category, string a, string b, bool isImage, uint8 aiPick, uint8 aiConfidence, bytes32 aiReasonHash, string aiReason, uint64 duration) returns (uint256 id)',
  'function vote(uint256 id, uint8 choice, string reason)',
  'function endEarly(uint256 id)',
  'function setHidden(uint256 id, bool hidden)',
  'function totalDuels() view returns (uint256)',
  `function getDuel(uint256 id) view returns (${DUEL_TUPLE})`,
  `function getDuels(uint256 from, uint256 count) view returns (${DUEL_TUPLE}[])`,
  'function hasVoted(uint256 id, address who) view returns (bool)',
  'function voteOf(uint256 id, address who) view returns (uint8)',
  'function winner(uint256 id) view returns (uint8)',
  'function duelsOf(address who) view returns (uint256[] created, uint256[] voted)',
  'function stats() view returns (uint256 duelCount, uint256 voteCount, uint256 aiCorrect, uint256 aiFinished)',
  'function curator() view returns (address)',
  'event DuelStarted(uint256 indexed id, address indexed creator, uint8 aiPick, string aiReason)',
  'event Voted(uint256 indexed id, address indexed voter, uint8 choice, string reason)',
  'event DuelEnded(uint256 indexed id)',
  'event DuelHidden(uint256 indexed id, bool hidden)',
  'error NotFound()',
  'error NotCreator()',
  'error NotCurator()',
  'error BadInput(string what)',
  'error NotLive()',
  'error AlreadyVoted()',
  'error CreatorCannotVote()',
];
