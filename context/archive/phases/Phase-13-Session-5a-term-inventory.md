---
title: Phase 13 Session 5A — Term inventory
kind: working-artifact
state: archived
updated: 2026-09-30
---

# Phase 13 Session 5A — Term inventory

Working artifact for [Session 5A](../../phases/Phase-13/Session-5a-concept-ledger-and-vocabulary.md). It records
every named concept in the canonical topics and every code identifier, table, or column those
topics name. Stage 2 groups and marks them. Stage 3 proposes names for the user to choose. This
file is archived; [Concepts.md](../../Concepts.md) and [Decisions.md](../../Decisions.md) are the
durable record.

Document abbreviations: Arch = Architecture, Plug = Plugins, Data = Data-Model, Des = Design,
DFac = Design-Faces, Laun = Launcher, QS = Query-Spec, Sync, Virt = Virtualization, Perf =
Performance, Plan, Test = Testing. Code anchors are paths under `src/` unless stated.

## Stage 1 — Inventory

### Data model

| Term                          | Appears in                   | Code anchor                                                               | Note                                                                     |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| matrix                        | Arch, Data, Plug, QS, Laun   | `core/matrix.ts` (`matrix` table, `mx_<id>_data`)                         | Typed data table plus registry row. Also called "table" in prose.        |
| column, stable column ID      | Arch, Data, Plug, QS, Sync   | `matrix_columns`, `ColumnDefinition`                                      | Durable references use IDs.                                              |
| column role (label/content)   | Data, QS, Laun, Plan         | `core/semantic-role.ts` `SemanticColumnRole`                              | Docs also say "semantic role", which Design uses for tokens.             |
| formula column                | Data, QS, Des                | `matrix_columns.formula`, `formula_column_deps`, `table/formula.ts`       | Derived, read-only, "dry".                                               |
| row                           | all                          | `(matrix_id, row_id)`, `NodeRef` in `core/tree.ts`                        | Data record. Word also names stream rows, table rows, launcher rows.     |
| node                          | Arch, Data, Laun, QS, Plug   | `NodeRef`                                                                 | A row addressed as a forest member. Used interchangeably with row.       |
| join / edge / relation        | Data, Arch, Plug, Sync       | `joins` table, `JoinKind`, `insertJoin`                                   | Four words for one table.                                                |
| `own` edge                    | Data, Arch, Plan             | `joins.kind = 'own'`, `edge_key`                                          | Lifecycle and sibling order.                                             |
| `ref` edge                    | Data, Arch, Plug, Plan       | `joins.kind = 'ref'`, `createRefJoin`                                     | Non-owning association.                                                  |
| `portal` edge                 | Data, Arch, Virt, Plan       | `joins.kind = 'portal'`, `core/portal.ts`                                 | Additional position.                                                     |
| sibling key / edge key        | Data, Test                   | `joins.edge_key`, `core/lexorank.ts`                                      | Test cites a `rank` table that no longer exists.                         |
| ownership home / home         | Data, Arch, Laun, Virt       | `homeKeyOf`, `moveOwner`                                                  | The `own` position where a row was created.                              |
| root sentinel                 | Data                         | `ROOT_MATRIX_ID`, `ROOT_ROW_ID` in `core/ids.ts`                          | `(0, 0)`. "Root" also names the workspace root node and the stream root. |
| closure                       | Data, Arch, Sync, Virt       | `closure` table, `core/closure.ts`                                        | Derived cache.                                                           |
| scroll index / position       | Data, Arch, Virt, Des        | `scroll_index`, `global_lexkey`, `core/scroll-index.ts`                   | Preorder positions over own and portal edges.                            |
| appearance                    | Arch, Data, Plug, Laun       | `AppearanceProvenance`, `PlaceAppearance`, `ancestryOfAppearance`         | One `scroll_index` entry. Also "appearance override", "appearance key".  |
| ghost position                | Data, Arch, Virt             | `scroll_index.is_ghost`, `insertGhostMarker`, `deleteHomeGhostingPortals` | Portal position whose home was deleted.                                  |
| lazy portal                   | Data (implicit)              | `scroll_index.lazy`                                                       | Off in v1; documented only in code comments.                             |
| matrix owner / container node | Data, Arch, Plug             | `matrix.owner_matrix_id`, `owner_row_id`, `getMatrixOwner`                | Node that owns a matrix.                                                 |
| dedicated / shared container  | Data, Plan, Virt             | `isSharedMatrix`, `buildDedicatedSubtablesQuery`                          |                                                                          |
| promoted type-node            | Data, Arch, Laun, Plug, Plan | `promoted_nodes`, `promoteNode`, `tags/tag-types.ts` `TagType`            | Also "type", "type-node", "promoted type", "tag type".                   |
| aspect                        | Data, Arch, Plug, Plan       | `createHostlessAspectRow`, `shared/property-surface.ts` `AspectPreview`   | Owned row attached through `#` or `/attach`. Also "tag", "tag property". |
| inline reference              | Plug, Data, Laun             | `editor/nodeviews`, `inlineref` ProseMirror node                          | `@` reference over a `ref` join.                                         |
| extent / membership plane     | Arch, Data, Plug             | `ContainerSubject.extentMatrixId`                                         | Set of rows in one matrix.                                               |
| position plane                | Arch, Data                   | `scroll_index`                                                            | The rooted forest with order.                                            |
| child-sourcing mode           | Data, Arch, Plug             | `FaceSubject.mode` (`loose`, `container`, `view`)                         | Also "mode".                                                             |
| view block / saved view       | Data, Arch, Plug, Laun, QS   | `block_sources`, `core/block-marker.ts` `createViewBlock`, `ViewSubject`  | Marker node plus one SQL row.                                            |
| marker                        | Data, Arch, Sync, Plan       | `block_sources.marker_matrix_id/marker_row_id`, `ViewBlockRow`            | The positioned node of a view block.                                     |
| structural upgrade            | Data, Plan                   | none                                                                      | Phase 19 candidates.                                                     |

### Queries, write-back, and launcher

| Term                                              | Appears in           | Code anchor                                                                     | Note                                                                |
| ------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| query spec                                        | QS, Laun, Arch       | `sql/query-spec/types.ts` `QuerySpec`, `NormalizedQuerySpec`                    | Six dimensions.                                                     |
| kind (query)                                      | QS, Laun             | `QuerySpec.kind`                                                                | Which extent. "kind" also on `joins`, `block_sources`, renderings.  |
| scope (query)                                     | QS, Laun             | `QuerySpec.scope`                                                               | Subtree fence. "scope" also names fidelity and theme scopes.        |
| text, where, order, limit                         | QS, Laun             | `QuerySpec`                                                                     |                                                                     |
| predicate, opaque leaf                            | QS                   | `QueryPredicate`                                                                |                                                                     |
| compiler / recognizer / catalog                   | QS, Laun, Arch       | `sql/query-spec/`, `QueryRecognition`, `QueryDiscoveryCatalogInput`             |                                                                     |
| canonical SQL / plan / persistent SQL             | QS                   | `QueryPlan`, `CompiledQuerySpec`                                                |                                                                     |
| escalation tier (chips, chips + leaf, custom SQL) | QS, Laun             | `QueryRecognitionReason`                                                        |                                                                     |
| dialect                                           | QS                   | none                                                                            | The SQL shape the recognizer accepts.                               |
| chip, glyph, source chip                          | QS, Laun             | `launcher/query-authoring.ts`, `launcher/query-grammar.ts`                      |                                                                     |
| raw SQL mode / "x-ray"                            | QS, Laun             | `workspace/SavedViewStructuredAuthoring.tsx`                                    | QS calls raw SQL editing "x-ray"; Design uses x-ray for fidelity.   |
| write-back, hydrated cell, dry cell               | Arch, QS             | `sql/recognize-updatable.ts`                                                    | "dry" = read-only computed value.                                   |
| `view` firewall                                   | QS, Plug, Virt       | `FocusCollectionHost` insertion policy                                          | Query results never own or insert.                                  |
| rename healing                                    | QS                   | `sql/query-spec/durable.ts`                                                     |                                                                     |
| launcher, Quick, Deep, tempo                      | Laun, Arch, Des      | `launcher/QuickLauncher.tsx`, `launcher/DeepPreview.tsx`                        |                                                                     |
| family, sigil, filter token                       | Laun, QS             | `DiscoveryFamily`, `LauncherFamilyFilter`, `launcherFamilyForToken`             |                                                                     |
| lens                                              | Laun, QS, Arch       | none                                                                            | "browse all lenses", "administrative lenses", "heterogeneous lens". |
| discovery                                         | Arch, Laun, Plug     | `core/discovery.ts` `queryDiscoveryCatalog`, `discovery/workspace-discovery.ts` |                                                                     |
| ranking signals                                   | Laun, Arch           | `discovery/ranking.ts`, `DiscoveryRankingSignals`                               |                                                                     |
| session memory, Jump back, Recents                | Laun, Arch           | `session/session-memory.ts` `SessionMemoryStore`                                |                                                                     |
| provenance                                        | Arch, Laun, Data     | `AppearanceProvenance`, `launcher/invocation.ts` `LauncherInvocation`           | Node or appearance captured when a gesture began.                   |
| place                                             | Arch, Laun, QS, Plan | `core/place-navigation.ts` `PlaceNavigationTarget`, `resolvePlaceNavigation`    | Rooted position a focus panel can show.                             |
| gesture                                           | Arch, Laun, QS, Plan | `workspace/row-gestures.tsx`, `editor/structural-commands.ts`                   | Launcher and slash surfaces; also row menus and chip edits.         |
| save-as-node / save-as-view                       | Laun, QS             | `createViewBlockAtAppearance`, `workspace/pending-view-name-focus.ts`           |                                                                     |
| insert-ref exit                                   | Laun, Plan           | `launcher/QuickLauncher.tsx`                                                    |                                                                     |
| value entry / relative date token                 | Laun, QS             | `launcher/query-authoring.ts`                                                   |                                                                     |
| distinct-values introspection                     | Laun, QS             | `launcher/distinct-values.ts`, `workspace/QueryBand.tsx`                        | "the `QueryBand` pattern".                                          |

### Presentation configuration

| Term                          | Appears in                  | Code anchor                                                                    | Note                                                                     |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| face                          | Arch, Plug, Des, DFac, Plan | many                                                                           | Names a face type, a recipe, a rendering component, and a typeface.      |
| face type                     | Plug, Arch                  | `core/face-types.ts` `FaceTypeDefinition`, `core/face-registry.ts`             | `hila.table`, `hila.workspace`.                                          |
| slot (column)                 | Plug, DFac                  | `SlotDeclaration`, `face_slot_bindings`, `core/slot-binding.ts`                | Named column position in a face type.                                    |
| slot binding                  | Plug, Sync                  | `FaceRecipe.slotBindings`, `ResolvedSlotBinding`, `face_configs.slot_bindings` | Slot name to column ID. JSON copy is derived.                            |
| recipe / face config          | Arch, Plug, Plan, DFac      | `FaceRecipe`, `FaceConfig`, `face_configs`, `core/face-config.ts`              | One stored rendering choice per matrix.                                  |
| intentional recipe            | Arch, Plug, Plan, DFac      | `FaceAffinity.source = 'intentional'`                                          | A stored recipe as opposed to the fallback.                              |
| sort and filter state         | Plug, Sync, Arch            | `face_sort_config`, `face_filter_configs`, `FaceConfig.sort/filters`           | "normalized presentation state".                                         |
| face binding (plugin)         | Plug                        | `core/plugin-types.ts` `FaceBinding`                                           | Plugin-declared default recipe for its matrix.                           |
| face configuration panel      | Plug, Plan                  | `core/FaceConfigPanel.tsx`                                                     | Admin surface. Session 8 scope.                                          |
| settings (recipe)             | Plug, DFac                  | `FaceRecipe.settings`, `navigationOutline`, `tableTreatment`                   | Component-variant carriers.                                              |
| workspace recipe              | Plug, Plan                  | `App.tsx` `workspaceFaceConfig`, `hila.workspace`                              | Carries `navigationOutline`; registers no rendering. Session 5B decides. |
| component variant / treatment | Des, DFac                   | `design/tokens.ts` `ComponentVariantRegistry`, `componentVariantRegistry`      | `navigationOutline`, `tableTreatment`.                                   |
| Guides                        | Des, DFac                   | `NavigationOutlineVariant = 'guides'`                                          | Proper name.                                                             |
| table treatments              | DFac, Des                   | `TableTreatmentVariant`, `getTableTreatment`                                   | `thin-line`, `corner-notch`, `cell-dots`.                                |
| decoration adapter            | DFac, Des                   | `design/outline/`, `design/table/data.ts` `computeTableDecorations`            | Paint data only.                                                         |

### Host runtime

| Term                                  | Appears in             | Code anchor                                                                      | Note                                                                |
| ------------------------------------- | ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| subject                               | Arch, Plug, Data       | `FaceSubject`, `LooseSubject`, `ContainerSubject`, `ViewSubject`                 | Node plus child-sourcing mode. Also command subject.                |
| host                                  | Arch, Plug, Des, DFac  | `workspace/FocusCollectionHost.tsx`, `FaceHostSlot.host`                         | Also the destination parent in `row-gestures.tsx`, and a machine.   |
| host slot                             | Plug, Arch, Des        | `core/face-runtime.tsx` `FaceHostSlot`                                           | Requests one rendering with a fallback.                             |
| rendering / interior                  | Arch, Plug             | `FaceRenderRegistration`, `FaceRenderingContribution`, `registerFaceRenderings`  | Registered component for `line` or `collection`.                    |
| rendering kind (`line`, `collection`) | Arch, Plug             | `FaceRenderingKind`                                                              |                                                                     |
| line rendering                        | Arch, Plug, Des        | `table/TableLine.tsx`, `shared/PropertyLine.tsx`                                 | One row's structured fields.                                        |
| collection rendering                  | Arch, Plug             | `table/TableFace.tsx`                                                            | Row-set arrangement.                                                |
| host services                         | Plug, Arch             | `FaceHostServices`, `FaceInsertionRequest`                                       | Navigation, insertion, yielding.                                    |
| yield / nested subject                | Arch, Plug, Des        | `FaceHostServices.yieldSubject`, `renderYieldedSubject`                          |                                                                     |
| affinity / resolution ladder          | Arch, Plug, Plan       | `core/face-affinity.ts` `FaceAffinity`, `resolveFocusCollectionAffinity`         | Intentional recipe or substrate.                                    |
| substrate floor / fallback            | Arch, Plug, Plan, DFac | `SUBSTRATE_FACE_AFFINITY`, `FaceHostSlot.substrate`                              | Host rendering when no recipe or rendering exists.                  |
| substrate region                      | Arch, DFac             | `workspace/SubstrateRegion.tsx`                                                  | Loose-subject collection: aspects grouped by schema, plus gestures. |
| substrate collection                  | Arch, Plug             | `SubstrateRegion`, `FocusCollectionHost` fallback branch                         | Bounded fallback collection for containers and views.               |
| panel scaffold / regions              | Arch, Plug             | `workspace/FocusPanel.tsx`                                                       | Identity, fields, collection, relations.                            |
| property adapter / property row       | Arch, Plug, Des        | `shared/PropertyRow.tsx`, `shared/FieldEditor.tsx`, `shared/property-surface.ts` | Shared field rendering for one aspect row.                          |
| property popover                      | Arch, Plug             | `workspace/FocusPanel.tsx`                                                       | Host scaffold, not a rendering.                                     |
| cross-matrix field strip              | Session 5B only        | `workspace/NavigationPanel.tsx` `OutlineCellStrip`                               | Undocumented in canonical topics.                                   |
| expanded block (host presentation)    | Plug                   | none                                                                             | Session 5B: describes the focus panel, not the stream fold.         |
| host density                          | Arch, Plug, Des        | `FaceRenderingProps.density`, `resolveDensity`                                   |                                                                     |
| fidelity, composed, substrate         | Arch, Des, DFac, Plug  | `RenderingFidelity`, `FidelityInput`, `resolveFidelity`, `useFaceFidelity`       |                                                                     |
| x-ray (fidelity)                      | Arch, Des, DFac, Plan  | `FaceFidelityRoot`, `data-x-ray`                                                 | Transient inspection state.                                         |
| fidelity scope                        | Des, Arch              | `FaceFidelityRoot`, `FaceHostSlot`                                               |                                                                     |
| compatibility adapter (retired)       | Plug, Plan, Arch       | none (`TemporaryLegacyFaceAdapter` removed)                                      | Kept in "Also called" for grep.                                     |

### Design axes and tokens

| Term                                | Appears in                  | Code anchor                                                                 | Note                                                        |
| ----------------------------------- | --------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| fundamental / semantic token        | Des                         | `design/tokens.css`, `fundamentalTokenNames`, `semanticTokenNames`          | "semantic role" collides with column role.                  |
| polarity                            | Des, DFac, Arch             | `Polarity`, `resolvePolarity`, `data-theme`                                 | Attribute is named `data-theme`.                            |
| visual theme (Ghost, Null, Wipeout) | Des, DFac, Arch, Laun, Plan | `VisualTheme`, `data-visual-theme`, `design/startup-theme.ts`               | "Ghost" also names positions, references, a button variant. |
| startup theme input                 | Des, Arch, Plan             | `VITE_HILA_VISUAL_THEME`, `resolveStartupVisualTheme`                       |                                                             |
| density                             | Des, DFac, Arch             | `Density` (`narrow`, `wide`)                                                | "narrow" also describes the single-panel shell.             |
| presentation adapter                | Des, DFac, Laun             | `launcher/QuickLauncher.tsx` presentation boundary                          | Theme-selected geometry seam.                               |
| theme scope                         | Des                         | `resolveThemeScope`                                                         |                                                             |
| design primitives                   | Des                         | `design/CornerNotchBox.tsx`, `design/overlay/`, `design/Grid.tsx`           | Component inventory.                                        |
| Table specimen                      | DFac, Des                   | `design/table/Table.tsx`, `FlatTableRow`, `TableRowProps`, `TableHeaderRow` | Worker-free Storybook table. Not the live collection.       |
| Outline specimen                    | DFac, Des                   | `design/outline/`, `FlatRow`, `RowDecoration`                               | Historical renderers.                                       |
| retired-surface references          | Des, DFac, Laun             | `design/retired-surfaces/`                                                  | Storybook fixtures for former Table and Tags tabs.          |

### Shell, stream, and virtualization

| Term                                    | Appears in                        | Code anchor                                                                                                            | Note                                         |
| --------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| shell                                   | Arch, Des, Laun, Plan             | `workspace/WorkspaceShell.tsx`, `App.tsx`                                                                              | Fixed infrastructure.                        |
| stream / stream root                    | Arch, Plan, Laun, Des             | `workspace/StreamView.tsx`, `workspace/stream-controller.ts` `StreamController`                                        | The retained panel sequence.                 |
| navigation panel / root panel           | Des, Arch                         | `workspace/NavigationPanel.tsx`                                                                                        | Virtualized outline of the workspace root.   |
| focus panel                             | Arch, Des, Plug, Laun             | `workspace/FocusPanel.tsx`, `StreamPanel`                                                                              | One place with panel regions.                |
| retained panels                         | Arch, Des, Plan                   | `StreamController`                                                                                                     | "four-panel window".                         |
| shell presentation                      | Arch, Des, DFac                   | `WorkspaceShellPresentation` (`bounded-rail`, `single-panel`), `data-shell-presentation`, `NARROW_WORKSPACE_MAX_WIDTH` | 719/720 boundary.                            |
| path header / root indicator            | Des, Laun                         | `workspace/WorkspacePathHeader.tsx`                                                                                    |                                              |
| stream row / outline row                | Arch, Des, Virt, Perf, Session 5B | `.outline-row`, `WorkspaceRowData`, `usePagedWorkspaceData.ts`                                                         | Position-keyed row with ProseMirror editors. |
| source row / sticky row                 | Des, Arch, Plan                   | `workspace/ProductionStickyNavigation.tsx`, `workspace/production-sticky.ts`                                           | Session 7 seam.                              |
| sticky navigation, drill dock, push-off | Des, Virt                         | `design/workspace/StickyNavigation.tsx`                                                                                |                                              |
| flattened sequence / segment            | Virt, Arch                        | `workspace/window-flatten.ts` `Segment`, `computeSegments`, `gather-flatten.ts`                                        |                                              |
| folded block, fold                      | Virt, Arch, Perf, Data            | `is_block_row`, `foldedKey`, `Block`, `viewBlock`, `containerBlock`                                                    | Inline collection results in the stream.     |
| page / window                           | Virt, Perf, Laun                  | `ROWS_PER_WINDOW`, `THRESHOLD_DISTANCE`, `SCROLL_VIRTUALIZER_MAX_RETAINED_WINDOWS`                                     | Two words for one unit.                      |
| residency, latch                        | Virt, Perf                        | `virtualizer/ScrollVirtualizer.tsx`, `virtualizer/geometry.ts`                                                         |                                              |
| data manager                            | Virt                              | `workspace/usePagedWorkspaceData.ts`                                                                                   |                                              |
| editor churn counters                   | Perf, Test                        | `debug/debugState.ts`                                                                                                  |                                              |
| query band / sub-table band             | Des, DFac                         | `workspace/QueryBand.tsx`, `workspace/SubTableBand.tsx`                                                                | Legacy "band" names survive in code.         |
| system edge / dev tools                 | Arch, Plan, Laun, Test            | `admin/MatrixBrowser.tsx`, `core/FaceConfigPanel.tsx`                                                                  | Above-database surfaces.                     |
| matrix browser                          | Arch, Test, Plan                  | `admin/MatrixBrowser.tsx`                                                                                              |                                              |

### Plugins and commands

| Term                             | Appears in       | Code anchor                                                           | Note                                    |
| -------------------------------- | ---------------- | --------------------------------------------------------------------- | --------------------------------------- |
| plugin definition / registration | Plug, Arch       | `PluginDefinition`, `PluginRegistration`, `core/plugin.ts`            |                                         |
| matrix declaration               | Plug             | `MatrixSpec`, `matrix_columns.managed_by`                             |                                         |
| named queries and mutations      | Plug, Arch       | `PluginDefinition.namedQueries`                                       | Declaration-only.                       |
| lifecycle hooks                  | Plug             | `PluginDefinition.init/destroy`                                       |                                         |
| owner-scoped contributions       | Plug             | `createFaceRenderingRegistry`, `createCommandRegistry`                | Reserve, commit, replace, teardown.     |
| command, descriptor              | Plug, Laun, Arch | `command-registry.ts` `CommandDescriptor`, `CommandInvocationContext` |                                         |
| command surface                  | Plug, Laun       | `CommandSurface` (`slash`, `launcher`)                                | "surface" is also generic.              |
| command subject                  | Plug, Laun       | `CommandDescriptor.subject`, `CommandInvocationContext`               | A `NodeRef`, not a face subject.        |
| `hila.table`, `hila.attach`      | Plug, Laun       | `editor/structural-commands.ts`                                       |                                         |
| global shortcut registry         | Plug, Laun       | `launcherInteractionShortcutDescriptors`                              |                                         |
| workspace plugin                 | Plug, Arch       | `workspace/workspace-plugin.ts` `workspacePlugin`, `hila.workspace`   | Also the workspace matrix and shell.    |
| table plugin                     | Plug             | `table/table-plugin.ts` `tablePlugin`                                 |                                         |
| tags                             | Plug, Data, Plan | `tags/`                                                               | Inline `#` over aspects and type-nodes. |

### Replication, schema, and policy

| Term                              | Appears in             | Code anchor                                                             | Note |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------------- | ---- |
| durability class                  | Sync, Data, Arch, Plan | `core/durability-policy.ts` `DurabilityClass`, `CORE_DURABILITY_POLICY` |      |
| schema-policy audit               | Sync, Data             | `core/durability-policy-audit.ts`                                       |      |
| changelog, changeset, conflict    | Sync, Arch             | `_sync_changelog`, `_sync_conflicts`, `core/sync-types.ts` `Changeset`  |      |
| device identity                   | Sync, Arch             | `_sync_state`, `getOrCreateDeviceId`                                    |      |
| apply suppression                 | Sync                   | `_sync_applying`                                                        |      |
| schema version / migration runner | Sync, Arch, Plan       | `core/schema-migrations.ts`, `user_version`                             |      |
| durable dogfooding gate           | Plan, Sync, Arch       | none                                                                    |      |
| sync provider                     | Sync                   | none (`SyncProvider` is a design sketch)                                |      |
| performance guards                | Perf, Virt             | `perf/`                                                                 |      |
| growth rules                      | Plug                   | none                                                                    |      |

### Schema names cited by documents

Tables: `matrix`, `matrix_columns`, `joins`, `closure`, `scroll_index`, `promoted_nodes`,
`block_sources`, `face_configs`, `face_slot_bindings`, `face_sort_config`, `face_filter_configs`,
`formula_column_deps`, `plugins`, `_sync_state`, `_sync_changelog`, `_sync_conflicts`,
`_sync_applying`, dynamic `mx_<id>_data`. All exist in `core/matrix.ts`.

Columns: `edge_key`, `kind`, `global_lexkey`, `is_ghost`, `lazy`, `depth`, `owner_matrix_id`,
`owner_row_id`, `source_plugin_id`, `managed_by`, `formula`, `slot_bindings`, `settings`,
`face_type_id`, `marker_matrix_id`, `marker_row_id`, `sql`, `user_version`.

Documents cite one table that does not exist: Testing.md names a `rank` table with a
`key BLOB PRIMARY KEY`. Sibling keys live on `joins.edge_key`.

Code has three tables absent from documents: `formula_column_deps` (derived), `plugins`
(replicated), and the `mx_<id>_data` pattern (Data-Model names it only by description).

## Stage 2 — Clusters and collisions

### Same thing, several names

| One concept                            | Names in use                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| stored per-matrix rendering choice     | recipe, face recipe, face config, face configuration, intentional recipe, preferred recipe, "applies the table face" |
| registered interior component          | face, rendering, interior, renderer, callable registration, callable rendering, `TableFace`                          |
| `scroll_index` entry                   | appearance, position, position key, preorder position, portal appearance                                             |
| `joins` row                            | join, edge, relation, relationship                                                                                   |
| own position where a row was created   | home, ownership home, creation site, owner                                                                           |
| node that owns a matrix                | container, container node, matrix owner, type container, dedicated container                                         |
| promoted node                          | type, type-node, promoted node, promoted type, tag type, `TagType`                                                   |
| owned row attached to a node           | aspect, owned aspect, tag, tag aspect, tag property, attachment                                                      |
| view block                             | view, saved view, view node, view block, view subject, saved query, `≔`                                              |
| virtualizer unit of 100 rows           | page, window                                                                                                         |
| host fallback rendering                | substrate floor, universal substrate floor, implicit floor, substrate fallback, substrate collection, rung 3         |
| recipe resolution result               | affinity, recipe affinity, resolution ladder, resolution order                                                       |
| structured-field rendering for one row | line, line interior, line rendering, property adapter, `PropertyLine`, `TableLine`                                   |
| the workspace root outline             | navigation panel, root panel, outline, loose outline, source outline, stream                                         |
| one virtualized row in that outline    | row, stream row, outline row, workspace row, source row, `.outline-row`                                              |
| shell width layout                     | shell presentation, responsive presentation, single-panel mode, narrow mode, bounded rail                            |
| component variant                      | component variant, treatment, variant, outline treatment, table treatment                                            |
| column role                            | role, semantic role, column role, label/content role                                                                 |
| raw SQL editing of a saved view        | raw SQL mode, custom mode, x-ray, "view SQL ▸"                                                                       |
| administrative surfaces                | system edge, dev tools, Dev Tools, development system edge, admin                                                    |

### One word, several things

| Word         | Meanings                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| face         | (1) face type; (2) stored recipe; (3) registered rendering component; (4) host slot ("face slot"); (5) typeface in Design ("body face", "data faces"); (6) the Design-Faces document, which is about component variants |
| view         | (1) `view` child-sourcing mode and saved view; (2) "view layer" meaning the UI; (3) retired Table and Tags "views"; (4) "product views" in Plan decision 14; (5) ProseMirror `EditorView`                               |
| substrate    | (1) fidelity value; (2) fallback affinity when no recipe exists; (3) `SubstrateRegion` component; (4) "substrate collection" fallback rendering; (5) "global-search substrate" meaning infrastructure                   |
| ghost        | (1) portal position whose home was deleted; (2) inline reference whose target is absent; (3) Ghost visual theme; (4) `Button variant="ghost"`                                                                           |
| slot         | (1) named column position in a face type (`SlotDeclaration`, `face_slot_bindings`); (2) host slot where a rendering is requested (`FaceHostSlot`, "row slot")                                                           |
| host         | (1) shell component that requests renderings; (2) destination parent for portal and move-owner gestures in `row-gestures.tsx`; (3) the reference machine in Performance                                                 |
| subject      | (1) node plus child-sourcing mode (`FaceSubject`); (2) command subject, a captured `NodeRef`; (3) "launcher subject label"                                                                                              |
| block        | (1) folded view or container results in the stream; (2) "expanded block" host presentation; (3) block marker; (4) "block/container frames"; (5) Wipeout "block cursor"                                                  |
| kind         | (1) `joins.kind`; (2) `QuerySpec.kind`; (3) `FaceRenderingKind`; (4) `block_sources.kind`; (5) ledger field "Kind"                                                                                                      |
| mode         | (1) child-sourcing mode; (2) raw SQL / custom mode; (3) single-panel mode; (4) launcher "mode state"                                                                                                                    |
| presentation | (1) theme presentation adapter; (2) sort and filter presentation state; (3) host presentation (row slot, expanded block, panel region); (4) shell presentation axis                                                     |
| appearance   | (1) a `scroll_index` entry; (2) "appearance override" recipe rung, which reads as visual appearance                                                                                                                     |
| root         | (1) `(0, 0)` sentinel; (2) workspace root node and root panel; (3) stream root, the single shell mount; (4) "second product root", a top-level surface                                                                  |
| row          | (1) matrix row; (2) stream row; (3) table row; (4) launcher result row; (5) sticky row; (6) property row                                                                                                                |
| outline      | (1) the virtualized workspace tree; (2) `navigationOutline` component variant; (3) legacy outline face; (4) `Design/Outline` specimen                                                                                   |
| collection   | (1) `collection` rendering kind; (2) panel collection region; (3) `FocusCollectionHost`; (4) the row set itself                                                                                                         |
| region       | (1) panel scaffold regions; (2) `SubstrateRegion`; (3) "structured-field region"; (4) "expanded region"                                                                                                                 |
| window       | (1) virtualizer page; (2) retained page set; (3) "four-panel window"; (4) browser window                                                                                                                                |
| narrow       | (1) `Density = 'narrow'`; (2) the 719px single-panel shell                                                                                                                                                              |
| theme        | (1) visual theme; (2) `data-theme` attribute, which selects polarity                                                                                                                                                    |
| role         | (1) column role label/content; (2) semantic token role                                                                                                                                                                  |
| scope        | (1) `QuerySpec.scope`; (2) fidelity scope; (3) theme scope                                                                                                                                                              |
| surface      | (1) `CommandSurface` slash or launcher; (2) any UI area                                                                                                                                                                 |
| container    | (1) node that owns a matrix; (2) `container` child-sourcing mode; (3) launcher `[` family; (4) `GridContainer` and CSS containers                                                                                       |
| type         | (1) promoted type-node; (2) face type; (3) SQLite column type; (4) display type; (5) TypeScript type                                                                                                                    |
| table        | (1) matrix; (2) `hila.table` face type and its renderings; (3) SQL table; (4) `Design/Table` specimen                                                                                                                   |
| x-ray        | (1) fidelity inspection state; (2) raw SQL editing of a saved view                                                                                                                                                      |
| field        | One column value of one row. The focus panel says field, `PropertyRow` says field and cell, tables and write-back say cell, and tags say property                                                                       |
| gesture      | (1) `/` and `⌘K` transient surfaces; (2) row gesture menu; (3) chip edits; (4) any user action                                                                                                                          |
| adapter      | presentation adapter, decoration adapter, property adapter, slash adapter, launcher adapter, compatibility adapter                                                                                                      |
| workspace    | (1) the workspace matrix; (2) the shell and its host; (3) retired Workspace tab; (4) `design/workspace/` components; (5) workspace recipe                                                                               |
| stream       | (1) the retained panel sequence; (2) "stream row" in the outline                                                                                                                                                        |
| binding      | (1) slot binding, slot to column; (2) `FaceBinding`, a plugin's default recipe                                                                                                                                          |
| config       | (1) `FaceConfig`, a stored recipe; (2) `ComponentVariantConfig`; (3) `FaceConfigPanel`                                                                                                                                  |
| line         | (1) `line` rendering kind; (2) "thin header line" treatment; (3) `--color-line-*` tokens                                                                                                                                |

### Metaphoric or compressed names

Meaning is not recoverable from the word alone:

- substrate floor, floor, ladder, rung
- affinity
- scaffold, chrome, interior, furniture
- x-ray (both uses)
- ghost (position and reference)
- dry and hydrated cells
- lens
- system edge
- tempo
- sigil
- `view` firewall
- fold, folded
- residency, latch, push-off, drill dock
- meshed rows (Session 5B)
- child-sourcing mode, loose
- intentional recipe
- yield
- aspect
- portal
- provenance
- promoted node
- place and gesture as a pair
- band (code only)

Proper names kept as given: Ghost, Null, Wipeout, Guides, Quick, Deep, Lexorank.

### Document names that collide with code or SQL identifiers

| Document usage                    | Code or SQL identifier                                       | Collision                                                         |
| --------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| "table" meaning matrix            | `hila.table`, `TableFace`, `TableLine`, SQL tables           | Prose "table" is ambiguous in every sentence about the table face |
| "face" meaning rendering          | `face_configs`, `FaceTypeDefinition`, `TableFace`            | Same word for recipe row, type, and component                     |
| "slot" meaning host slot          | `face_slot_bindings`, `SlotDeclaration`                      | SQL slot is a column position                                     |
| "binding" meaning slot binding    | `FaceBinding`                                                | Code binding is a default recipe                                  |
| "recipe"                          | `FaceConfig`, `face_configs`                                 | Concept has no matching stored name                               |
| "polarity"                        | `data-theme`                                                 | Attribute says theme                                              |
| "page"                            | `ROWS_PER_WINDOW`, `SCROLL_VIRTUALIZER_MAX_RETAINED_WINDOWS` | Code says window                                                  |
| "sibling key"                     | Testing.md `rank` table                                      | Table does not exist; keys are `joins.edge_key`                   |
| "host" meaning runtime host       | `row-gestures.tsx` `host` prop                               | Code host is a gesture destination                                |
| "subject" meaning face subject    | `CommandDescriptor.subject`                                  | Code subject is a `NodeRef` requirement                           |
| "kind" meaning rendering kind     | `joins.kind`, `QuerySpec.kind`, `block_sources.kind`         | Four schemas share the word                                       |
| "query region", "saved view band" | `QueryBand`, `SubTableBand`                                  | Code keeps the retired "band" vocabulary                          |
| "stream row", "workspace row"     | `.outline-row`, `outline-queries.ts`, `OutlineCellStrip`     | Code says outline                                                 |
| "fallback rendering" (proposed)   | `SUBSTRATE_FACE_AFFINITY`, `FaceHostSlot.substrate`          | Code says substrate                                               |
| "appearance"                      | `AppearanceProvenance`, `PlaceAppearance`                    | Code agrees; doc "appearance override" reads differently          |
| "x-ray" in Query-Spec             | `data-x-ray`                                                 | Attribute is fidelity                                             |
| "narrow mode" in Design           | `Density = 'narrow'`, `single-panel`                         | Code narrow is density                                            |
| "collection host"                 | `FocusCollectionHost`, `getTableCollectionMatrixId`          | Agrees                                                            |

### Dependency order

Atomic concepts first. Each level uses only concepts from earlier levels.

1. **Storage atoms:** matrix, column, column role, formula column, row, `own` / `ref` / `portal`
   edge, sibling key, root sentinel, durability class.
2. **Forest and identity:** node, ownership home, closure, position (scroll index entry),
   ghost position, container node, dedicated and shared container, promoted type-node, aspect,
   inline reference, marker node and view block, extent, position plane and membership plane.
3. **Addressing:** child-sourcing mode, subject, place, provenance, ancestry resolution order.
4. **Query:** query spec and its six dimensions, catalog, compiler, recognizer, canonical SQL,
   opaque leaf, escalation tier, write-back (writable and read-only cells), rename healing, the
   no-ownership rule for query results.
5. **Presentation configuration:** face type, column slot, slot binding, recipe, sort and filter
   state, plugin default recipe, recipe settings, component variant, fundamental and semantic
   tokens, polarity, visual theme, density, fidelity, x-ray.
6. **Host runtime:** rendering registration (line, collection), recipe resolution, fallback
   rendering, host, host slot, host services, yielding, panel regions, focus panel, property
   row and popover, cross-matrix field strip, stream row, folded block, flattened sequence,
   page and residency, sticky navigation, shell presentation, path header, stream and retained
   panels, navigation panel.
7. **Gestures and discovery:** command, command surface, command subject, slash, launcher Quick
   and Deep, family filter, chip, value entry, save-as-view, insert-ref, discovery, ranking,
   session memory.
8. **Policy:** plugin lifecycle and owner-scoped contributions, replication and migration
   policy, durable dogfooding gate, performance guards, growth rules, admin surfaces.

Concepts that must be defined before others: matrix before row; row and `own` before node and
home; `own` and `portal` before position; position before place and provenance; node and
child-sourcing mode before subject; face type before column slot and recipe; recipe and rendering
before recipe resolution; recipe resolution before host slot; host slot before every host.

## Stage 3 — Naming proposals

Rename only where a word names two things or one thing has two names. Code identifiers are not
renamed in this session. Numbers match the first draft so earlier comments still line up. Entries
marked **Open** carry a question from the user's first review. Entry 55 is new.

### Presentation configuration

**1. Face (the registered presentation contribution).** A plugin contributes a named way to
present rows, such as `hila.table`. The contribution has two halves that share one id: a
declaration (display name, the column slots it wants, what to do with extra columns) and up to two
callable components, a line rendering and a collection rendering. `hila.workspace` declares slots
but registers no components. `hila.table` declares no slots but registers both components.

- Current names: face, face type, `FaceTypeDefinition`, `faceTypeId`.
- First draft: "face type", never bare "face".
- **Open.** Once recipes and renderings stop borrowing "face", "face type" is the only thing
  qualified by "face". Revised proposal: call the whole contribution a **face**. The declaration
  is "the face's declaration" and the components are "the face's renderings". This drops "type",
  which also frees "type" for type nodes. Alternative umbrella words: **layout**, **presentation**.

**2. Face config (the stored per-matrix choice).** Each matrix stores at most one row that says
which face presents it. The row holds the face id, which column fills each column slot, a small
settings object such as the table treatment, and for tables the durable sort and filter rows. It is
replicated user data. When no row exists, hosts use the fallback rendering.

- Current names: recipe, face recipe, face config, intentional recipe, preferred recipe,
  `FaceRecipe`, `FaceConfig`, `face_configs`.
- First draft: "recipe".
- **Open.** "Recipe" suggests a reusable formula, but this is one config owned by one matrix.
  Revised proposal: **face config**, matching `FaceConfig` and `face_configs`. Alternatives:
  **face choice**, **matrix face**. "Stored face config" contrasts it with the fallback.

**3. Rendering (the registered component).** A rendering is a Solid component a face registers
for one rendering kind. The host passes it the subject, the face config, density, fidelity, and a
small set of services. It draws only the inside of its area. It never mounts another rendering.

- Current names: face, rendering, interior, renderer, callable registration, `TableFace`,
  `TableLine`.
- Proposed: **rendering**, qualified as **line rendering** or **collection rendering**.

**4. Host slot (where a host asks for a rendering).** A host slot is the one place in shell code
that looks up a rendering and mounts it. It resolves fidelity, mounts the registered rendering if
the face config names one, and otherwise mounts the fallback the host passed in. It also catches
yielded subjects. Today two hosts use it: the focus-panel collection and each aspect line in the
focus panel.

- Current names: slot, host slot, row slot, face slot, `FaceHostSlot`.
- Proposed: **host slot**. See entry 5 for the clash.

**5. Column slot (a named column position in a face).** A face declares named positions that
columns fill. The workspace face declares `label` and `content`. A face config binds each position
to a stable column id. When no binding exists, resolution tries a name match, then preferred type
and order, then a fallback column.

- Current names: slot, `SlotDeclaration`, `face_slot_bindings`, slot binding.
- First draft: "column slot".
- **Open.** Column slot and host slot are unrelated. One is a data mapping inside a face config.
  The other is a UI mount point. Sharing "slot" suggests a link that does not exist. Revised
  proposal: keep **slot** and **slot binding** for the column mapping, since the SQL and code
  already say slot. Rename the UI mount point instead, to **rendering mount** or
  **host mount**.

**6. Default face config declaration.** A plugin can declare the face config its own matrix should
start with. Registration applies it only when that matrix has no face config yet. It never
overwrites a user choice.

- Current names: face binding, `FaceBinding`, `faceBindings`.
- Proposed: **default face config** (follows entry 2). "Binding" then means only slot binding.

**7. Face resolution (choosing config or fallback).** Before a host slot mounts anything, the
host decides which face config applies. The designed order is a position override (deferred), then
the matrix's face config, then the fallback rendering. Today only the last two exist. For a
container subject the config comes from the owned matrix, not the node's own matrix.

- Current names: affinity, recipe affinity, resolution ladder, rung, `FaceAffinity`,
  `resolveFocusCollectionAffinity`.
- Proposed: **face resolution** (follows entry 2). "Ladder" and "rung" become "resolution order"
  and "step".

**8. Fallback rendering.** Every host slot must supply a fallback. The type makes that prop
required. The slot shows the fallback when no face config exists or when the face registers no
component for that kind. Today the fallback line is `PropertyLine` and the fallback collection is
the host's bounded field list.

- Current names: substrate floor, universal substrate floor, implicit floor, substrate fallback,
  substrate collection, rung 3, `SUBSTRATE_FACE_AFFINITY`, `FaceHostSlot.substrate`.
- Proposed: **fallback rendering**.
- **Open, answered.** "A fallback always exists at every host slot" is a real invariant, enforced
  by the required prop. It becomes a ledger invariant regardless of naming. The shared word came
  from a second fact: the fallback always draws at substrate fidelity because it takes no fidelity
  input. The reverse does not hold. X-ray does not swap a registered rendering for the fallback.
  It passes `substrate` to the registered rendering, which must draw its own substrate form. So
  "fallback" and "substrate" are two concepts. The ledger can record "the fallback rendering always
  draws at substrate fidelity" as a separate invariant.

**9. Substrate (a fidelity value).** Fidelity has two values. Composed may hide schema details
behind a polished look. Substrate shows every field, role, and relationship explicitly and uses no
elevation to imply hidden structure.

- Proposed: keep **substrate**, for fidelity only, once entries 8 and 10 take the other meanings.

**10. Aspect region.** Inside a focus panel for a loose subject, this area lists the node's owned
aspects. It groups consecutive same-schema aspects under one shared header and exposes the
portal, move-owner, and delete gestures.

- Current names: substrate region, `SubstrateRegion`.
- Proposed: **aspect region**.

**11. Orphaned position.** When a row's home is deleted, its portal positions survive as marked
placeholders. They show that something was here, but they cannot be focused or opened.

- Current names: ghost, ghost portal, ghost position, `is_ghost`.
- Proposed: **orphaned position**. "Ghost" then names only the visual theme.

**12. Dangling reference.** An inline `@` reference whose target row no longer exists. It keeps
cached display text so the prose still reads correctly.

- Current names: ghost state, ghost reference.
- Proposed: **dangling reference**.

### Forest and addressing

**13. Position.** One entry in the scroll index: one place in the rooted tree where a row
appears. A row has one home position and zero or more portal positions. Rendering keys use
positions. Editing uses row identity.

- Current names: appearance, position, position key, portal appearance, `global_lexkey`,
  `AppearanceProvenance`.
- Proposed: **position**, qualified as **home position** or **portal position**.

**14. Per-position face override (deferred).** A designed step before the matrix's face config: a
single position could present its row with a different face. Nothing stores it yet.

- Current names: appearance override, appearance-level recipe.
- First draft: "position override".
- **Open.** That reads as overriding the position. Revised proposal: **position face override**
  or **per-position face config**.

**15. Subject.** A subject is the thing a host shows the children of. It is a node plus the rule
for where that node's children come from. There are three rules:

- **Loose:** the children are the node's own children in the tree: its owned rows and portals. A
  plain workspace bullet in a focus panel is a loose subject. Its aspects appear in the aspect
  region.
- **Container:** the node owns a whole matrix, and the children are every row in that matrix,
  wherever each row lives in the tree. An owned table node is a container subject.
- **View:** the node is a saved-query marker, and the children are that query's results. The
  results never become owned by the node.

The host picks a subject when it opens a focus panel, and hands it to renderings. In code this is
`FaceSubject`, carrying the node's matrix and row plus either the owned matrix id or the SQL. A
rendering can yield a nested subject back to the host to show another node's children inside.

- Current names: subject, face subject, `FaceSubject`, `LooseSubject`, `ContainerSubject`,
  `ViewSubject`.
- Proposed: keep **subject** once entry 16 takes the command meaning. Alternatives if "subject"
  still feels opaque: **source node**, **collection source**.

**16. Command target.** The node a command acts on. The launcher captures it when opened, and the
slash menu uses the node being edited. Some commands require one and show a disabled reason
without it.

- Current names: subject, command subject, provenance node, `CommandDescriptor.subject`.
- Proposed: **command target**.

**17. Child source (loose, container, view).** The rule inside a subject, described in entry 15.
It is data, not UI state. A node with a matrix is a container; a marker with SQL is a view;
everything else is loose.

- Current names: child-sourcing mode, mode, `FaceSubject.mode`.
- Proposed: **child source**.

**18. View (saved query).** A saved query is a real node placed in the tree plus one stored SQL
statement keyed by that node. The node's label is the query's name. Launcher save creates one. It
opens like any other place, and its focus panel shows the query results.

- Current names: view, saved view, view block, view node, view subject, `block_sources`.
- First-draft options: rename to **saved query**, or keep **view** and rename the other uses of
  the word. Those uses are "view layer", "product views", the retired Table and Tags views, and
  `EditorView`. Keeping **view** is cheaper and equally unambiguous.

**19. Marker node.** The tree node that carries a saved query. It holds the name and the position.
The SQL lives in `block_sources`, keyed by the marker. Loose scans skip it because its results
already occupy that spot.

- Current names: marker, block marker, view marker, `ViewBlockRow`.
- Proposed: **marker node**.

### Hosts and the stream

**20. Host.** A shell component that owns an area of the screen and decides what goes in it. It
owns chrome, sizing, fidelity, navigation, insertion, and nesting, and it contains host slots.
Examples are the focus-panel collection host and the navigation panel.

- Proposed: keep **host** once entry 21 takes the gesture meaning.

**21. Destination parent.** The node a portal or move-owner gesture places a row under. In the
focus panel it is the focused node. Inline in the navigation panel it is the row's parent.

- Current names: host (the `host` prop in `row-gestures.tsx`).
- Proposed: **destination parent**.

**22. Stream item (a virtualized row in the navigation panel).** One rendered line of the
navigation panel. It is keyed by position, not by row, so a portaled row appears twice. It owns
that row's ProseMirror editors, its disclosure control, drag handle, guides, and drill action. It
is the only accessible tree item; sticky copies are not.

- Current names: row, stream row, outline row, workspace row, source row, `.outline-row`.
- First draft: "stream row".
- **Open.** "Row" belongs to matrices and SQL. Colorless alternatives: **stream item**,
  **tree item** (matches its ARIA role), **entry**. Recommendation: **stream item**. Sticky copies
  become **sticky items**.

**23. Row.** One record in one matrix, identified by matrix id and row id. It has column values
and exactly one home in the tree.

- Proposed: keep **row**. It is unambiguous once entry 22 takes the stream meaning.

**24. Field strip.** Under a stream item whose row lives in a different matrix, a horizontal strip
shows that row's non-label columns as editable values. Plain workspace rows show nothing there
because their label and content are the editors. Session 5B turns on whether this strip becomes a
host slot.

- Current names: `OutlineCellStrip`, "meshed cross-matrix row" cells. No canonical doc name.
- Proposed: **field strip**.
- **Open, answered.** "Field" is not used consistently. See entry 55.

**25. Inline results.** In the navigation panel, a saved query's results are spliced into the
flat scrolling sequence right after its marker. They scroll and page like ordinary items. They
position nothing and offer no ownership gestures.

- Current names: block, folded block, folded results, fold, `is_block_row`, `foldedKey`.
- First draft: "folded block".
- **Open, answered.** Inline placement is the defining trait. "Folded" means "folded into the
  sequence", not "collapsed". No per-block collapse toggle exists. The results hide only when an
  ancestor collapses. Two more facts: only saved queries the write-back recognizer accepts appear
  inline, and others show only in their focus panel. The flattener can also splice container
  results, but nothing feeds it container blocks today. Revised proposal: **inline results**.

**26. Panel regions.** A focus panel has four shell-owned areas: identity (label and content
editors), fields (the node's own column values), collection (the subject's children), and
relations (backlinks and references). Faces supply only the collection's contents.

- Current names: panel scaffold, scaffold, regions.
- Proposed: **panel regions**, naming each region.

### Data model

**27. Container node.** A node that owns a whole matrix. The matrix's rows still each have their
own home. The node is the matrix's owner and its place in the tree. Dedicated containers home
their rows beneath themselves. Shared containers collect rows created elsewhere.

- Current names: container, container node, matrix owner, type container, dedicated container.
- Proposed: **container node**, qualified as **dedicated** or **shared**.

**28. Type node.** A node promoted to act as a named type. It owns a matrix, its label is the type
name, and it appears in `#` completion and the launcher's `#` family. Applying the type to a row
creates an aspect row in its matrix.

- Current names: type, type-node, promoted node, promoted type, tag type, `TagType`,
  `promoted_nodes`.
- Proposed: **type node**.

**29. Aspect.** A row in a type node's matrix that is owned by, and attached to, another node.
Typing `#Task` on a bullet creates one, and so does `/attach`. It shows as structured fields
beside the node it describes.

- Current names: aspect, tag, tag aspect, tag property, attachment.
- Proposed: **aspect**. "Tag" stays only as the name of the `#` gesture.

**30. Raw SQL mode.** A saved query's editor can switch from chips to its underlying SQL. Edits
there are validated and recognized live before Apply.

- Current names: x-ray, custom mode, raw SQL mode, "view SQL ▸".
- Proposed: **raw SQL mode**. "X-ray" then names only the fidelity inspection state.

### Virtualization and shell

**31. Page.** The virtualizer's unit: 100 consecutive items of the flattened sequence. It keeps
the visible pages plus two on each side mounted. That mounted set is the retained range.

- Current names: page, window, `ROWS_PER_WINDOW`, `THRESHOLD_DISTANCE`.
- Proposed: **page** and **retained range**.

**32. Retained panels.** The shell keeps up to four focus panels mounted at once, so editors,
scroll, and pending saves survive navigation.

- Current names: retained panels, four-panel window.
- Proposed: **retained panels**.

**33. Shell layout.** At a shell width of 719 pixels or less, only the active panel shows, full
width. At 720 or more, the panels sit side by side in a bounded rail. Hidden panels stay mounted
but inert. This is runtime-only.

- Current names: shell presentation, single-panel mode, narrow mode, bounded rail,
  `WorkspaceShellPresentation`, `data-shell-presentation`.
- Proposed: **shell layout** with values **single-panel** and **rail**. "Narrow" is kept for
  density.

**34. Theme geometry adapter.** A documented seam where a visual theme may change a component's
geometry and chrome while behavior stays shared. The launcher is the only user: Ghost and Null
center it, and Wipeout anchors it to the title.

- Current names: presentation adapter, presentation shell.
- Proposed: **theme geometry adapter**.

**35. Sort and filter state.** Durable table sort and filter rows attached to a face config. They
use stable column ids and are replicated. They are not part of any saved query's SQL.

- Current names: presentation state, normalized sort/filter, collection presentation state.
- Proposed: **sort and filter state**.

**36. Host context.** The kind of place a host asks for a rendering, which decides whether it asks
for a line, a collection, or neither. The Plugins table lists a row in the stream, an expanded
block, a panel collection region, and a property popover. Session 5B corrects that table.

- Current names: host presentation.
- Proposed: **host context**.

### Design axes

**37. Polarity.** Dark or light. It is set by the `data-theme` attribute, which is a naming wart
for a later code pass.

- Proposed: keep **polarity**. "Theme" then means only visual theme.

**38. Component variant.** A keyed local look for one component, independent of theme. Today:
the outline variant (Guides only) and the table treatment (three looks). The value lives in a face
config's settings.

- Current names: component variant, treatment, variant, outline treatment.
- Proposed: **component variant**. "Treatment" stays only in the names of the three table looks.

**39. Column role.** A column can be marked `label` (short identifying text used in navigation and
search) or `content` (long rich text). A matrix has at most one of each.

- Current names: role, semantic role, column role, `SemanticColumnRole`.
- Proposed: **column role**. Design's "semantic roles" become **semantic tokens**.

**40. Command surface.** Where a command is offered: the `/` menu, the launcher, or both.

- Proposed: **command surface**. Generic "surface" is avoided in canonical prose.

**41. Root sentinel.** The virtual parent `(0, 0)` of every top-level row. It is not a real row.

- Proposed: **root sentinel**.

**42. Stream root.** The single top-level surface the shell mounts. The former Workspace, Table,
and Tags tabs are gone.

- Proposed: **stream root**. "Second product root" becomes "second top-level surface".

**43. Admin surfaces.** Settings and development tools outside user data: the matrix browser,
face configuration panel, Reset DB, and debug sidebar.

- Current names: system edge, dev tools, development system edge.
- Proposed: **admin surfaces**.

**44. Family browse.** Typing a sigil alone in the launcher, such as `#` or `[`, lists every
member of that family.

- Current names: lens, browse lens.
- Proposed: **family browse**.

**45. Admin browser.** The matrix browser is an inspection tool, not a place users navigate.

- Current names: administrative lens, matrix browser.
- Proposed: **matrix browser**, described as an admin surface. "Lens" retires.

### Queries and write-back

**46. Writable cell.** A query result value that traces back to one source column of one row, so
editing it edits that source.

- Current names: hydrated cell.
- Proposed: **writable cell**, or **writable field** if entry 55 picks "field".

**47. Read-only cell.** A computed, aggregated, or opaque result value that cannot edit a source.

- Current names: dry cell.
- Proposed: **read-only cell** or **read-only field**.

**48. No-ownership rule.** Query results never own rows, never create rows, and never imply a
position. A saved query's collection has no add-row action and no drag or reparent gestures.

- Current names: `view` firewall.
- Proposed: **no-ownership rule**.

**49. Kinds.** Four schemas use a bare `kind`. The proposal always qualifies it: **edge kind**
(own, ref, portal), **query kind** (which matrix a query reads), **rendering kind** (line,
collection). `block_sources.kind` has one value and needs no prose name.

**50. Workspace.** The word names the workspace matrix (label and content columns), the shell,
the workspace plugin, and the workspace face config. The proposal always qualifies it. The nature
of the workspace face config is a Session 5B decision.

**51. Navigation panel.** The virtualized tree rooted at the current top node, with sticky
ancestry. The `navigationOutline` setting becomes the **outline variant**.

- Current names: outline, navigation panel, loose outline, root panel.
- Proposed: **navigation panel**.

**52. Scopes.** Fidelity and theme values inherit down the component tree from scope boundaries.
The query `scope` fences results to a subtree. The proposal always qualifies them: **fidelity
scope**, **theme scope**, **query scope**.

**53. Property row.** The shared component that renders one row's editable fields, with names or
values only. The fallback line wraps it, and so does the table's line rendering, so field editing
has one owner.

- Current names: property adapter, shared property adapter, property row, `PropertyRow`.
- Proposed: **property row**.

**54. Yield.** A rendering hands a nested subject back to its host instead of mounting another
rendering. The host then shows that subject's children in a nested host slot.

- Proposed: keep **yield**.

**55. Field (new).** One column value of one row, as shown or edited. Today the focus panel says
"fields", `PropertyRow` says both field and cell, tables and write-back say "cell", and tags say
"property".

- Proposed: **field** everywhere outside a table grid. **Cell** is kept only for a table's
  grid intersection. "Property" retires except in component names. Entries 24, 46, and 47 follow
  this choice.

Concepts with one name and one meaning keep their current name and are not listed: closure,
scroll index, home, portal, provenance, place, extent, fidelity, composed, density, visual theme,
chip, glyph, family, sigil, Quick, Deep, discovery, session memory, residency, sticky navigation,
durability class, changelog, changeset, plugin, command.

## Stage 3 — User choices

Recorded 2026-10-01. Stage 4 uses these names. All entries are chosen.

| #   | Chosen name                                                      | Note                                                                                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | face                                                             | The whole plugin contribution: declaration plus renderings under one id. "Face type" retires. |
| 2   | face choice                                                      | The stored per-matrix row. "Recipe" and "face config" retire to Also called.                  |
| 3   | rendering                                                        | Line rendering, collection rendering.                                                         |
| 4   | rendering mount                                                  | Replaces host slot. `FaceHostSlot` is a code-rename candidate.                                |
| 5   | column slot                                                      | Column slot binding for the mapping.                                                          |
| 6   | default face choice                                              | Replaces face binding.                                                                        |
| 7   | face resolution                                                  | With "resolution order" and "step".                                                           |
| 8   | fallback rendering                                               | "Substrate" is reserved for fidelity.                                                         |
| 9   | substrate                                                        | Fidelity value only.                                                                          |
| 10  | aspect region                                                    |                                                                                               |
| 11  | orphaned position                                                |                                                                                               |
| 12  | dangling reference                                               |                                                                                               |
| 13  | position                                                         | Home position, portal position.                                                               |
| 14  | per-position face choice                                         | Deferred.                                                                                     |
| 15  | subject                                                          |                                                                                               |
| 16  | command target                                                   |                                                                                               |
| 17  | child source                                                     | Loose, container, view.                                                                       |
| 18  | view                                                             | "View" names nothing else. "Saved query" is not used.                                         |
| 19  | view (no separate marker name)                                   | Say "the view's node" when the node half matters. "Marker" stays in Also called.              |
| 20  | host                                                             |                                                                                               |
| 21  | destination parent                                               |                                                                                               |
| 22  | stream item                                                      | "Item" is reserved for this concept. Qualified forms such as "sticky item" are allowed.       |
| 23  | row                                                              |                                                                                               |
| 24  | field strip                                                      |                                                                                               |
| 25  | inline results                                                   | Qualify as inline view results or inline container results when the source matters.           |
| 26  | panel regions                                                    |                                                                                               |
| 27  | container node                                                   |                                                                                               |
| 28  | type node                                                        |                                                                                               |
| 29  | aspect                                                           |                                                                                               |
| 30  | raw SQL mode                                                     | "X-ray" is fidelity only.                                                                     |
| 31  | page                                                             | With "retained range".                                                                        |
| 32  | retained panels                                                  |                                                                                               |
| 33  | shell layout                                                     | Values single-panel and rail.                                                                 |
| 34  | theme geometry adapter                                           |                                                                                               |
| 35  | sort and filter state                                            |                                                                                               |
| 36  | host context                                                     |                                                                                               |
| 37  | polarity                                                         |                                                                                               |
| 38  | component variant                                                |                                                                                               |
| 39  | column role                                                      | Design tokens become "semantic tokens".                                                       |
| 40  | command surface                                                  |                                                                                               |
| 41  | root sentinel                                                    |                                                                                               |
| 42  | stream root                                                      |                                                                                               |
| 43  | admin surfaces                                                   |                                                                                               |
| 44  | family browse                                                    |                                                                                               |
| 45  | matrix browser                                                   |                                                                                               |
| 46  | writable field                                                   |                                                                                               |
| 47  | read-only field                                                  |                                                                                               |
| 48  | no-ownership rule                                                |                                                                                               |
| 49  | edge kind, query kind, rendering kind                            | Always qualified.                                                                             |
| 50  | workspace matrix, shell, workspace plugin, workspace face choice | Always qualified.                                                                             |
| 51  | navigation panel                                                 | `navigationOutline` is the outline variant.                                                   |
| 52  | fidelity scope, theme scope, query scope                         | Always qualified.                                                                             |
| 53  | field strip (property row leaves the ledger)                     | `PropertyRow` is only the component behind the fallback line rendering.                       |
| 54  | yield                                                            |                                                                                               |
| 55  | field                                                            | "Cell" only for a table grid intersection. "Property" retires except in component names.      |
| 56  | node                                                             | Distinct from row and stream item, cross-referenced. See below.                               |

Facts found while recording:

- No container results appear inline today. `containerBlock` in `workspace/window-flatten.ts` has
  no caller, and only views are fed to the flattener. Virtualization.md overstates this. Stage 5
  must mark container inline results as designed, not shipped.
- `block_sources.kind` allows only `'view'`. No container uses a marker.
- Every live row has one inbound `own` edge, including hostless aspects, which are owned by their
  type node. Every row is therefore a tree member.
- The field strip renders `FieldEditor` directly. It does not use `PropertyRow`.

Entry 56, as decided: three related entries.

- **Row** is a record in one matrix. It can be discussed without any tree position.
- **Node** is a row together with its place in the tree: a home and one or more positions. It is
  what can be focused, nested, and navigated.
- **Stream item** is one rendering of one position. A node with a home and a portal shows as two
  stream items.

## Stage 5 — Architecture re-homing record

Every section removed from `Architecture.md` and its new home. "Already present" means the
destination held the same content before this session, so nothing was copied.

| Former Architecture section                | New home                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Objectives                                 | Kept in Architecture                                                                                                            |
| Current platform, first paragraph          | Kept in Architecture, Layers                                                                                                    |
| Current platform, sync readiness paragraph | Sync.md introduction, already present                                                                                           |
| Layers                                     | Kept in Architecture, renamed                                                                                                   |
| Data boundary                              | Data-Model.md Principles, added examples list; runtime-only state also in Launcher.md session memory and Design.md shell layout |
| Execution model, three tiers               | Kept in Architecture, Layers, condensed                                                                                         |
| Execution model, migration paragraph       | Sync.md Migration policy, already present                                                                                       |
| Matrix and row identity                    | Data-Model.md Matrixes and columns, added; independence of axes in Data-Model.md Principles                                     |
| Queries and write-back                     | Query-Spec.md, already present; write-back bullets in Write-back by construction                                                |
| Places, gestures, and the system edge      | Launcher.md Places and navigation, added                                                                                        |
| Shell layout paragraph                     | Design.md Shell layout, already present                                                                                         |
| Single-panel ancestry paragraph            | Design.md Shell layout, already present                                                                                         |
| Quick launcher capture paragraph           | Launcher.md Anatomy and Commands in the list, already present                                                                   |
| Views participate paragraph                | Data-Model.md Views, added the focus panel and write-back sentences                                                             |
| One stream root paragraph                  | Launcher.md Places and navigation, added                                                                                        |
| Two planes                                 | Data-Model.md Principles, added                                                                                                 |
| Ancestry                                   | Launcher.md Ancestry resolution, added                                                                                          |
| Global discovery paragraph                 | Launcher.md One list, one ranking, added                                                                                        |
| Session memory paragraph                   | Launcher.md The empty state, store planes added; limits already present                                                         |
| Quick result limit paragraph               | Launcher.md, already present                                                                                                    |
| Subjects, recipes, faces, and hosts        | Plugins.md Subjects, Faces, Face choices, Face resolution, Renderings, and Hosts                                                |
| Fidelity and design axes                   | Design.md Fidelity inputs, already present                                                                                      |
| Plugins and commands                       | Plugins.md Commands, already present                                                                                            |
| Replication boundary                       | Sync.md Durability policy, already present                                                                                      |
| Operations and external interfaces         | Plan.md Phase 15, added                                                                                                         |
| Deferred cross-cutting work                | Plan.md Deferred decisions and Phases 20–21, already present                                                                    |

Plugins.md also lost its per-session "Runtime migration" changelog. That chronology already lives in
the Phase 13 session documents; the remaining work is now a short "Remaining migration" list.
