# BYAKUGAN v0.8.0-beta.143

## What's updated

- Settings → HenrikDev history check now includes Import missing Act matches. Run it from the streaming PC with both PCs updated and connected.
- Fetches stored history using your locally entered, unsaved key. Only selected match records cross the authenticated local relay; the key never goes to the gaming PC.
- Gaming PC validates the account, Act, match IDs, dates, combat numbers and team scores. Missing matches and rating-only placeholders are recovered; existing completed Riot details are retained.
- Imported records persist in the gaming PC Act cache and archive. Repeated imports do not duplicate matches. Combined totals sync to the streaming PC and its persistent cache.
- ACT requires combined wins and completed games to equal the available Riot seasonal counters at import time; unresolved coverage remains PARTIAL ACT.
- Skips ambiguous early tied exits instead of counting them as draws. Missing historical RR is not invented or plotted in Act Journey.
- Saves henrik-history-import.json on the PC initiating the import, containing counts and combined statistics without the API key.
