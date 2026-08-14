# The score

Save the finished track as `site/audio/incognito-theme.mp3`. The page already
looks for it there, so nothing else needs changing.

---

## The main cue — what plays under the cold open

Aim for something that sounds like it was already playing when you walked in:
a small room, a bad amp, nobody performing for you. Sparse beats fear, because
the page has long silences of its own and a busy track fights them.

**Style prompt**

```
spaghetti western noir, slow surf guitar with heavy spring reverb and tremolo,
upright bass walking low and lazy, brushed snare, distant vibraphone,
single sustained hammond organ note underneath, 68 bpm, D minor,
dusty analog tape, mono, room tone, no vocals, no drop, unresolved
```

**Exclude**

```
drums build, cinematic riser, orchestral swell, trap hats, EDM, choir,
modern production, sidechain, vocals
```

**Lyrics box** — set to instrumental, and paste this as structure:

```
[Intro: room tone, faint amp hum, 8 seconds]
[Verse: lone tremolo guitar, one phrase, repeated]
[Bass enters, walking, no fill]
[Break: everything drops but the organ note]
[Verse: guitar returns, one degree darker]
[Outro: unresolved, let the reverb tail run]
```

**Why unresolved matters.** The track loops forever under a page about a
question nobody answers honestly. If it lands on the tonic it will feel like an
ending every 90 seconds and the loop point will be audible. Ask for a suspended
or unresolved close and the seam disappears.

Target length 1:30 to 2:30. Longer wastes a megabyte; shorter and the loop
becomes obvious.

---

## Two alternates worth generating

Suno is cheap to re-roll, so make three and pick with the page open, not in the
Suno player — a track that sounds great alone often sits badly under type.

**Colder, more European.** For a room with no exit.

```
minimal crime jazz, muted trumpet playing one phrase, double bass, wire brushes,
distant piano chord, cigarette smoke atmosphere, 62 bpm, no vocals, sparse,
lots of space between notes, analog tape hiss, mono
```

**More tension, less melody.** If the guitar version reads as too romantic.

```
dark ambient noir underscore, low drone, occasional muted guitar harmonic,
irregular heartbeat pulse, no melody, tape saturation, 60 bpm, unsettling,
patient, no vocals, no percussion build
```

---

## Fitting it to the page

The cold open runs about nine seconds to the title card. If the cue has an
intro, trim it so that whatever your best moment is — the first guitar phrase,
the bass entry — lands somewhere between the lamp striking and the answer. The
player already holds 900 ms of silence before starting, so the slate reads in
a quiet room.

Loop cleanly: cut on a bar line at a zero crossing, and check the seam by
playing the last four seconds into the first four.

Keep it under about 2 MB. The page is already 900 KB of inlined artwork, and
the audio loads separately, so a heavy track delays nothing on screen but does
cost the visitor bandwidth on a phone.

---

## What the player does, and the one thing it cannot do

Chrome, Safari and Firefox all refuse to start audible sound without a user
gesture, and no amount of code gets around it — that restriction exists
precisely to stop pages doing what you are asking for. So the player:

- tries to start on its own, which works when the visitor has previously
  interacted with the site or has autoplay allowed;
- otherwise arms the first scroll, tap or keypress, which on this page is the
  same gesture that skips the cold open, so it usually fires within a second or
  two of landing;
- fades the volume in over 2.6 seconds rather than snapping to full, so it
  never feels like an ad;
- caps at 42% volume;
- shows a control in the top right so anyone can kill it in one click.

In practice most visitors will hear it a beat after they touch the page rather
than the instant it loads. That is the ceiling, and it is the same ceiling
every site has.

One judging note: if you record the demo video with the score playing, check
the jam's submission rules on music. A generated instrumental you made is
normally fine, but some platforms flag uploads with music, and you do not want
a muted or blocked video on the day.
