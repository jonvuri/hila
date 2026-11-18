# Hila exploration recovery

## Second-pass context recovery

[Decision inputs, scenarios, and rationale](decision-context.md) expands every D01–D62 entry with the available discussion context, worked scenarios, alternatives, corrections, and related decisions. It distinguishes committed evidence, quoted user inputs, conversational reconstruction, and unresolved details. This is provisional exploration recovery, not canonical architecture.

The first-pass ZIP below remains unchanged. The second-pass companion is a separate file and is not included in that historical ZIP. The source documents under `context/explorations/` remain older checkpoints until reconciliation; consult the recovery log and companion for later conversational decisions.

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

The former staged patch is absent from this resumed workspace. Some of its content survives verbatim in earlier tool outputs; those excerpts are retained here before further interpretation. Exact full-file recovery remains a later step.

## Git and durability

Remote `docs/full-revamp` was verified on 2026-11-17 at `af1b7d3`. Earlier commits include `97ce96b` (task/SRS resolutions), `293510c`, and `855026e`. Current local checkout is clean branch `work` at older `e1afdad`; FETCH_HEAD contains `af1b7d3`. No branch switch, commit, or push was performed for this recovery pass.

These files live in a temporary Cloud filesystem. A downloadable archive is provided for preservation outside this environment. Merely writing or staging files does not make them independent of the Cloud VM recovery window. Current official documentation: https://help.openai.com/en/articles/20001545-using-codex-cloud (saved VM state recoverable by default for up to seven days after the last start of a turn or task resume; separate from conversation-history retention).

## Remaining recovery work

1. Keep new recovery additions independently checkpointed; the original three-file package was committed and pushed as `5d88dc2`.
2. Review the first-pass log alongside the second-pass qualifications, especially current-winning-revision undo guards, local reset scope, and the remaining open inline-matrix gestures.
3. Reconcile the exploration documents on `docs/full-revamp`, preserving canonical architecture and marking superseded proposals explicitly.
4. Format/check, then commit and push only under the user's applicable authorization.
