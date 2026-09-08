# BYAKUGAN v0.8.0-beta.144

## What's updated

- Adds an automatic Act record audit capturing Riot's NumberOfWins, NumberOfWinsWithPlacements, NumberOfGames, wins-by-tier total and placement counters separately.
- Records selected Act dates, metadata dates, source coverage, unresolved cached entries, and recent rating updates without completed details.
- Saves act-record-audit.json on the gaming PC and automatically transfers the scoped audit to the streaming PC. No HenrikDev key or reimport is required.
- Does not adjust match results or declare full coverage based on an assumed placement rule. The two-win/two-game discrepancy remains under investigation.
- Includes beta.143 historical import and prior dual-PC caching improvements.
