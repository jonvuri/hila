# Hila exploration recovery

## Source capture, audit, and reconciliation

The [source addendum](source-addendum/README.md) preserves three reassembled full historical file
readbacks and the original layout-mockup prompt, with provenance and explicit fidelity limits.
The [coverage and confidence audit](coverage-audit.md) maps all U01–U51 inputs to D/O entries and
records eight corrections or qualifications. Its final section identifies their reconciliation.

Current working outcomes are now in the [outline exploration](../../../explorations/Relational%20outline%20exploration.md)
and [film-study exploration](../../../explorations/Relational%20film-study%20exploration.md), with the
[selected sequence](../../../explorations/Relational%20concept%20review.md#selected-next-sequence) and
[runtime brief](../../../explorations/Relational%20runtime%20exploration.md) updated to route there.
Canonical architecture remains unchanged. Historical evidence and the first/second-pass logs retain
their original wording; consult the audit for later qualifications.

## Second-pass context recovery

[Decision inputs, scenarios, and rationale](decision-context.md) expands every D01–D62 entry with the available discussion context, worked scenarios, alternatives, corrections, and related decisions. It distinguishes committed evidence, quoted user inputs, conversational reconstruction, and unresolved details. This is provisional exploration recovery, not canonical architecture.

The first-pass ZIP below remains unchanged. The second-pass companion is a separate file and is not included in that historical ZIP. Its references to unreconciled working documents describe the second-pass checkpoint; the reconciliation above has since carried the recovered outcomes into those documents.

## Repository checkpoint

The first repository checkpoint preserved three recovery deliverables:

- [Decision log](decision-log.md): the first-pass decision inventory, formatted for repository reading.
- [Recovery ZIP](hila-recovery-2026-11-17.zip): the complete evidence package, including original Markdown copies, quoted inputs, recovered draft excerpts, access checks, and committed baseline.
- This README: the package inventory and fidelity limitations.

Paths under `evidence/` and `baseline/` below refer to files inside the ZIP. Extract it to read them. The notes below describe the recovery snapshot before this repository checkpoint; its temporary paths and Git working-tree observations are historical.

Created 2026-11-17 at the user's request. This is recovery evidence and a decision inventory, not a revision of canonical architecture.

## What is preserved

- `evidence/visible-user-inputs.md`: selected verbatim user messages available in the active conversation, ordered by topic and chronology. Not a complete transcript.
- `evidence/prior-draft-excerpts.md`: verbatim portions of the earlier uncommitted documentation returned by tools in this conversation. These are evidence of the old draft, including proposals subsequently superseded.
- `evidence/context-snapshot.md`: carried-forward factual context, assistant proposals, source-access limitations, and remaining work. This is a reconstruction, not verbatim conversation text.
- `decision-log.md`: first-pass decision log, with relevant inputs, outcomes, rationale, status, and unresolved boundaries.
- `baseline/committed-context.tar`: exact Git archive of `context/` and `AGENTS.md` at `af1b7d302f9a07a7f85b1c86fd2e448e88fd19a9`.
- `baseline/commit-history.txt`, `checkpoint-stat.txt`, `current-working-tree.txt`: Git evidence gathered during recovery.

## Fidelity and limits

The assistant has no functioning full-transcript export on this host. `codex_app.list_threads` returned: "This app tool is no longer available through dynamic tools. Use the codex_app MCP server. If that server is unavailable on this host, task delegation is unavailable." Earlier `codex_app.list_artifacts` returned "No handler registered for tool: codex_app.list_artifacts". The exposed `/workspace/.codex` and `/workspace/.agents` directories are empty. No API exposing the assistant's entire input as a file is available.

The active context contains user messages from earlier work, a carried-forward summary of older assistant/tool turns, and later visible assistant/tool turns. Therefore this package MUST NOT be described as a full or lossless transcript export. Quoted evidence is distinguished from reconstructed summaries. Missing historical assistant explanations may contain nuance absent from this pass.

The former staged patch is absent from this resumed workspace. Some of its content survives verbatim in earlier tool outputs. The source addendum reassembles three full readbacks from the exact committed baseline and surviving text, but no original-file hash proves byte identity. Complete original transcript, other unexposed staged files, original agent reports and image pixels remain unavailable here.

## Git and durability

Remote `docs/full-revamp` was verified on 2026-11-17 at `af1b7d3`. Earlier commits include `97ce96b` (task/SRS resolutions), `293510c`, and `855026e`. Current local checkout is clean branch `work` at older `e1afdad`; FETCH_HEAD contains `af1b7d3`. No branch switch, commit, or push was performed for this recovery pass.

These files live in a temporary Cloud filesystem. A downloadable archive is provided for preservation outside this environment. Merely writing or staging files does not make them independent of the Cloud VM recovery window. Current official documentation: https://help.openai.com/en/articles/20001545-using-codex-cloud (saved VM state recoverable by default for up to seven days after the last start of a turn or task resume; separate from conversation-history retention).

## Remaining recovery work

1. Keep new recovery additions independently checkpointed. The original package was pushed as `5d88dc2`; the second-pass companion and routes were pushed as `f003960`.
2. If original desktop/service transcripts or the generated image become accessible, compare them against the preserved reconstruction; do not claim their absence here proves permanent loss.
3. Otherwise resume the film-study inline-matrix gesture trace. Additional recovery prose without new evidence is unlikely to improve fidelity.
4. Commit/push the latest reconciliation only under applicable user instruction; temporary files and staging are not independent backups.
