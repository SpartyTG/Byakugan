# BYAKUGAN v0.8.0-beta.133

## What's updated

- Restores the original Overview presentation: one current-Act **W/L**, **K/D**, and **Headshot %** record with no wins/games split or retained-detail annotation.
- Full-Act discovery again prioritizes a fast direct pull, requesting broad Riot history ranges and hydrating match details at the earlier menu-only concurrency.
- Pagination now follows Riot's returned `BeginIndex`, `EndIndex`, and `Total` instead of guessing the next cursor from the number of rows in a filtered page.
- Full-Act collection continues through shortened or sparse pages until the actual Act boundary or Riot's declared end is reached.
- Successfully collected Act matches load from disk immediately, append only newly completed matches, and are mirrored to an invisible monotonic backup.
- Windows cache replacement has a safe fallback and reports persistence failures instead of silently losing the fast-path cache.
