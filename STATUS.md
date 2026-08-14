# What is left

Written at packaging time. Ordered by what stops the project being real, not by
what is easiest.

---

## Nothing here has met a chain

This is the honest headline. The contract compiles to 10,587 bytes and every
call it exposes has been driven against a fake, but it has never been deployed,
and the keeper has never spoken to a node. Everything below the first heading
assumes that changes.

### 1. Deploy and find out what breaks

```bash
npm run deploy
```

Three things are worth watching, in order of how badly they would hurt:

**Does `e.shr` accept an encrypted shift?** The whole roster lookup is three
operations because the sixteen masks are packed into one `uint256` and indexed
by shifting it by an encrypted amount. The library exposes `shr(uint256, euint256)`,
which is why the contract compiles, but compiling is not executing. If it fails
at runtime the fallback is `Σ MASK[i] · (id == i)` over sixteen terms — correct,
about forty-eight Inco operations instead of three, and only ever called once
per player, so it is affordable. Budget an hour.

**What does a deal cost?** Five encrypted random draws, encrypted collision
repair, five roster lookups and the access grants, paid out of the contract's
own balance. `deploy.js` funds it with 0.02 ETH as a guess. Measure the real
number and put it in the README, because a contract at zero stops dealing and
the failure surfaces as an unrelated revert.

**Can a seat decrypt its own card?** It must not be able to. The test exists
(`test/Incognito.test.ts`) and has never run, because it needs live
covalidators — a local EVM cannot answer the question. If this one fails there
is no game, so run it first.

### 2. The keeper

```bash
fly launch --no-deploy --name incognito-keeper
fly secrets set RPC_URL=… CONTRACT=0x… KEEPER_KEYS=0x…,0x…,0x…,0x…,0x…
fly deploy
```

Untested against a node. Card reads use `getReencryptor`, and accusations or
declarations use Inco's decryption callback path. Expect to spend time on the
reveal round-trip specifically: it is asynchronous, the contract waits in
`AwaitingAccusation` or `AwaitingDeclaration` until the callback lands.

One machine, always. `fly.toml` pins it. The keeper owns the nonces for five
wallets and a second copy would spend them twice.

### 3. Wiring the screen to the chain

`site/play.html` has all three modes and only the first is proven. `watch`
needs a deployed address in `window.INCOGNITO_CONTRACT`; `play` additionally
needs `@inco/js` to work in a browser, which has not been checked — it is
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
