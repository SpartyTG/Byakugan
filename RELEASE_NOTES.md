# BYAKUGAN v0.8.0-beta.137

## What's updated

- Generates the signed-in user's complete current-Act **Win / Loss / Draw**, K/D, headshot percentage, and current RR without account-specific targets or hardcoded totals.
- Fixes the 155-match ceiling that produced the incorrect 81/74 display. Riot's `Total` value is now treated only as a diagnostic hint, never as the end of the Act.
- Retrieves six supported 20-match index pages concurrently for a fast new-user scan, continuing until the response actually crosses the current Act's start date.
- Honors corrected response cursors after short pages so concurrency cannot skip matches between page boundaries.
- Counts draws independently and includes their combat statistics in Act K/D and headshot calculations.
- Retries temporary Riot throttling, timeout, and server failures while hydrating details at a safer concurrency of 8.
- Advances the append-only Act cache to schema 12, preserving collected matches while forcing one corrected boundary-based reindex.
- After the initial scan, completed statistics load from disk and each new match is appended automatically; a new Riot Act naturally starts a separate cache.
