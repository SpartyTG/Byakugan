# BYAKUGAN v0.8.0-beta.142

## What's updated

- Settings now includes HenrikDev history check, usable on the streaming PC with an updated gaming-PC snapshot.
- Checks stored competitive matches for the connected account and Act against hashes of completed cached match IDs, reporting usable and missing matches without changing your stats.
- Uses your API key for the manual request only. The password field clears immediately; the key is not persisted, logged, or included in reports or snapshots.
- Saves henrik-history-check.json on the PC running the check. Handles inaccessible accounts, rate limits, network failures and duplicate records.
- Includes prior dual-PC caching and Act diagnostic transfer. Historical recovery is not yet verified against the provider for your account.
