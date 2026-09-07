# BYAKUGAN v0.8.0-beta.132

## What's updated

- Overview now uses Riot's current-season MMR totals for the authoritative Act win and game counts, so a retained 78-win detail window cannot replace Riot's 128-win total.
- K/D, headshot percentage, maps, agents, and other detail-dependent analytics remain honestly labeled **Partial Act** whenever Riot no longer returns every older match detail.
- An empty history page is treated as a possible Riot retention ceiling, not proof that BYAKUGAN reached the start of the Act.
- Full-Act scans stop their loading indicator after each attempt and show detailed-match coverage instead of appearing to load indefinitely.
- A new append-only, account-and-Act-scoped archive is merged into every cache write so future short responses and updates cannot delete match details BYAKUGAN already collected.
