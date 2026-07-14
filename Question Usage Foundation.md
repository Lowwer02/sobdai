# Sobdai Admin — Question Usage Foundation

## Highlights

- **Usage visibility:** every question now shows how many exam sets use it.
- **Find unused questions fast:** new server-side Used/Unused filter works across the entire Question Bank.
- **Clearer selection state:** instantly see what's Selected vs. Already in this Exam; accidental double-adds are now impossible.
- **Inspect without context-switching:** open any question to see full metadata, where it's used (by package), and its timeline — read-only, right in the picker.

## Improvements

- Filter toolbar reorganized into Content → Properties → Selection groups.
- Badges and selection states are now responsive and consistent.

## Technical

- One additive database migration (usage counts RPC). No existing data rebuilt.
- No changes to question selection, save, pagination, or existing filters.

## Compatibility

- Fully backward-compatible; no data migration required.
