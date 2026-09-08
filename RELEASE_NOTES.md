# BYAKUGAN v0.8.0-beta.135

## What's updated

- Restores Riot's authoritative current-Act record to Overview, so the live seasonal win count appears immediately instead of a smaller detail-backed sample such as 81/74.
- Shows **Act Wins / Games** from Riot's active-season record; these values update with the normal profile refresh and do not wait for hundreds of match-detail requests.
- Labels K/D and headshot percentage with the number of detailed matches actually available instead of presenting incomplete combat data as a complete Act.
- Retries temporary Riot throttling, timeout, and server failures when loading match details rather than silently dropping those matches after one failed request.
- Reduces detail hydration from 20 simultaneous requests to a safer concurrency of 8, balancing cold-load speed against Riot Client contention and rate limiting.
- Advances the Act cache to schema 11, preserving every collected same-Act match while rechecking the cache against both Riot's win total and game total.
