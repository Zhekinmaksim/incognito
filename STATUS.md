# What is left

Written at packaging time. Ordered by what stops the project being real, not by
what is easiest.

---

## What has met a chain, and what has not

The first Base Sepolia deployment proved that the table can open, fill five
seats and reach `Playing`. That contract used the old Inco SDK and then stalled
when the keeper tried to decrypt a card through the retired KMS endpoint.

The code now targets `@inco/lightning-js@1.0.3-rc-9` and
`@inco/lightning@1.0.3-rc-9`: card reads use `attestedDecrypt`, and
accusations or declarations are settled by posting `attestedReveal`
attestations back to the contract.

The upgraded contract was deployed on Base Sepolia at
`0x67338DA99A30A37c10Ed29f01E7114fbf4A90227` and funded with `0.002 ETH`.
It opened table `0`, filled five seats and reached the first live decrypt
attempt. The keeper now reaches current Inco covalidator hosts, but both
official SDK routes still fail before returning an attestation:

- `@inco/lightning-js@1.0.3-rc-9`, `testnet`, Base Sepolia, executor
  `0xe9CB49A5b16C6D4a093E5900AA8b450FD40541B6`
- covalidators
  `https://0x4b9e2a2386e244e8dff6ee420ca69bec3a1330be.12.covalidator.basesep.testnet.inco.org`
  and
  `https://0xe4edead22d79dca9da0883da3058a2cdbae5127e.12.covalidator.basesep.testnet.inco.org`
- local and Fly checks require disabling TLS verification because the endpoints
  present a self-signed certificate; after that, Connect RPC returns
  `[unimplemented] HTTP 404` for `inco.kms.lite.v1.KmsService`

So the contract and keeper are past the old SDK issue, but card decrypt is
still blocked on the public Inco testnet KMS endpoint.

### 1. Deploy and find out what breaks

```bash
npm run deploy
```

Three things are worth watching, in order of how badly they would hurt:

**Does the new Lightning executor run the same roster path?** The old deployed
contract reached `Playing`, which strongly suggests `e.shr(uint256, euint256)`
works on chain. The new package points at a different testnet executor, so this
still needs one fresh deal before calling it proven.

**What does a deal cost?** Five encrypted random draws, encrypted collision
repair, five roster lookups and the access grants, paid out of the contract's
own balance. At the current testnet `inco.getFee()` of `0.0001 ETH`, a deal
needs at least `0.0005 ETH` before gas and future tables. `deploy.js` now funds
`0.002 ETH` by default. Measure the real burn on the new deployment and put it
in the README, because a contract at zero stops dealing and the failure
surfaces as an unrelated revert.

**Can any permitted seat decrypt a card?** Not yet. The keeper can read the
handle and sign the attested decrypt request, but the public covalidator
Connect endpoint returns 404 before an attestation is produced.

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
