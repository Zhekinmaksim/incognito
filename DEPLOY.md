# Getting the room running

## 1. Contract

```bash
npm install
npm run build
npm run deploy            # Base Sepolia
```

The deploy script funds the contract afterwards. That float is not optional:
Inco charges per encrypted operation and the private deal at the start of every
table is the most expensive thing the game does. A contract at zero stops
dealing and the failure looks like an unrelated revert. The default float is
`0.002 ETH`; override it with `FUND_ETH=... npm run deploy` if balances are
tight or you want to pre-fund more.

For mainnet, `npm run deploy:mainnet`. Same contract, with the Lightning
deployment selected by the installed `@inco/lightning` package.

## 2. Keeper

Five wallets, one per seat. They need gas, not much of it, and they need to be
five distinct keys — the game refuses to seat the same address twice.

Run these commands from the application directory. The repository is nested
under `incognito/`; running `fly deploy` from its parent produces a misleading
"missing app name" error because Fly cannot see this `fly.toml`.

```bash
cd /Users/zmaxx/Projects/INCOgnito/incognito
fly secrets set \
  RPC_URL=https://sepolia.base.org \
  CHAIN_ID=84532 \
  INCO_ENV=testnet \
  CONTRACT=0x9Abd9714FdF0f10967C4e028EdB40af4de827456 \
  KEEPER_KEYS=0x..,0x..,0x..,0x..,0x..
fly deploy
```

The deployer private key is not needed by the keeper and must not be uploaded
to Fly. Keep it only in the local `.env` used by `npm run deploy`.

From the parent directory, use the explicit app and project path instead:

```bash
fly secrets set -a incognito-keeper CONTRACT=0x9Abd9714FdF0f10967C4e028EdB40af4de827456
fly deploy ./incognito -a incognito-keeper
```

Then watch it think:

```bash
fly logs
curl https://incognito-keeper.fly.dev/status
```

## 3. What the health check actually checks

`/health` returns 503 when no move has been made for five minutes. A keeper
that is up but has been throwing on every step is not healthy, and this is the
difference: fly will restart it rather than leave a dead table on the landing
page.

## Things that will bite

**One machine, always.** `min_machines_running = 1` with autostop off, and
never `fly scale count 2`. The keeper owns the nonces for five wallets; a
second copy would double-spend them and half the moves would silently drop.

**Balances.** The keeper logs a warning a minute when any seat drops under
0.002 ETH or the contract float under 0.005. Nothing tops them up
automatically — watch `/status` on the day.

**Restarts are safe.** The keeper holds nothing in memory that matters. On
boot it reads the table state and the ledger back off chain and carries on
mid-game, which is also why a redeploy mid-round is harmless.
