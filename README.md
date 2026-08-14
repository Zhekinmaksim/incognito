# INCOgnito

A five-seat deduction game on Inco Lightning. Everyone at the table can read
your card. You cannot. You ask the room questions about yourself, and whoever
the house picks to answer is free to lie to your face.

Built for the Inco Summer Game Jam.

## Live

- Landing page: https://incognito-sage-seven.vercel.app/
- Play screen: https://incognito-sage-seven.vercel.app/play
- Keeper status: https://incognito-keeper.fly.dev/status
- Base Sepolia contract: [0x9Abd9714FdF0f10967C4e028EdB40af4de827456](https://sepolia.basescan.org/address/0x9Abd9714FdF0f10967C4e028EdB40af4de827456)

The browser screen defaults to this Base Sepolia deployment and uses the
DeFy'26 Inco path: `Lib.sol` plus `Lightning.baseSepoliaTestnet()`.

---

## The three things that are confidential, and why each one matters

**Your own card.** Encrypted at the deal, then granted to every seat at the
table *except yours*. An access grant pointed away from its owner. On a chain
where state is public you read your own card in storage and win on the first
move — there is no game to play.

**Whether an answer was honest.** The claim is public. The true answer is
computed over encrypted state and sealed where nobody can open it, including
the player who asked. Without that, lying is either impossible or unprovable,
and both kill the scene.

**Nothing else.** Questions, answers and the pause before an answer are public
on purpose. The game is played in the open. Only the truth is not.

The second claim is the one worth the trip. Most confidential applications hide
a value. This one makes *lying* a settled on-chain operation: you may deceive
the whole room, and the receipt is written before anyone thinks to ask for it.

## The rule that took a thousand simulated games to find

A lie is hidden from exactly one person. Everybody else is reading the asker's
forehead and watches it land in real time — so **only the player who was lied
to may call it**. The room knows; the victim doesn't; the victim has to decide
on a tell.

Which is why the hesitation is recorded. It proves nothing. It is the only
thing there is.

---

## Running it

```bash
npm install
npm run sim          # a thousand games, and what kind of game they are
npm run watch        # one night, narrated turn by turn
npm run test:logic   # the interface, the call sequences, the phrasing
npm run check:hackathon # submission files, metadata, assets and Inco configuration
npm run build        # compile the contract
npm run deploy       # Base Sepolia; deploy:mainnet for Base
```

The playable screen is `site/play.html` — open it and it deals immediately, no
wallet, no node, no server. `site/index.html` is the landing page; the core
page artwork is inlined, while the favicon and social preview are served as
standard cacheable assets.

## Layout

```
contracts/Incognito.sol   the game
game/rules.js             roster, questions, candidate sets — shared by everything
game/bots.js              the five regulars
game/table.js             a whole night in one call, for balance work
game/session.js           one move at a time, for a person
game/chain.js             the same game against a deployed contract
game/iface.js             what the screen is allowed to know
keeper/                   the house table: five wallets, one process
site/                     landing page and the playable screen
remotion/                 30-second hackathon film source
test/                     the suites behind every claim in this file
```

`rules.js` carries the same packed roster constant the contract does. Change one
and change the other, then re-run `npm run sim`.

## What the simulator says

A thousand games, current tuning:

| | |
|---|---|
| average length | 18.8 turns |
| games that stall | none |
| lies per game | 1.67 |
| glasses spent | 2.02 |
| accusations that caught a liar | 37% |

Wins spread across the five personalities at roughly 41 / 22 / 22 / 9 / 6, so
no single way of playing dominates.

**The tell is weak on purpose, and measurably so.** Lies are about a tenth of
all answers. A liar hesitates 46% of the time; an honest player 10%. Bayes puts
the best possible read of a pause at 35% — which means calling a liar is a
gamble however well you play it. That is why a wrong accusation costs a glass
and a turn rather than your life; under the original rule the maths made
accusing strictly bad and nobody would ever have pressed the button.

## Pre-existing work

The jam rules require disclosure. The confidential-compute patterns and SDK
setup follow Inco's documentation, `ConfidentialDeck` reference and official
Base Sepolia starter template. The game contract, encrypted collision-repaired
deal, roster, bots, screens, artwork and copy were written for this jam.

## License

Released under the [MIT License](LICENSE).
