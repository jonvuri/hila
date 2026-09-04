# Repository instructions

Keep sentences concise, direct, and easy to read. When you already
change a document or comment, correct unclear or overly verbose prose
in the part that you touch. Do not start an unrelated rewrite.

Use subagents as needed for isolated, context-heavy tasks. Delegate to preserve
main-session context and run independent work in parallel.

## Context and planning

1. Start with [context/NOW.md](context/NOW.md), then read the linked active-session
   sections and only the canonical topic documents needed for the task.
2. Use [context/README.md](context/README.md) to find architecture, design, roadmap,
   and historical context. `NOW.md` records execution state; it is not architectural
   authority.
3. Follow [context/Documentation.md](context/Documentation.md) for document roles,
   archive boundaries, and verification.
4. Ask a question only when a missing answer can materially change the result.
5. When a session closes, update the relevant plan and leave `NOW.md` as a short,
   accurate handoff for the next session. It should not be a historical
   log.
6. Stage changes for review and suggest a short commit message. Do not
   run writing git operations.

## Working with phased plans

Implementation plans live in `context/phases/Phase-*.md` as numbered stages with
checkbox items (`- [ ]` / `- [x]`). When executing a stage:

- Work through each item in order and run the verification specified for that stage.
- Check off each item, including test and implementation sub-items, as it is completed.
  The phase document is the detailed progress record; `NOW.md` only routes to it.
- Do not build later stages early. Preserve the project's incremental approach.

## Development principles

- **Incremental and intentional evolution.** Build only necessary complexity. Use the
  high-level goals to avoid dead ends, but do not build ahead of proven need.
- **Gestalt awareness.** Keep architecture, code, and documentation coherent as a
  whole. Update related material when a decision changes it.

## Code style

- Prefer `type` over `interface` for type definitions.
- Prefer arrow function expressions over function declarations.

## Schema changes

Every schema change must update the durability policy. Add a two-replica case, or state why
existing coverage is sufficient.

Databases remain reset-only at schema version 0 until the durable dogfooding gate in
`context/Plan.md`. Before that gate, bootstrap migrations may be rewritten. After activation,
every schema change must update fresh initialization, increment the version, and add a forward
migration or an explicit compatible no-op proof. Follow the backup and rollback contract in
`context/Sync.md`.

## Verification

After major code changes, run the checks relevant to the active plan:

- Formatter: `npm run format`
- Linter: `npm run lint`
- Static types: `npm run typecheck`
- Unit tests: `npm run test:run`
- E2E tests: `pnpm test:e2e`

Documentation-only changes do not require code tests. Format the touched documents and
run `git diff --check`.

Before writing or running Playwright tests, debugging browser failures, or driving the
live app, read [context/Testing.md](context/Testing.md). E2E runs must use the
system-installed browsers outside the sandbox.
