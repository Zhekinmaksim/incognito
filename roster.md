# The roster

16 agents, 8 binary traits, one byte each, packed little-endian into a single
`uint256`. Slot `i` sits at bits `[8i, 8i+8)`.

```
PACKED_ROSTER = 0x000000000000000000000000000000000f3e1dac3b5ae968276615c4f332c1c0
```

Trait bits, low to high: `hat`, `glasses`, `beard`, `scar`, `earring`, `tie`,
`smoker`, `gloved`.

| # | Agent | Mask | Traits |
|---|-------|------|--------|
| 0 | Kestrel | `0xc0` | smoker, gloved |
| 1 | Magpie | `0xc1` | hat, smoker, gloved |
| 2 | Shrike | `0x32` | glasses, earring, tie |
| 3 | Cormorant | `0xf3` | hat, glasses, earring, tie, smoker, gloved |
| 4 | Jackdaw | `0xc4` | beard, smoker, gloved |
| 5 | Plover | `0x15` | hat, beard, earring |
| 6 | Harrier | `0x66` | glasses, beard, tie, smoker |
| 7 | Bittern | `0x27` | hat, glasses, beard, tie |
| 8 | Grosbeak | `0x68` | scar, tie, smoker |
| 9 | Wigeon | `0xe9` | hat, scar, tie, smoker, gloved |
| 10 | Sanderling | `0x5a` | glasses, scar, earring, smoker |
| 11 | Nightjar | `0x3b` | hat, glasses, scar, earring, tie |
| 12 | Tern | `0xac` | beard, scar, tie, gloved |
| 13 | Merlin | `0x1d` | hat, beard, scar, earring |
| 14 | Rook | `0x3e` | glasses, beard, scar, earring, tie |
| 15 | Siskin | `0x0f` | hat, glasses, beard, scar |

## Why these values

The low nibble of every mask is the agent index, so the first four traits alone
identify anyone uniquely. Four honest answers solve the game - which is exactly
why the lie layer has to exist.

The high nibble is deliberately correlated with the low one rather than random.
That redundancy is the only way a player can ever catch a lie by contradiction;
without it a false answer is undetectable and the game degenerates into
coin-flipping.

Trait balance across the roster runs between 6 and 10 out of 16, so no single
question is worth much more than any other, and no trait belongs to exactly one
agent - that would turn one question into a free win.

## The traps

Three pairs differ by exactly one trait:

- **Kestrel / Magpie** - the hat
- **Kestrel / Jackdaw** - the beard
- **Plover / Merlin** - the scar

A single lie about one of those traits does not just muddy your picture, it
turns you into a different real agent. Those are the answers worth a glass.
