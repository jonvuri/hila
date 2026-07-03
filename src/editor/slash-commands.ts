import type { EditorView } from 'prosemirror-view'

import { createOwnedMatrix, createDependentRow } from '../core/client/matrix-client'

import { setPendingNewTable } from './pending-table'
import { openSlashTypePicker } from './slash-type-picker'

/**
 * Slash-command registry and dispatch (Phase 9 §9.6 — the unified creation gesture).
 *
 * The `/` surface is hila's entry point for "add structure under this node". Each
 * command is a **pure side-effect launcher**: pick it → it runs immediately. Any
 * further interaction happens *elsewhere* (a second menu, or an input on the
 * created object), never as text typed after the command in the editor.
 *
 * - `/table` → mint a new **dedicated** own-matrix (`createOwnedMatrix`), seeded
 *   with a `label` + `content` column so it is a full row↔table-continuum
 *   participant from birth. Renders in the focus panel's `container` mode (the
 *   `SubstrateRegion` → `SubTableBand`); the run hands off to that table's name
 *   input via the `pending-table` signal so the user can name it next.
 * - `/attach` → open a standalone type picker (`slash-type-picker`); picking a
 *   promoted type instantiates a **structurally-anchored** own-row of it
 *   (`createDependentRow`), the structural complement of an inline `#`-ref.
 *   Renders in the `SubstrateRegion` `loose` mode (Phase 9.7 Stage C; formerly
 *   the AspectBand), untethered.
 *
 * The command matching here is DOM-free and unit-testable; each `run` delegates
 * its side effects (op dispatch, the second menu, the focus handoff) to the
 * focused modules above. The `slash-plugin` drives selection.
 */

export type SlashNode = { matrixId: number; rowId: number }

export type SlashCommandId = 'table' | 'attach'

export type SlashCommand = {
  id: SlashCommandId
  /** Menu label shown in the slash dropdown. */
  label: string
  /** Extra keywords (beyond the id) used to match the typed command query. */
  keywords: string[]
  /**
   * Run the command, scoped to the focal node. The plugin has already deleted
   * the `/…` text by the time this is called; `view` is passed for launchers
   * that anchor a follow-up surface to the editor (e.g. `/attach`'s picker).
   */
  run: (node: SlashNode, view: EditorView) => void
}

/** The default name a freshly-created `/table` sub-table is born with; the user
 *  renames it via its (now editable) name input in the `SubTableBand`. */
export const DEFAULT_TABLE_NAME = 'Untitled table'

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'table',
    label: 'New table',
    keywords: ['collection', 'database', 'subtable'],
    run: (node) => {
      void createOwnedMatrix(node, DEFAULT_TABLE_NAME, [
        { name: 'title', type: 'TEXT', role: 'label' },
        { name: 'content', type: 'TEXT', role: 'content' },
      ])
        .then((matrixId) => setPendingNewTable(matrixId))
        .catch((e) => console.error('slash /table failed', e))
    },
  },
  {
    id: 'attach',
    label: 'Attach a typed row',
    keywords: ['tag', 'type', 'task', 'add'],
    run: (node, view) => {
      openSlashTypePicker(view, node)
    },
  },
]

/** Filter the command list by the typed query (prefix on id/keywords, substring
 *  on the label). */
export const matchCommands = (query: string): SlashCommand[] => {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) =>
      c.id.startsWith(q) ||
      c.keywords.some((k) => k.startsWith(q)) ||
      c.label.toLowerCase().includes(q),
  )
}

// Re-exported so consumers (and tests) can reach the underlying ops through the
// registry module without a separate import path.
export { createOwnedMatrix, createDependentRow }
