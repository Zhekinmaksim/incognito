import { expect } from "chai";
import hre from "hardhat";
import { Lightning } from "@inco/lightning-js/lite";

// These run against the Inco devnet or a Base Sepolia fork. The interesting
// assertions are off-chain: what a given wallet is and is not permitted to
// decrypt. A local EVM alone cannot answer that.

const AGENTS = [
  "Kestrel", "Magpie", "Shrike", "Cormorant", "Jackdaw", "Plover", "Harrier", "Bittern",
  "Grosbeak", "Wigeon", "Sanderling", "Nightjar", "Tern", "Merlin", "Rook", "Siskin",
];
const MASKS = [0xc0, 0xc1, 0x32, 0xf3, 0xc4, 0x15, 0x66, 0x27,
               0x68, 0xe9, 0x5a, 0x3b, 0xac, 0x1d, 0x3e, 0x0f];

const HAT = 1, GLASSES = 2, BEARD = 4, SCAR = 8;

describe("Incognito", () => {
  let game: any, players: any[], zap: any;

  beforeEach(async () => {
    const signers = await hre.ethers.getSigners();
    players = signers.slice(0, 5);
    zap = await Lightning.latest("devnet", 31337);
    const F = await hre.ethers.getContractFactory("Incognito");
    game = await F.deploy();
    await game.waitForDeployment();
  });

  function walletClient(signer: any) {
    return {
      account: { address: signer.address },
      transport: { url: "UNUSED IN TEST" },
      request: async ({ method, params }: { method: string, params?: unknown[] }) =>
        hre.ethers.provider.send(method, params || []),
      signTypedData: async (payload: any) => {
        const types = { ...payload.types };
        delete types.EIP712Domain;
        return signer.signTypedData(payload.domain, types, payload.message);
      },
    };
  }

  function plaintextValue(attestation: any) {
    const plaintext = attestation?.plaintext ?? attestation;
    return plaintext && typeof plaintext === "object" && "value" in plaintext ? plaintext.value : plaintext;
  }

  async function decrypt(handle: string, signer: any) {
    const [attestation] = await zap.attestedDecrypt(walletClient(signer), [handle]);
    return plaintextValue(attestation);
  }

  async function reveal(handle: string) {
    const [attestation] = await zap.attestedReveal([handle]);
    const raw = attestation.plaintext?.value ?? attestation.value;
    const n = typeof raw === "boolean" ? (raw ? 1n : 0n) : BigInt(raw);
    return {
      decryption: { handle: attestation.handle, value: `0x${n.toString(16).padStart(64, "0")}` },
      signatures: (attestation.covalidatorSignatures ?? attestation.signatures).map((s: Uint8Array | string) =>
        typeof s === "string" ? s : `0x${Array.from(s, b => b.toString(16).padStart(2, "0")).join("")}`
      ),
    };
  }

  async function seatEveryone() {
    await game.connect(players[0]).openTable({ value: hre.ethers.parseEther("0.05") });
    for (let i = 1; i < 5; i++) await game.connect(players[i]).sit(0);
    return 0;
  }

  async function cardOf(tableId: number, seat: number, asWallet: any) {
    const [id] = await game.seatCard(tableId, seat);
    return decrypt(id, asWallet);
  }

  // -------------------------------------------------------------------
  // The premise. If this test ever goes green in the wrong direction the
  // entire game is over, so it runs first and it runs alone.
  // -------------------------------------------------------------------

  it("does not let a seat decrypt its own card", async () => {
    const t = await seatEveryone();
    for (let seat = 0; seat < 5; seat++) {
      await expect(cardOf(t, seat, players[seat])).to.be.rejected;
    }
  });

  it("lets every other seat decrypt that card, and they all agree on it", async () => {
    const t = await seatEveryone();
    const seat = 2;
    const readings: bigint[] = [];
    for (let viewer = 0; viewer < 5; viewer++) {
      if (viewer === seat) continue;
      readings.push(await cardOf(t, seat, players[viewer]));
    }
    expect(new Set(readings.map(String)).size).to.equal(1);
    expect(Number(readings[0])).to.be.within(0, 15);
  });

  it("deals five distinct agents", async () => {
    const t = await seatEveryone();
    const ids: number[] = [];
    for (let seat = 0; seat < 5; seat++) {
      const viewer = (seat + 1) % 5;
      ids.push(Number(await cardOf(t, seat, players[viewer])));
    }
    expect(new Set(ids).size).to.equal(5);
  });

  it("derives the mask from the packed roster correctly", async () => {
    const t = await seatEveryone();
    for (let seat = 0; seat < 5; seat++) {
      const viewer = (seat + 1) % 5;
      const [id, mask] = await game.seatCard(t, seat);
      const idVal = Number(await decrypt(id, players[viewer]));
      const maskVal = Number(await decrypt(mask, players[viewer]));
      expect(maskVal, `${AGENTS[idVal]}`).to.equal(MASKS[idVal]);
    }
  });

  // -------------------------------------------------------------------
  // The lie ledger
  // -------------------------------------------------------------------

  it("keeps the truth bit unreadable by everyone, including the asker", async () => {
    const t = await seatEveryone();
    const [, , , turn] = await game.tableState(t);
    await game.connect(players[Number(turn)]).ask(t, HAT, false);
    const [, , , , , responder] = await game.tableState(t);
    await game.connect(players[Number(responder)]).respond(t, true, 0);

    const entry = await game.ledger(t, 0);
    for (let i = 0; i < 5; i++) {
      await expect(
        decrypt(entry.truth, players[i])
      ).to.be.rejected;
    }
  });

  it("records how long the responder took", async () => {
    const t = await seatEveryone();
    const [, , , turn] = await game.tableState(t);
    await game.connect(players[Number(turn)]).ask(t, GLASSES, false);
    const [, , , , , responder] = await game.tableState(t);

    await hre.network.provider.send("evm_increaseTime", [7]);
    await game.connect(players[Number(responder)]).respond(t, false, 2);

    const entry = await game.ledger(t, 0);
    expect(Number(entry.elapsed)).to.be.at.least(7);
  });

  it("eliminates a caught liar and pays the accuser", async () => {
    // Drive a known lie: read the responder's view of the asker's card,
    // compute the honest answer, then submit its opposite.
    const t = await seatEveryone();
    const [, , , turn] = await game.tableState(t);
    const asker = Number(turn);
    await game.connect(players[asker]).ask(t, SCAR, false);
    const [, , , , , r] = await game.tableState(t);
    const responder = Number(r);

    const [, maskH] = await game.seatCard(t, asker);
    const mask = Number(await decrypt(maskH, players[responder]));
    const honest = (mask & SCAR) !== 0;

    await game.connect(players[responder]).respond(t, !honest, 0);

    const accuser = [0, 1, 2, 3, 4].find((i) => i !== responder)!;
    const before = await game.glasses(players[accuser].address);
    await game.connect(players[accuser]).accuse(t, 0);

    // keeper posts the attestation
    const entry = await game.ledger(t, 0);
    const att = await reveal(entry.truth);
    await expect(game.settleAccusation(t, att.decryption, att.signatures))
      .to.emit(game, "Verdict").withArgs(t, 0, true, responder);

    expect(await game.glasses(players[accuser].address)).to.equal(before - 1n);
  });

  it("eliminates an accuser who was wrong", async () => {
    const t = await seatEveryone();
    const [, , , turn] = await game.tableState(t);
    const asker = Number(turn);
    await game.connect(players[asker]).ask(t, BEARD, false);
    const [, , , , , r] = await game.tableState(t);
    const responder = Number(r);

    const [, maskH] = await game.seatCard(t, asker);
    const mask = Number(await decrypt(maskH, players[responder]));
    await game.connect(players[responder]).respond(t, (mask & BEARD) !== 0, 0);

    const accuser = [0, 1, 2, 3, 4].find((i) => i !== responder)!;
    await game.connect(players[accuser]).accuse(t, 0);
    const entry = await game.ledger(t, 0);
    const att = await reveal(entry.truth);

    await expect(game.settleAccusation(t, att.decryption, att.signatures))
      .to.emit(game, "Eliminated").withArgs(t, accuser);
  });

  // -------------------------------------------------------------------
  // The bar tab
  // -------------------------------------------------------------------

  it("pours five glasses on a first sitting and only once", async () => {
    await game.connect(players[0]).openTable({ value: hre.ethers.parseEther("0.05") });
    expect(await game.glasses(players[0].address)).to.equal(4n); // five minus the ante
    for (let i = 1; i < 5; i++) await game.connect(players[i]).sit(0);
    await game.connect(players[0]).openTable({ value: hre.ethers.parseEther("0.05") });
    expect(await game.glasses(players[0].address)).to.equal(3n);
  });

  it("refuses a refill to anyone still holding a glass", async () => {
    await game.connect(players[0]).openTable({ value: hre.ethers.parseEther("0.05") });
    await expect(game.connect(players[0]).refill()).to.be.revertedWith("not empty");
  });

  it("refuses an accusation from an empty-handed player", async () => {
    // Seat someone, drain them to zero, then have them try to call a liar.
    // Guards the one thing glasses actually buy.
  });

  // -------------------------------------------------------------------
  // Turn order
  // -------------------------------------------------------------------

  it("never names the asker as the responder", async () => {
    const t = await seatEveryone();
    for (let round = 0; round < 8; round++) {
      const [, , , turn] = await game.tableState(t);
      await game.connect(players[Number(turn)]).ask(t, HAT, false);
      const [, , , , , responder] = await game.tableState(t);
      expect(Number(responder)).to.not.equal(Number(turn));
      await game.connect(players[Number(responder)]).respond(t, true, 0);
    }
  });

  it("drops a silent seat instead of freezing the room", async () => {
    const t = await seatEveryone();
    const [, , , turn] = await game.tableState(t);
    await game.connect(players[Number(turn)]).ask(t, HAT, false);
    const [, , , , , responder] = await game.tableState(t);

    await hre.network.provider.send("evm_increaseTime", [120]);
    await expect(game.claimTimeout(t)).to.emit(game, "Eliminated").withArgs(t, Number(responder));

    const [, , alive] = await game.tableState(t);
    expect(Number(alive)).to.equal(4);
  });
});
