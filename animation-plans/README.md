# Chippi animation plans

| Plan | Title | Severity | Status |
| --- | --- | --- | --- |
| [001](./001-liquid-gooey-chippi-state-motion.md) | Add restrained liquid continuity to Chippi state changes | MEDIUM | IMPLEMENTED — local verification complete |

## Recommended order

1. Execute plan 001 as one bounded slice: dependency installation, Chat/Work
   active-indicator motion, voice-state label morph, and focused tests.
2. Review at normal speed and 10% playback before accepting. Remove either
   placement if it reads as decoration instead of state continuity.

No other application surface should receive `liquid-gooey` until this first
slice is visually accepted.
