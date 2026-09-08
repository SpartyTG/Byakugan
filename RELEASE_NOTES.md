# BYAKUGAN v0.8.0-beta.136

## What's updated

- Restores complete current-Act result counting as **Wins / Losses / Draws**.
- Fixes the 155-match ceiling that produced the incorrect 81/74 display. Riot's `Total` value is now treated only as a diagnostic hint, never as the end of the Act.
- Continues through supported 20-match pages until the response actually crosses the current Act's start date or returns a truly empty page.
- Follows Riot's response cursor so short pages cannot skip matches between page boundaries.
- Counts draws independently and includes their combat statistics in Act K/D and headshot calculations.
- Retries temporary Riot throttling, timeout, and server failures while hydrating details at a safer concurrency of 8.
- Advances the append-only Act cache to schema 12, preserving collected matches while forcing one corrected boundary-based reindex.
