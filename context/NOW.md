---
title: Current state
kind: status
state: ready
updated: 2026-09-03
phase: 11
session: stage-8-performance-coverage
---

# Now

Phase 11 Stage 7 is complete. The unreleased app remains at reset-only schema version 0. The first
dogfood build whose data should survive upgrades activates the durable dogfooding gate and
establishes version 1; the gate may follow all currently planned phases.

The dormant migration runner already proves ordered schema/data evolution and full rollback. The
gate requires explicit reset or reviewed adoption of version-0 databases, removal of reset-era
compatibility migrations, and a backup path before the first `1 → 2` migration.

Phase 11 next restores canonical performance coverage, then closes out the active documents.
Phase 13 still owns removal of the legacy face contract and blocks Phase 14 until it is complete.

## Read next

1. [Phase 11](phases/Phase-11.md), starting with Stage 8.
2. [Performance](Performance.md) for deterministic and browser budgets.
3. [Testing](Testing.md) before adding or running browser coverage.
4. [Documentation.md](Documentation.md) for session closeout rules.

## Boundary

Execute Phase 11 stages in order. Do not build the launcher, retire tabs, or complete the global
design migration early.

## Next action

Begin Stage 8: restore exact editor-churn coverage and calibrate the bounded throttled-browser
performance backstop.
