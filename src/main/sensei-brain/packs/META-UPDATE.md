# How to update Sensei meta

`meta.current.json` is the only live pack. Sensei reads it from disk. You do not retrain a model.

## When a new VALORANT patch drops

1. Copy `meta.current.json` to a dated name, example:
   `meta.v26-act4-13.06.json`
2. Edit `meta.current.json`:
   - `packId` — new id
   - `gamePatch` — official patch number
   - `act` — current act name
   - `validFrom` — date you wrote it
   - `changelogForCoach` — 3 to 6 short facts the coach must know
   - `doNotSay` — old advice that is now false
   - `sources` — patch notes URLs or titles
3. Save.
4. Run:

```bat
cd /d C:\Users\Tyler\Documents\GitHub\Byakugan
node scripts\sensei-brain-meta-smoke.cjs
```

5. Commit. Tag only when you ship a release.

## Rules

- Do not invent numbers.
- Prefer "do not coach as if X" over long essays.
- Map defaults stay empty until you have stable notes.
- If you are unsure, leave the old pack and add one "unknown" line instead of guessing.
