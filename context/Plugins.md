---
title: Plugins and face composition
kind: canonical
state: active
updated: 2026-09-25
---

# Plugins and face composition

This document separates the shipped plugin runtime from the approved forward face and command
contracts.

## Current plugin runtime

A `PluginDefinition` currently declares:

- stable ID, name, and version;
- matrix schemas;
- optional face types;
- face bindings;
- named queries and mutations;
- `init` and `destroy` hooks.

Registration is transactional and idempotent:

1. Register declared face-type metadata.
2. Upsert the plugin row.
3. Recover or create declared matrixes without inventing a fallback recipe.
4. Persist the plugin's matrix-key-to-ID mapping.
5. Initialize a declared face binding when its matrix has no intentional recipe.
6. Commit, then run `init` on the main thread.

Unregistering removes the plugin row and runs `destroy`; user data and matrixes persist.

Named queries and mutations remain a declaration-only compatibility surface: the runtime neither
stores nor dispatches them. Phase 15 owns the general typed/batch operation system and must either
implement that contribution surface or narrow the declaration type.

## Plugin boundaries

Plugins extend shared data and presentation. They do not create independent application roots.

- Matrixes outlive the plugin registration that created them.
- Cross-plugin composition happens through matrixes, relationships, SQL, faces, and commands—not
  direct plugin-to-plugin service APIs.
- The stream, launcher, system edge, and universal substrate/table floor are fixed infrastructure.
- Core structural operations enforce ownership, portal, cascade, and schema invariants.

Current real consumers are workspace, inline references, tags, and the table face. Older separate
outline/notes and tag-registry models are historical.

## Matrix declarations

A plugin matrix declaration supplies a local key, title, and columns. Columns can specify SQLite
type, constraints, and optional `label` or `content` role. The runtime records `managed_by` so
plugin-required columns cannot be removed accidentally.

Plugin matrix creation does not create a table recipe. A declared face binding initializes the one
intentional matrix recipe only when none exists. Actual table subjects and explicit table choices
keep table recipes; every other host receives the implicit substrate floor. Matrix ownership and
promoted type-nodes remain data-model concerns, not plugin lifecycle shortcuts. See
[Data-Model.md](Data-Model.md).

## Shipped face slots

The current runtime has:

- `FaceTypeDefinition` with named slots and overflow behavior;
- stable-ID slot bindings;
- normalized sort/filter configuration;
- one query-free intentional `FaceConfig` recipe per configured matrix, with face type, bindings,
  and settings;
- temporary whole-component dispatch through `TemporaryLegacyFaceAdapter`.

New recipe IDs derive from replica-stable matrix identity. Applying the same face preserves the
existing recipe and normalized presentation state; explicit replacement reuses its ID. Normalized
slot bindings are authoritative; the JSON copy on `face_configs` is derived compatibility state.
Filter rows use stable UUID identity and an explicit order field.

Callable `line` and `collection` contributions stay on the main thread. They are reserved and
committed by plugin owner only after worker registration and initialization succeed. Complete-set
replacement removes omitted renderings, and plugin disposal or database reset removes the owner's
renderings before `destroy`. Hosts pass navigation and insertion requests plus nested-subject
yielding without exposing shell DOM or face-mounting callbacks.

Slot resolution is:

1. explicit stable column binding;
2. slot/column name match;
3. preferred type and position;
4. fallback.

This runtime remains supported only while Phase 13 migrates its embedded table consumer. Its
whole-component dispatch does not match the approved model below. The retired top-level Table and
Tag Browser mounts are no longer consumers.

## Forward composition model

The governing rule is:

> Hosts own chrome and recursion; faces own interiors; subjects own their data; a fixed ladder
> chooses the recipe.

### Subjects source rows

A subject is a node plus one child-sourcing mode:

- `loose` — direct owned/portal positions;
- `container` — one matrix extent;
- `view` — one stored SQL result.

The subject owns the query or extent. A forward face recipe is therefore:

```ts
type FaceRecipe = {
  faceTypeId: string
  slotBindings: Record<string, number | null>
  settings: Record<string, unknown>
}
```

SQL is not part of the recipe. Shipped view subjects own it through `block_sources`.

Normalized table sort and filter rows remain durable collection presentation state associated with
the intentional table recipe. They use stable column IDs and do not become subject SQL or untyped
recipe settings.

### Faces provide line and collection renderings

A face type may declare at most two interior renderings:

- **line** — one row participating in a parent's region;
- **collection** — a row-set arrangement such as outline, grid, kanban, calendar, gallery, or
  review stack.

A missing rendering falls back to substrate for that host presentation. A face never owns a whole
panel layout.

### Hosts own presentation structure

| Host presentation       | Requested rendering      |
| ----------------------- | ------------------------ |
| row slot                | `line`                   |
| expanded block          | `line` plus `collection` |
| panel collection region | `collection`             |
| property popover        | host scaffold only       |

The panel scaffold contains identity, fields, collection, and relations. Hosts own:

- bullets, handles, guides, block/container frames, headers, breadcrumbs, and drill actions;
- recursion and nested subject slots;
- width, density, and expanded-region height budgets;
- composed/substrate fidelity and x-ray cascade;
- insert affordances and the `view` ownership firewall.

Faces do not mount faces. They return nested subjects to a host slot.

### Recipe affinity

Hosts resolve a recipe in this order:

1. appearance override—modeled but unstored until a real consumer needs it;
2. preferred subject/matrix recipe;
3. universal substrate floor.

The preferred recipe follows the subject everywhere it appears. Fidelity is view state, not stored
inside the recipe. The shipped Phase 13 foundation stores at most one intentional matrix recipe
and uses the substrate floor when none exists. Multiple saved recipes and appearance overrides
remain deferred until a real consumer requires selection among them.

## Runtime migration

The migration has mandatory boundaries:

### Shipped Phase 11 boundary

- SQL is absent from the forward recipe and `face_configs` persistence;
- the existing view subject owns its SQL through `block_sources`;
- the focus-panel host requests the substrate `collection` registration;
- unmigrated whole-component table behavior is isolated behind
  `TemporaryLegacyFaceAdapter`.

### Phase 13

- Session 1 shipped singular recipe creation and replacement, the implicit substrate affinity,
  owner-scoped callable rendering lifecycle, and the host-service capability boundary;
- Session 2 shipped recursive composed/substrate resolution, transient root-owned x-ray state, and
  the resolved fidelity input passed to interiors;
- migrate table, tags, workspace participation, and face configuration to `line`/`collection`;
- move overflow fields into the host scaffold;
- complete live host recursion and affinity behavior;
- remove `TemporaryLegacyFaceAdapter` and its registration from `App.tsx`;
- replace the direct `TableFace` mount in `SubTableBand.tsx`;
- move workspace recipe settings and `FaceConfigPanel` onto host recipe resolution;
- migrate inline tag and property surfaces without restoring a Tag Browser application root.

Phase 14 cannot add task/review renderers until Phase 13 completes this contract.

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

The invocation context carries the surface, an optional `NodeRef`, and explicit capability
callbacks. It never exposes `EditorView`. Enumeration and matching preserve registration order,
filter by surface, and return immutable registry-owned snapshots. Subject-required commands remain
discoverable without a subject and report a concrete disabled reason. Invocation rejects
unavailable commands and preserves asynchronous failures.

Plugin command functions stay on the main thread. `PluginRegistration` omits commands and lifecycle
hooks from the structured-clone-safe worker payload. Contributions are owned by plugin ID. A
registration reserves its complete command set before worker or initialization effects, so
cross-owner duplicate IDs fail without partially installing the plugin. Replacing an owner's set
preserves its order, and generation checks prevent stale or disposed registrations from committing.
Teardown removes the owner's commands before its `destroy` hook.

The workspace plugin contributes `hila.table` to slash and launcher, followed by slash-only
`hila.attach`. The slash adapter supplies the table-name focus and type-picker capabilities, so
`/table` and `/attach` retain their typed-operation and follow-up behavior. The launcher freezes its
node subject and capabilities when it opens. `hila.table` creates the owned matrix, applies the table
face, and selects the existing Table root; without a node it stays visible with a disabled reason.
Attachment remains slash-only until an app-wide picker capability exists.

The shipped discovery service merges launcher-surface registry entries on the main thread after its
worker catalog scan without sending callable implementations through the worker boundary. Visible
labels match at the command-label weight; stable IDs and keywords match at the lower
command-keyword weight. Registration order is a deterministic structural-order tie-break. Disabled
reasons travel with results for presentation but do not affect matching or score.

Global shortcuts use self-describing registrations with stable IDs, titles, keys, and optional
contexts. The manager listens during capture so a registered global gesture wins before an editor
can stop propagation. `Mod-k` now belongs to the application launcher and no longer appears in the
ProseMirror keymap. Other editor-local handlers expose parallel handler-free descriptors. The Quick
guide combines both descriptor collections and formats normalized keys for the active platform
without copying prose.

## Inline references and tags

Inline references are plugin-provided presentation and editing over core relations:

- `@` creates or resolves non-owning `ref` associations;
- `#` creates owned aspects or applies existing type/label relationships;
- live, empty, and ghost states use cached rich-text metadata when the target is absent;
- joins provide forward/reverse lookup and lifecycle indexing;
- type discovery reads promoted type-nodes, not a tag registry matrix.

The core owns relationship and cascade semantics. Plugins own ProseMirror nodes, autocomplete,
rendering, and source-document reconciliation.

## Growth rules

- Add registration or lifecycle surface only after a real consumer requires it.
- Do not add plugin top-level application views.
- Do not expose pixel sizing or shell DOM to face implementations.
- Do not let a query result infer ownership or insertion.
- Keep stable column IDs in persisted recipes.
- Do not add multiple stored recipes or a preferred-recipe pointer until a real consumer needs
  alternate recipes for one matrix.
- Extract a richer region-services contract only when a genuine whole-interior consumer proves that
  line/collection is insufficient.
