# What is left

Written at packaging time. Ordered by what stops the project being real, not by
what is easiest.

---

## What has met a chain, and what has not

The first Base Sepolia deployment proved that the table can open, fill five
seats and reach `Playing`. It then stalled because I had paired the contract's
`Lib.testnet.sol` import with `Lightning.latest('testnet', 84532)`. The DeFy'26
docs and official starter template use a different Base Sepolia path:
`@inco/lightning/src/Lib.sol` on-chain and `Lightning.baseSepoliaTestnet()` in
JavaScript.

The code now matches that hackathon path with `@inco/lightning-js@1.0.0` and
`@inco/lightning@1.0.0`. Card reads use `attestedDecrypt`, and accusations or
declarations are settled by posting `attestedReveal` attestations back to the
contract.

The current Base Sepolia deployment is:

```text
0x9Abd9714FdF0f10967C4e028EdB40af4de827456
```

It is funded with `0.002 ETH` for Inco operation fees. The matching Inco
executor is `0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624`, with hosted
covalidators under `*.12.covalidator.basesep.mainnet.inco.org`. This new
deployment still needs one keeper run through a card decrypt before calling the
chain integration proven.

### 1. Deploy and find out what breaks

```bash
npm run deploy
```

Three things are worth watching, in order of how badly they would hurt:

**Does the official Lightning executor run the same roster path?** The first
deployment reached `Playing`, which strongly suggests `e.shr(uint256, euint256)`
works on chain. The current deployment points at the DeFy'26 template executor,
so this still needs one fresh deal before calling it proven.

**What does a deal cost?** Five encrypted random draws, encrypted collision
repair, five roster lookups and the access grants, paid out of the contract's
own balance. At the current testnet `inco.getFee()` of `0.0001 ETH`, a deal
needs at least `0.0005 ETH` before gas and future tables. `deploy.js` now funds
`0.002 ETH` by default. Measure the real burn on the new deployment and put it
in the README, because a contract at zero stops dealing and the failure
surfaces as an unrelated revert.

**Can any permitted seat decrypt a card?** Not yet on the current deployment.
This is the first live check to run after the keeper is switched to the new
contract address.

### 2. The keeper

```bash
fly launch --no-deploy --name incognito-keeper
fly secrets set RPC_URL=… CONTRACT=0x… KEEPER_KEYS=0x…,0x…,0x…,0x…,0x…
fly deploy
```

Tested on Fly through table creation, five seats and the first live card
decrypt attempt. Card reads now use `attestedDecrypt`, and accusations or
declarations use `attestedReveal` plus `settleAccusation` /
`settleDeclaration`. Expect to spend time on the Inco KMS endpoint specifically:
the contract waits in `AwaitingAccusation` or `AwaitingDeclaration` until the
keeper posts a valid attestation.

One machine, always. `fly.toml` pins it. The keeper owns the nonces for five
wallets and a second copy would spend them twice.

### 3. Wiring the screen to the chain

`site/play.html` has all three modes and only the first is proven. `watch`
needs a deployed address in `window.INCOGNITO_CONTRACT`; `play` additionally
needs `@inco/lightning-js` to work in a browser, which has not been checked — it is
imported from esm.sh and may need bundling instead.

---

## Known holes, with the reasoning

**The hesitation is client-reported.** The contract cannot measure a pause: it
sees `block.timestamp - askedAt`, which on Base is two-second blocks plus your
thinking, and the two are indistinguishable. So the client measures and submits
it. On a testnet with toy stakes this is fine. On mainnet it is a hole — a
player can claim any number and never look nervous. The fix is to take the
minimum of the claimed value and what the chain observed, which keeps an honest
client honest and caps a dishonest one. Twenty minutes of work, not done.

**`_win` reveals the whole ledger in a loop.** Declassification walks every
unaudited answer and reveals it. On a long game that will run out of gas. Cap
it, or reveal in batches, or accept that a table which runs past ~20 answers
cannot close.

**Anyone can open a table and abandon it.** No stake is lost, so the storage
fills with dead tables. Harmless on a testnet, untidy on mainnet.

**Five private keys in one secret store.** Compromising the keeper machine
gets all five seats. Keep only as much gas there as you would not mind losing.

**Balances are watched, not topped up.** The keeper warns once a minute when a
seat drops under 0.002 ETH or the contract float under 0.005. Nothing refills
them. Watch `/status` on the day.

---

## The design problem I could not solve in time

**Most players are never lied to.** 1.67 lies per game across five seats means
a given player is deceived roughly once every three games. In 59% of games,
seat zero hears nothing but the truth — so the mechanic the whole project is
built on may never reach the person playing.

Raising the lie rate does not fix it, and the simulator shows why: liars get
caught and eliminated, so lying is self-limiting. Raising MAGPIE from 25% to
40% moved the total from 1.60 to 1.67 and no further.

Two directions worth trying, neither attempted:

- Make catching a liar cost the accuser more than a glass, so lies survive
  longer and the room stays uncertain.
- Give the responder a reason to lie beyond denying information — a stake in
  the asker specifically losing, rather than merely not winning.

This is the difference between a demo that explains a good idea and a game
somebody wants to play twice. It deserves a day it did not get.

---

## Before submitting

- [ ] Public URL where the landing page and `play.html` both work
- [ ] Demo video, recorded in watch mode
- [ ] Contract address and explorer link in the README
- [ ] Pre-existing work disclosed — the section exists in the README, check it is accurate
- [ ] Confirm the jam's rules on music in submitted video

## If there is only an hour

Deploy, run the one test that proves a seat cannot read its own card, and put
the address in the README. A judge who can see that test pass understands the
project even if nothing else is connected — and if it fails, everything else in
this repository is decoration.
