---
title: Plugins and face composition
kind: canonical
state: active
updated: 2026-10-01
---

# Plugins and face composition

This document owns plugin registration, faces, face choices, hosts, and commands. Terms follow the
[concept ledger](Concepts.md); rationale lives in the [decision log](Decisions.md).

## Current plugin runtime

A `PluginDefinition` declares:

- stable ID, name, and version;
- matrix schemas;
- optional faces and their renderings;
- default face choices;
- named queries and mutations;
- optional commands;
- `init` and `destroy` hooks.

Registration is transactional and idempotent:

1. Register declared face metadata.
2. Upsert the plugin row.
3. Recover or create declared matrixes without inventing a face choice.
4. Persist the plugin's matrix-key-to-ID mapping.
5. Apply a declared default face choice only when its matrix has no face choice.
6. Commit, then run `init` on the main thread.

Unregistering removes the plugin row and runs `destroy`; user data and matrixes persist
([Decision 31](Decisions.md#decision-31)).

Named queries and mutations remain a declaration-only surface: the runtime neither stores nor
dispatches them. Phase 15 owns the general typed and batch operation system and must either
implement that contribution surface or narrow the declaration type
([Decision 42](Decisions.md#decision-42)).

## Plugin boundaries

Plugins extend shared data and presentation. They do not create independent application roots.

- Matrixes outlive the plugin registration that created them.
- Cross-plugin composition happens through matrixes, edges, SQL, faces, and commands, not direct
  plugin-to-plugin service APIs.
- The stream root, launcher, admin surfaces, and fallback rendering are fixed infrastructure.
- Core structural operations enforce ownership, portal, cascade, and schema invariants.

Current real consumers are the workspace plugin, inline references, tags, and the table plugin.
Older separate outline and notes plugins and the tag-registry model are historical.

## Matrix declarations

A plugin matrix declaration supplies a local key, title, and columns. Columns can specify SQLite
type, constraints, and an optional `label` or `content` column role. The runtime records
`managed_by` so plugin-required columns cannot be removed accidentally.

Creating a plugin matrix does not create a face choice ([Decision 14](Decisions.md#decision-14)).
Matrix ownership and type nodes remain data-model concerns, not plugin lifecycle shortcuts. See
[Data-Model.md](Data-Model.md).

## Faces

A face is a plugin's named way to present rows. Its declaration is a `FaceTypeDefinition` with an
ID, a display name, column slots, and overflow behavior. Its renderings are registered under the
same ID.

Two faces ship:

- `hila.table` declares no column slots and registers a line rendering and a collection rendering.
- `hila.workspace` declares `label` and `content` column slots and registers no rendering. Its face
  choice carries the outline variant setting. Session 5B decides what this face choice is.

## Column slots

Column slot resolution is:

1. explicit stable column slot binding;
2. slot name and column name match;
3. preferred type and position;
4. fallback.

Normalized column slot bindings are authoritative. The JSON copy on `face_configs` is a derived
compatibility copy.

## Face choices

A matrix stores at most one face choice ([Decision 14](Decisions.md#decision-14)):

```ts
type FaceRecipe = {
  faceTypeId: string
  slotBindings: Record<string, number | null>
  settings: Record<string, unknown>
}
```

The stored `FaceConfig` adds an ID, the matrix ID, the creating plugin, and sort and filter state.
SQL is not part of a face choice; a view owns its SQL in `block_sources`
([Decision 16](Decisions.md#decision-16)).

New face choice IDs derive from replica-stable matrix identity. Applying the same face preserves
the existing face choice and its sort and filter state. Explicit replacement reuses the ID and
resets incompatible sort and filter state.

Sort and filter state uses stable column IDs. Filter rows have stable UUID identity and an explicit
order field. It remains durable presentation state attached to the face choice and never becomes
subject SQL or untyped settings ([Decision 37](Decisions.md#decision-37)).

Multiple stored face choices and a preferred-choice pointer remain deferred until a real consumer
needs alternate faces for one matrix.

## Subjects

A subject is a node plus one child source ([Decision 8](Decisions.md#decision-8)):

- `loose`: direct owned and portal positions;
- `container`: one matrix extent;
- `view`: one stored SQL result.

The subject owns its query or extent. Faces never define which rows a subject has.

## Renderings

A face may register at most two renderings:

- **line rendering:** one row's fields inside a host's area;
- **collection rendering:** an arrangement of a row set, such as a table, outline, kanban, calendar,
  gallery, or review stack.

A missing rendering falls back to the fallback rendering for that host context. A rendering never
owns a whole panel layout and never mounts another rendering
([Decision 17](Decisions.md#decision-17)).

Renderings stay on the main thread. They are reserved and committed by plugin owner only after
worker registration and initialization succeed. Complete-set replacement removes omitted
renderings. Plugin disposal or database reset removes the owner's renderings before `destroy`
([Decision 30](Decisions.md#decision-30)).

The table plugin is the first complete consumer. Its container host resolves the extent's face
choice, requests the `hila.table` collection rendering, and owns title, sizing, insertion, and
navigation. Its line rendering wraps the same property row component that the fallback line uses,
so field editing has one owner. Neither rendering creates a face choice.

## Face resolution

Hosts resolve a face in this order:

1. per-position face choice, designed but unstored until a real consumer needs it;
2. the matrix face choice;
3. the fallback rendering.

The matrix face choice follows its matrix everywhere it appears. A container subject resolves
against its owned matrix. Loose and view subjects in a focus panel collection resolve straight to
the fallback. Fidelity is runtime state, not part of the face choice
([Decision 25](Decisions.md#decision-25)).

Every rendering mount supplies a fallback rendering, and the fallback always draws at substrate
fidelity ([Decision 18](Decisions.md#decision-18)). The fallback line is `PropertyLine`. The
fallback collection is host-owned: the aspect region for loose subjects and a bounded field list for
container and view subjects.

## Hosts

Hosts own:

- bullets, handles, guides, block and container frames, headers, breadcrumbs, and drill actions;
- nesting and yielded subjects;
- width, density, and height budgets;
- fidelity scopes and the x-ray cascade;
- insertion affordances and the no-ownership rule.

A rendering mount (`FaceHostSlot`) resolves the face, mounts the registered rendering or the
fallback, applies the fidelity scope, and catches yielded subjects. Host services pass only
navigation requests, insertion requests, and yield. They never expose shell DOM, pixel sizing, or a
mount callback.

| Host context                     | Requested rendering      | Status                          |
| -------------------------------- | ------------------------ | ------------------------------- |
| stream item                      | `line`                   | designed                        |
| expanded block                   | `line` plus `collection` | designed; Session 5B reviews it |
| focus panel collection region    | `collection`             | shipped                         |
| aspect line in the aspect region | `line`                   | shipped                         |
| property popover                 | host-owned only          | shipped                         |

"Expanded block" is the pre-ledger name of this row. Session 5B decides whether it describes inline
results in the stream or the focus panel case.

The focus panel is a host with four panel regions: identity, fields, collection, and relations. It
routes loose, container, and view subjects through one collection host:

- A loose subject shows the aspect region. Each aspect line is a rendering mount resolved against
  the aspect's matrix.
- A container subject requests the owned matrix's face choice and otherwise shows a bounded
  fallback collection.
- A view subject keeps its SQL on the view and uses it only as collection input.

Missing face choices or renderings fall through visibly without creating stored state. A nested
subject yields back to the host, which resolves and renders the next collection under the inherited
fidelity scope.

The panel host keeps identity, intrinsic and overflow fields, relations, sizing, navigation, and
insertion policy. Container fallback insertion creates owned rows. View results keep recognized
field write-back and never gain structural insertion, drag, reparenting, or inferred ownership
([Decision 19](Decisions.md#decision-19)). Property popovers remain host-owned rather than
renderings. Formula and read-only fields stay read-only.

## Remaining migration

- Move stream item and inline results participation onto hosts and rendering mounts. Session 5B
  decides the form, and Session 6 implements it.
- Move workspace face choice settings and `FaceConfigPanel` onto face resolution.
- Keep the migrated inline tag and property lifecycle without restoring a Tag Browser root.

Phase 14 cannot add task or review renderings until Phase 13 completes this contract. Shipped
session detail lives in the [Phase 13 plan](phases/Phase-13.md).

## Commands

Phase 12 ships a main-thread command registry. A descriptor contains serializable discovery
metadata plus its callable implementation:

```ts
type CommandDescriptor = {
  id: `${string}.${string}`
  label: string
  keywords: readonly string[]
  surfaces: readonly ('slash' | 'launcher')[]
  subject: 'required' | 'none'
  unavailableReason?: (context: CommandInvocationContext) => string | null
  run: (context: CommandInvocationContext) => Promise<void> | void
}
```

The `subject` field declares whether the command needs a command target. The invocation context
carries the command surface, an optional `NodeRef` command target, and explicit capability
callbacks. It never exposes `EditorView`. Enumeration and matching preserve registration order,
filter by command surface, and return immutable registry-owned snapshots. Commands that require a
target remain discoverable without one and report a concrete disabled reason. Invocation rejects
unavailable commands and preserves asynchronous failures.

Plugin command functions stay on the main thread ([Decision 29](Decisions.md#decision-29)).
`PluginRegistration` omits commands, renderings, and lifecycle hooks from the structured-clone-safe
worker payload. Contributions are owned by plugin ID. A registration reserves its complete command
set before worker or initialization effects, so cross-owner duplicate IDs fail without partially
installing the plugin. Replacing an owner's set preserves its order, and generation checks prevent
stale or disposed registrations from committing. Teardown removes the owner's commands before its
`destroy` hook ([Decision 30](Decisions.md#decision-30)).

The workspace plugin contributes `hila.table` to slash and launcher, followed by slash-only
`hila.attach`. The slash adapter supplies the table-name focus and type-picker capabilities, so
`/table` and `/attach` keep their typed-operation and follow-up behavior. The launcher freezes its
command target and capabilities when it opens. `hila.table` creates an owned matrix, applies the
table face, and hands focus to the owning node's embedded collection. Slash uses the current node;
the launcher navigates to its frozen target before the same table-name focus handoff. Without a
target, the command stays visible with a disabled reason. Attachment remains slash-only until an
app-wide picker capability exists.

The discovery service merges launcher-surface entries on the main thread after its worker catalog
scan, without sending callable implementations through the worker boundary. Visible labels match
at the command-label weight; stable IDs and keywords match at the lower command-keyword weight.
Registration order is a deterministic tie-break. Disabled reasons travel with results for
presentation but do not affect matching or score.

Global shortcuts use self-describing registrations with stable IDs, titles, keys, and optional
contexts. The manager listens during capture so a registered global gesture wins before an editor
can stop propagation. `Mod-k` belongs to the launcher and no longer appears in the ProseMirror
keymap. Other editor-local handlers expose parallel handler-free descriptors. The Quick guide
combines both descriptor collections and formats normalized keys for the active platform.

## Inline references and tags

Inline references are plugin-provided presentation and editing over core edges:

- `@` creates or resolves non-owning `ref` associations;
- `#` creates owned aspects or applies existing type nodes;
- live, empty, and dangling references use cached rich-text metadata when the target is absent;
- edges provide forward and reverse lookup and lifecycle indexing;
- type discovery reads type nodes, not a tag registry matrix.

The core owns edge and cascade semantics. Plugins own ProseMirror nodes, autocomplete, rendering,
and source-document reconciliation.

## Growth rules

These apply [Decision 42](Decisions.md#decision-42):

- Add registration or lifecycle surface only after a real consumer requires it.
- Do not add plugin top-level application surfaces.
- Do not expose pixel sizing or shell DOM to renderings.
- Do not let a query result infer ownership or insertion.
- Keep stable column IDs in stored face choices.
- Do not add multiple stored face choices or a preferred-choice pointer until a real consumer needs
  alternate faces for one matrix.
- Extract a richer host services contract only when a genuine whole-area consumer proves that line
  and collection renderings are insufficient.
