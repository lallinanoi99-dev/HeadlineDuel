// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Headline Duel — two versions, one winner.
/// @notice Creators post two versions (A/B) of a headline, tagline, ad, etc.
///         An AI prediction is locked in at creation (pick + keccak256 of the reason),
///         then each wallet may vote once. Reasons are emitted in events (cheap storage).
/// @dev No tokens, no payments. Compile with evmVersion `paris` (optimizer on; via-IR not needed).
contract HeadlineDuel {
    // ───────────────────────────── Types ─────────────────────────────

    struct Duel {
        address creator;
        string question;
        uint8 category;      // 0 Headline · 1 Tagline · 2 Ad · 3 Email subject · 4 Name · 5 Image
        string a;            // text, or IPFS CID when isImage
        string b;
        bool isImage;
        uint8 aiPick;        // 0 none · 1 A · 2 B
        uint8 aiConfidence;  // 0 none · 1 low · 2 medium · 3 high
        bytes32 aiReasonHash;
        uint64 endsAt;
        uint32 votesA;
        uint32 votesB;
        uint64 createdBlock;
        bool ended;          // ended early by the creator
        bool hidden;         // hidden by the curator
    }

    // ───────────────────────────── Storage ───────────────────────────

    Duel[] internal duels; // read via getDuel / getDuels (a public getter would be stack-too-deep)
    mapping(uint256 => mapping(address => uint8)) public voteOf; // 0 none · 1 A · 2 B
    mapping(address => uint256[]) internal createdBy;
    mapping(address => uint256[]) internal votedBy;
    address public curator;
    uint256 public totalVotes;

    uint8 public constant CATEGORY_COUNT = 6;
    uint256 public constant MAX_QUESTION = 300; // bytes (≈100 chars incl. multibyte)
    uint256 public constant MAX_VERSION = 560;  // bytes (≈140 chars incl. multibyte / CID)
    uint256 public constant MAX_REASON = 560;   // bytes (≈140 chars incl. multibyte)

    // ───────────────────────────── Events ────────────────────────────

    event DuelStarted(uint256 indexed id, address indexed creator, uint8 aiPick, string aiReason);
    event Voted(uint256 indexed id, address indexed voter, uint8 choice, string reason);
    event DuelEnded(uint256 indexed id);
    event DuelHidden(uint256 indexed id, bool hidden);
    event CuratorChanged(address indexed curator);

    // ───────────────────────────── Errors ────────────────────────────

    error NotFound();
    error NotCreator();
    error NotCurator();
    error BadInput(string what);
    error NotLive();
    error AlreadyVoted();
    error CreatorCannotVote();

    constructor() {
        curator = msg.sender;
        emit CuratorChanged(msg.sender);
    }

    modifier exists(uint256 id) {
        if (id >= duels.length) revert NotFound();
        _;
    }

    // ───────────────────────────── Writes ────────────────────────────

    /// @param aiReason the full AI reason text (emitted, not stored); must hash to aiReasonHash.
    /// @param duration seconds: 1 day, 3 days or 7 days.
    /// @dev Strings are `memory` (one stack slot each) so this compiles without via-IR.
    function startDuel(
        string memory question,
        uint8 category,
        string memory a,
        string memory b,
        bool isImage,
        uint8 aiPick,
        uint8 aiConfidence,
        bytes32 aiReasonHash,
        string memory aiReason,
        uint64 duration
    ) external returns (uint256 id) {
        _checkContent(question, category, a, b, duration);
        _checkAi(aiPick, aiConfidence, aiReasonHash, aiReason);

        id = duels.length;
        Duel storage d = duels.push();
        d.creator = msg.sender;
        d.question = question;
        d.category = category;
        d.a = a;
        d.b = b;
        d.isImage = isImage;
        _storeAiAndTime(d, aiPick, aiConfidence, aiReasonHash, duration);

        createdBy[msg.sender].push(id);
        emit DuelStarted(id, msg.sender, aiPick, aiReason);
    }

    function _checkContent(string memory question, uint8 category, string memory a, string memory b, uint64 duration) internal pure {
        uint256 qLen = bytes(question).length;
        if (qLen == 0 || qLen > MAX_QUESTION) revert BadInput("question");
        if (category >= CATEGORY_COUNT) revert BadInput("category");
        if (bytes(a).length == 0 || bytes(a).length > MAX_VERSION) revert BadInput("a");
        if (bytes(b).length == 0 || bytes(b).length > MAX_VERSION) revert BadInput("b");
        if (keccak256(bytes(a)) == keccak256(bytes(b))) revert BadInput("same");
        if (duration != 1 days && duration != 3 days && duration != 7 days) revert BadInput("duration");
    }

    function _checkAi(uint8 aiPick, uint8 aiConfidence, bytes32 aiReasonHash, string memory aiReason) internal pure {
        if (aiPick > 2 || aiConfidence > 3) revert BadInput("ai");
        if (aiPick == 0) {
            if (aiConfidence != 0 || aiReasonHash != bytes32(0) || bytes(aiReason).length != 0) revert BadInput("ai");
        } else {
            if (aiConfidence == 0) revert BadInput("ai");
            if (bytes(aiReason).length > MAX_REASON) revert BadInput("aiReason");
            if (keccak256(bytes(aiReason)) != aiReasonHash) revert BadInput("aiReasonHash");
        }
    }

    function _storeAiAndTime(Duel storage d, uint8 aiPick, uint8 aiConfidence, bytes32 aiReasonHash, uint64 duration) internal {
        d.aiPick = aiPick;
        d.aiConfidence = aiConfidence;
        d.aiReasonHash = aiReasonHash;
        d.endsAt = uint64(block.timestamp) + duration;
        d.createdBlock = uint64(block.number);
    }

    /// @param choice 1 = A, 2 = B
    function vote(uint256 id, uint8 choice, string calldata reason) external exists(id) {
        Duel storage d = duels[id];
        if (!_isLive(d)) revert NotLive();
        if (msg.sender == d.creator) revert CreatorCannotVote();
        if (voteOf[id][msg.sender] != 0) revert AlreadyVoted();
        if (choice != 1 && choice != 2) revert BadInput("choice");
        if (bytes(reason).length > MAX_REASON) revert BadInput("reason");

        voteOf[id][msg.sender] = choice;
        if (choice == 1) d.votesA += 1;
        else d.votesB += 1;
        totalVotes += 1;
        votedBy[msg.sender].push(id);
        emit Voted(id, msg.sender, choice, reason);
    }

    function endEarly(uint256 id) external exists(id) {
        Duel storage d = duels[id];
        if (msg.sender != d.creator) revert NotCreator();
        if (!_isLive(d)) revert NotLive();
        d.ended = true;
        emit DuelEnded(id);
    }

    function setHidden(uint256 id, bool hidden_) external exists(id) {
        if (msg.sender != curator) revert NotCurator();
        duels[id].hidden = hidden_;
        emit DuelHidden(id, hidden_);
    }

    function setCurator(address next) external {
        if (msg.sender != curator) revert NotCurator();
        if (next == address(0)) revert BadInput("curator");
        curator = next;
        emit CuratorChanged(next);
    }

    // ───────────────────────────── Views ─────────────────────────────

    function totalDuels() external view returns (uint256) {
        return duels.length;
    }

    function getDuel(uint256 id) external view exists(id) returns (Duel memory) {
        return duels[id];
    }

    /// @notice Page through duels. Returns fewer than `count` at the end of the list.
    function getDuels(uint256 from, uint256 count) external view returns (Duel[] memory out) {
        uint256 len = duels.length;
        if (from >= len) return new Duel[](0);
        uint256 to = from + count;
        if (to > len) to = len;
        out = new Duel[](to - from);
        for (uint256 i = from; i < to; i++) out[i - from] = duels[i];
    }

    function hasVoted(uint256 id, address who) external view returns (bool) {
        return voteOf[id][who] != 0;
    }

    function isLive(uint256 id) external view exists(id) returns (bool) {
        return _isLive(duels[id]);
    }

    /// @return 0 still live · 1 A won · 2 B won · 3 draw
    function winner(uint256 id) public view exists(id) returns (uint8) {
        return _winner(duels[id]);
    }

    function duelsOf(address who) external view returns (uint256[] memory created, uint256[] memory voted) {
        return (createdBy[who], votedBy[who]);
    }

    /// @return duelCount all duels
    /// @return voteCount all votes
    /// @return aiCorrect finished, decided (no draw, ≥1 vote) duels where the AI pick won
    /// @return aiFinished finished, decided duels that had an AI pick
    function stats()
        external
        view
        returns (uint256 duelCount, uint256 voteCount, uint256 aiCorrect, uint256 aiFinished)
    {
        duelCount = duels.length;
        voteCount = totalVotes;
        for (uint256 i = 0; i < duelCount; i++) {
            Duel storage d = duels[i];
            if (d.aiPick == 0 || d.hidden) continue;
            uint8 w = _winner(d);
            if (w == 1 || w == 2) {
                aiFinished++;
                if (w == d.aiPick) aiCorrect++;
            }
        }
    }

    // ───────────────────────────── Internals ─────────────────────────

    function _isLive(Duel storage d) internal view returns (bool) {
        return !d.ended && block.timestamp < d.endsAt;
    }

    function _winner(Duel storage d) internal view returns (uint8) {
        if (_isLive(d)) return 0;
        if (d.votesA > d.votesB) return 1;
        if (d.votesB > d.votesA) return 2;
        return 3;
    }
}
