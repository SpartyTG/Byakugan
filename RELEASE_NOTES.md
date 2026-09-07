# BYAKUGAN v0.8.0-beta.131

## What's updated

- Full-Act recovery now combines Riot's general match history with its separately paginated competitive-update index instead of trusting a shortened history response as complete.
- Existing beta.129 and beta.130 Act caches receive a one-time reindex, so an incorrectly saved 44/44 dataset can recover older same-Act matches.
- Riot pages containing fewer than 20 records continue from the exact next index until an empty page or previous-Act boundary is reached.
- Large Act recovery scans wait until VALORANT is out of Agent Select and active matches, then hydrate match details with bounded concurrency.
