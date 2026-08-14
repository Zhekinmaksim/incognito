// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {e, ebool, euint256, inco} from "@inco/lightning/src/Lib.testnet.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";

/// @title Incognito - a five-seat deduction game where you are the only person
///        at the table who cannot see your own card.
///
/// Three things are confidential, and each one is load-bearing:
///   1. Your agent, granted to every other seat and deliberately not to you.
///   2. Whether an answer was honest, computed on encrypted state and held
///      encrypted until somebody pays to open it.
///   3. Nothing else. Questions, claims and hesitation are public on purpose -
///      the game is played in the open, the truth is not.
contract Incognito {
    using e for *;

    uint8 public constant SEATS = 5;
    uint8 public constant ROSTER = 16;
    uint8 public constant TRAITS = 8;

    /// 16 agents x 8 trait bits, packed little-endian, one byte per agent.
    /// Slot i occupies bits [8i, 8i+8). See roster.md for the readable table.
    uint256 public constant PACKED_ROSTER =
        0x000000000000000000000000000000000f3e1dac3b5ae968276615c4f332c1c0;

    uint32 public constant GLASSES_START = 5;
    uint32 public constant ANTE = 1;
    uint32 public constant ACCUSE_COST = 1;
    uint64 public constant TURN_WINDOW = 90;

    enum Phase {
        Open,
        Playing,
        AwaitingAccusation,
        AwaitingDeclaration,
        Closed
    }

    struct Seat {
        address player;
        euint256 id;
        euint256 mask;
        bool out;
    }

    struct Answer {
        uint8 asker;
        uint8 responder;
        uint8 queryMask;
        bool modeAll;
        bool answered;
        bool claim;
        uint8 phrasing;
        uint64 askedAt;
        uint32 elapsed; // the tell: seconds the responder took, public
        ebool truth; // encrypted: was the claim honest
        bool audited;
        bool wasLie;
    }

    struct Table {
        Seat[5] seats;
        uint8 filled;
        uint8 turn;
        uint8 alive;
        uint32 pot;
        uint64 deadline;
        Phase phase;
        bool awaitingAnswer;
        uint8 responder;
        uint256 nonce;
        // one pending reveal at a time
        uint256 pendingAnswerId;
        uint8 pendingActor;
        uint8 pendingGuess;
        ebool pendingHandle;
    }

    mapping(uint256 => Table) internal tables;
    mapping(uint256 => Answer[]) public ledger;
    mapping(address => uint32) public glasses;
    mapping(address => bool) public served;
    uint256 public nextTable;

    event Seated(uint256 indexed tableId, uint8 seat, address player);
    event Dealt(uint256 indexed tableId);
    event Asked(uint256 indexed tableId, uint256 answerId, uint8 asker, uint8 responder, uint8 queryMask, bool modeAll);
    event Answered(uint256 indexed tableId, uint256 answerId, bool claim, uint8 phrasing, uint32 elapsed);
    event Accused(uint256 indexed tableId, uint256 answerId, uint8 accuser);
    event Verdict(uint256 indexed tableId, uint256 answerId, bool wasLie, uint8 eliminated);
    event Declared(uint256 indexed tableId, uint8 seat, uint8 guess);
    event Eliminated(uint256 indexed tableId, uint8 seat);
    event Won(uint256 indexed tableId, uint8 seat, uint32 pot);

    error NotYourTurn();
    error NotYou();
    error WrongPhase();
    error NoGlasses();
    error BadQuery();
    error StillInTime();

    // ---------------------------------------------------------------------
    // the bar tab
    // ---------------------------------------------------------------------

    /// Glasses are non-transferable on purpose. Nothing can be bought with
    /// them except the right to call someone a liar, which makes farming them
    /// across wallets pointless and removes the sybil incentive entirely.
    function _pour(address who) internal {
        if (!served[who]) {
            served[who] = true;
            glasses[who] = GLASSES_START;
        }
    }

    /// The barman does not let anyone sit there empty-handed forever.
    function refill() external {
        require(served[msg.sender] && glasses[msg.sender] == 0, "not empty");
        glasses[msg.sender] = 1;
    }

    // ---------------------------------------------------------------------
    // seating and the deal
    // ---------------------------------------------------------------------

    function openTable() external payable returns (uint256 id) {
        id = nextTable++;
        tables[id].phase = Phase.Open;
        _sit(id);
    }

    function sit(uint256 tableId) external payable {
        _sit(tableId);
    }

    function _sit(uint256 tableId) internal {
        Table storage t = tables[tableId];
        if (t.phase != Phase.Open) revert WrongPhase();
        _pour(msg.sender);
        if (glasses[msg.sender] < ANTE) revert NoGlasses();

        glasses[msg.sender] -= ANTE;
        t.pot += ANTE;
        t.seats[t.filled].player = msg.sender;
        emit Seated(tableId, t.filled, msg.sender);
        t.filled++;

        if (t.filled == SEATS) _deal(tableId);
    }

    /// The whole premise of the game is the `j == i` skip below.
    function _deal(uint256 tableId) internal {
        Table storage t = tables[tableId];

        for (uint8 i = 0; i < SEATS; i++) {
            euint256 id = _drawUnique(t, i);
            euint256 mask = e.and(e.shr(PACKED_ROSTER, e.mul(id, TRAITS)), 0xFF);

            e.allowThis(id);
            e.allowThis(mask);

            for (uint8 j = 0; j < SEATS; j++) {
                if (j == i) continue; // <- never grant a seat its own card
                e.allow(id, t.seats[j].player);
                e.allow(mask, t.seats[j].player);
            }

            t.seats[i].id = id;
            t.seats[i].mask = mask;
        }

        t.alive = SEATS;
        t.phase = Phase.Playing;
        t.deadline = uint64(block.timestamp) + TURN_WINDOW;
        emit Dealt(tableId);
    }

    function _drawUnique(Table storage t, uint8 dealt) internal returns (euint256 id) {
        id = e.randBounded(ROSTER);

        // The current Inco package has random bounded values but no encrypted
        // shuffled range helper. Repeated encrypted open-addressing gives five
        // distinct ids without exposing the draw.
        for (uint8 pass = 0; pass < SEATS; pass++) {
            for (uint8 j = 0; j < dealt; j++) {
                ebool same = e.eq(id, t.seats[j].id);
                id = e.select(same, e.rem(e.add(id, 1), ROSTER), id);
            }
        }
    }

    // ---------------------------------------------------------------------
    // the round
    // ---------------------------------------------------------------------

    /// Ask the room a question about yourself. Public, as at the table.
    function ask(uint256 tableId, uint8 queryMask, bool modeAll) external {
        Table storage t = tables[tableId];
        if (t.phase != Phase.Playing || t.awaitingAnswer) revert WrongPhase();
        uint8 me = _seatOf(t, msg.sender);
        if (me != t.turn) revert NotYourTurn();
        if (queryMask == 0) revert BadQuery();

        // You do not choose who answers. Besides the drama, this is what makes
        // holding a second seat worth a 1-in-4 chance rather than a guarantee.
        uint8 r = _pickResponder(t, me);

        ledger[tableId].push(
            Answer({
                asker: me,
                responder: r,
                queryMask: queryMask,
                modeAll: modeAll,
                answered: false,
                claim: false,
                phrasing: 0,
                askedAt: uint64(block.timestamp),
                elapsed: 0,
                truth: ebool.wrap(bytes32(0)),
                audited: false,
                wasLie: false
            })
        );

        t.awaitingAnswer = true;
        t.responder = r;
        t.deadline = uint64(block.timestamp) + TURN_WINDOW;
        emit Asked(tableId, ledger[tableId].length - 1, me, r, queryMask, modeAll);
    }

    /// Answer, honestly or not. `phrasing` selects the line you say out loud;
    /// it changes nothing mechanically and everything socially.
    function respond(uint256 tableId, bool claim, uint8 phrasing) external {
        Table storage t = tables[tableId];
        if (t.phase != Phase.Playing || !t.awaitingAnswer) revert WrongPhase();
        if (_seatOf(t, msg.sender) != t.responder) revert NotYou();

        uint256 aid = ledger[tableId].length - 1;
        Answer storage a = ledger[tableId][aid];

        euint256 hit = e.and(t.seats[a.asker].mask, uint256(a.queryMask));
        ebool real = a.modeAll ? e.eq(hit, uint256(a.queryMask)) : e.ne(hit, 0);

        // truth = NOT(real XOR claim). Nobody may read this, including the
        // asker - buying it is what an accusation is for.
        ebool truth = e.not(e.xor(real, claim));
        e.allowThis(truth);

        a.truth = truth;
        a.claim = claim;
        a.phrasing = phrasing;
        a.answered = true;
        a.elapsed = uint32(block.timestamp - a.askedAt);

        t.awaitingAnswer = false;
        _advance(t);
        emit Answered(tableId, aid, claim, phrasing, a.elapsed);
    }

    // ---------------------------------------------------------------------
    // calling someone a liar
    // ---------------------------------------------------------------------

    /// Costs a glass, paid to the person you are accusing before anything is
    /// checked. You buy them a drink, then call them a liar.
    function accuse(uint256 tableId, uint256 answerId) external {
        Table storage t = tables[tableId];
        if (t.phase != Phase.Playing || t.awaitingAnswer) revert WrongPhase();
        uint8 me = _seatOf(t, msg.sender);

        Answer storage a = ledger[tableId][answerId];
        require(a.answered && !a.audited, "unavailable");
        require(me != a.responder, "yourself");
        if (glasses[msg.sender] < ACCUSE_COST) revert NoGlasses();

        glasses[msg.sender] -= ACCUSE_COST;
        glasses[t.seats[a.responder].player] += ACCUSE_COST;

        t.phase = Phase.AwaitingAccusation;
        t.pendingAnswerId = answerId;
        t.pendingActor = me;
        t.pendingHandle = a.truth;
        e.reveal(a.truth);
        emit Accused(tableId, answerId, me);
    }

    function settleAccusation(uint256 tableId, DecryptionAttestation memory decryption, bytes[] memory signatures) external {
        Table storage t = tables[tableId];
        if (t.phase != Phase.AwaitingAccusation) revert WrongPhase();
        require(inco.incoVerifier().isValidDecryptionAttestation(decryption, signatures), "bad attestation");
        require(decryption.handle == ebool.unwrap(t.pendingHandle), "stale reveal");
        bool truthValue = uint256(decryption.value) != 0;

        Answer storage a = ledger[tableId][t.pendingAnswerId];
        a.audited = true;
        a.wasLie = !truthValue;

        // Both buttons are loaded. A wrong accusation kills the accuser.
        uint8 loser = truthValue ? t.pendingActor : a.responder;
        t.phase = Phase.Playing;
        emit Verdict(tableId, t.pendingAnswerId, !truthValue, loser);
        _eliminate(tableId, t, loser);
    }

    // ---------------------------------------------------------------------
    // naming yourself
    // ---------------------------------------------------------------------

    function declare(uint256 tableId, uint8 guess) external {
        Table storage t = tables[tableId];
        if (t.phase != Phase.Playing || t.awaitingAnswer) revert WrongPhase();
        uint8 me = _seatOf(t, msg.sender);
        if (me != t.turn) revert NotYourTurn();
        require(guess < ROSTER, "no such agent");

        ebool correct = e.eq(t.seats[me].id, uint256(guess));
        e.allowThis(correct);

        t.phase = Phase.AwaitingDeclaration;
        t.pendingActor = me;
        t.pendingGuess = guess;
        t.pendingHandle = correct;
        e.reveal(correct);
        emit Declared(tableId, me, guess);
    }

    function settleDeclaration(uint256 tableId, DecryptionAttestation memory decryption, bytes[] memory signatures) external {
        Table storage t = tables[tableId];
        if (t.phase != Phase.AwaitingDeclaration) revert WrongPhase();
        require(inco.incoVerifier().isValidDecryptionAttestation(decryption, signatures), "bad attestation");
        require(decryption.handle == ebool.unwrap(t.pendingHandle), "stale reveal");
        bool correct = uint256(decryption.value) != 0;
        t.phase = Phase.Playing;

        if (correct) {
            _win(tableId, t, t.pendingActor);
        } else {
            _eliminate(tableId, t, t.pendingActor);
        }
    }

    // ---------------------------------------------------------------------
    // silence
    // ---------------------------------------------------------------------

    /// A seat that goes quiet loses its place, not the room its game.
    function claimTimeout(uint256 tableId) external {
        Table storage t = tables[tableId];
        if (t.phase != Phase.Playing) revert WrongPhase();
        if (block.timestamp <= t.deadline) revert StillInTime();

        uint8 gone = t.awaitingAnswer ? t.responder : t.turn;
        t.awaitingAnswer = false;
        _eliminate(tableId, t, gone);
    }

    // ---------------------------------------------------------------------
    // internals
    // ---------------------------------------------------------------------

    function _eliminate(uint256 tableId, Table storage t, uint8 seat) internal {
        if (t.seats[seat].out) return;
        t.seats[seat].out = true;
        t.alive--;
        emit Eliminated(tableId, seat);

        if (t.alive == 1) {
            for (uint8 i = 0; i < SEATS; i++) {
                if (!t.seats[i].out) {
                    _win(tableId, t, i);
                    return;
                }
            }
        }
        if (t.seats[t.turn].out || t.turn == seat) _advance(t);
    }

    function _win(uint256 tableId, Table storage t, uint8 seat) internal {
        glasses[t.seats[seat].player] += t.pot;
        emit Won(tableId, seat, t.pot);
        t.pot = 0;
        t.phase = Phase.Closed;

        // Declassification: the table finally sees who everyone was.
        for (uint8 i = 0; i < SEATS; i++) {
            e.reveal(t.seats[i].id);
        }
        // Every unaudited answer is opened too, so the full record of who lied
        // and got away with it becomes public at the end of the night.
        Answer[] storage L = ledger[tableId];
        for (uint256 k = 0; k < L.length; k++) {
            if (L[k].answered && !L[k].audited) {
                e.reveal(L[k].truth);
            }
        }
    }

    function _advance(Table storage t) internal {
        if (t.phase != Phase.Playing) return;
        for (uint8 step = 1; step <= SEATS; step++) {
            uint8 n = (t.turn + step) % SEATS;
            if (!t.seats[n].out) {
                t.turn = n;
                break;
            }
        }
        t.deadline = uint64(block.timestamp) + TURN_WINDOW;
    }

    /// Deliberately not an Inco operation. The choice is public the instant it
    /// is made, so paying for encrypted randomness and a reveal round-trip
    /// would buy latency and no confidentiality at all.
    function _pickResponder(Table storage t, uint8 asker) internal returns (uint8) {
        uint256 r = uint256(keccak256(abi.encode(blockhash(block.number - 1), address(this), t.nonce++)));
        uint8 k = uint8(r % (t.alive - 1));
        for (uint8 i = 0; i < SEATS; i++) {
            if (i == asker || t.seats[i].out) continue;
            if (k == 0) return i;
            k--;
        }
        revert("no responder");
    }

    function _seatOf(Table storage t, address who) internal view returns (uint8) {
        for (uint8 i = 0; i < SEATS; i++) {
            if (t.seats[i].player == who && !t.seats[i].out) return i;
        }
        revert NotYou();
    }

    // ---------------------------------------------------------------------
    // views
    // ---------------------------------------------------------------------

    function seatCard(uint256 tableId, uint8 seat) external view returns (euint256 id, euint256 mask) {
        Seat storage s = tables[tableId].seats[seat];
        return (s.id, s.mask);
    }

    function tableState(uint256 tableId)
        external
        view
        returns (Phase phase, uint8 filled, uint8 alive, uint8 turn, bool awaitingAnswer, uint8 responder, uint32 pot, uint64 deadline)
    {
        Table storage t = tables[tableId];
        return (t.phase, t.filled, t.alive, t.turn, t.awaitingAnswer, t.responder, t.pot, t.deadline);
    }

    function pendingReveal(uint256 tableId)
        external
        view
        returns (uint256 answerId, uint8 actor, uint8 guess, ebool handle)
    {
        Table storage t = tables[tableId];
        return (t.pendingAnswerId, t.pendingActor, t.pendingGuess, t.pendingHandle);
    }

    /// Which address holds a seat. The client needs this to know where it sat.
    function seatOwner(uint256 tableId, uint8 seat) external view returns (address) {
        return tables[tableId].seats[seat].player;
    }

    function ledgerLength(uint256 tableId) external view returns (uint256) {
        return ledger[tableId].length;
    }

    receive() external payable {}
}
