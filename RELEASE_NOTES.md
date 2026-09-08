# BYAKUGAN v0.8.0-beta.134

## What's updated

- Removes Riot's misleading `NumberOfGames` value from current-Act totals and scan limits. BYAKUGAN no longer presents or plans around the incorrect 254-game figure.
- Keeps Riot's seasonal **128 wins** value only as a completeness check: a smaller detailed history can never be mislabeled as the full Act.
- Discovers the Act through normal 20-match history pages, fetched in bounded concurrent waves until Riot reaches the actual Act boundary.
- Hydrates discovered match details at the fast menu-only concurrency so W/L, K/D, headshot percentage, maps, agents, and journey progress begin filling promptly.
- Advances the Act cache to schema 10, forcing one clean reindex while preserving and merging every valid same-Act match already collected.
- Completed Act data still loads from disk immediately on later launches and appends only newly completed matches.
