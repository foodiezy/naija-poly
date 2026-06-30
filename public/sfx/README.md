# Sound effects

The game plays a real audio file for each event if one exists here, and
otherwise falls back to a synthesized tone (see `src/client/utils/sound.ts`).
So sound works with **zero files**; dropping a file in upgrades that one event
in place — no code change needed.

## How it works

On app load, `preloadSounds()` fetches and decodes every file below. Missing
files are silently skipped. Files are served by Vite from `public/`, so a file
at `public/sfx/roll.ogg` is fetched from `/sfx/roll.ogg`.

## Expected filenames

Use **`.ogg`** (best size/quality in browsers; `.mp3` also works if you change
the extension in `SFX_FILES`). Keep clips short (< ~1.5s for SFX, the win/jingle
can be longer). Aim to normalize volume across files.

| File              | Plays when…                                  |
| ----------------- | -------------------------------------------- |
| `roll.ogg`        | dice are rolled                              |
| `cash.ogg`        | buying a property, passing START, jackpot    |
| `rent.ogg`        | paying rent or tax                           |
| `draw.ogg`        | drawing a Chance / Esusu card                |
| `jail.ogg`        | sent to Kirikiri Prison                      |
| `build.ogg`       | building a house / hotel                     |
| `your-turn.ogg`   | it becomes your turn                         |
| `game-over.ogg`   | someone wins the game                        |

## Where to get them (all commercial-safe, no attribution)

Recommended: **Kenney** — public-domain (CC0) game audio, no credit required.

- Interface / UI sounds: https://kenney.nl/assets/interface-sounds
- Casino audio (coins, chips): https://kenney.nl/assets/casino-audio
- Impact / misc: https://kenney.nl/assets/impact-sounds

Suggested mapping from Kenney packs:

- `roll.ogg`      ← Casino Audio "card slide" / dice shuffle, or an Impact rattle
- `cash.ogg`      ← Casino Audio "coin" / chip stack
- `rent.ogg`      ← Interface "error" / soft negative blip
- `draw.ogg`      ← Interface "select" / page-flip style click
- `build.ogg`     ← Impact "hit"/"knock"
- `jail.ogg`      ← Interface "error" (longer/lower)
- `your-turn.ogg` ← Interface "confirmation" / positive chime
- `game-over.ogg` ← any short victory jingle (Pixabay "win"/"success")

Also fine (royalty-free, no attribution): **Pixabay**
https://pixabay.com/sound-effects/ — search "coin", "dice", "win", "click".

> Kenney's files are usually `.ogg`/`.wav`. If you grab `.wav`, either convert to
> `.ogg` (smaller) or rename the `SFX_FILES` extensions in
> `src/client/utils/sound.ts`. Avoid GPL-licensed audio for a distributable game.
