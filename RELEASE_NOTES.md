# BYAKUGAN v0.8.0-beta.139

## What's updated

- Recovered match details now replace older rating-only placeholders, restoring their contribution to Act statistics.
- Saves act-scan-diagnostics.json in the application data folder after an Act scan, recording page ranges, counts, stop reasons, request status codes, and unresolved detail counts without account identifiers or credentials.
- This is a recovery and diagnostic update; complete older Act history is still under investigation.

- Act scans can start during Agent Select and gameplay. Index and detail concurrency are each limited to two requests, including menu scans. Existing retry cooldowns remain in effect.
