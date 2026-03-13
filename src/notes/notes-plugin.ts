import type { FaceTypeDefinition } from '../core/face-types'
import type { PluginDefinition } from '../core/plugin-types'
import { registerFaceType as registerFaceTypeLocal } from '../core/face-registry'
import {
  registerFaceType as registerFaceTypeWorker,
  seedRow,
} from '../core/client/matrix-client'

const WELCOME_BODY_JSON = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Welcome to Hila Notes. Start writing here.' }],
    },
  ],
})

export const noteListFaceTypeDefinition: FaceTypeDefinition = {
  id: 'hila.note-list',
  name: 'Note List',
  slots: [],
  traitRequirements: [{ type: 'rank' }],
  overflowBehavior: 'none',
}

export const noteFaceTypeDefinition: FaceTypeDefinition = {
  id: 'hila.note',
  name: 'Note',
  slots: [
    { name: 'title', preferredType: 'text', required: true },
    { name: 'body', preferredType: 'richtext', required: true },
  ],
  traitRequirements: [],
  overflowBehavior: 'property-panel',
}

export const registerNoteFaceTypes = async (): Promise<void> => {
  registerFaceTypeLocal(noteListFaceTypeDefinition)
  registerFaceTypeLocal(noteFaceTypeDefinition)
  await registerFaceTypeWorker(noteListFaceTypeDefinition)
  await registerFaceTypeWorker(noteFaceTypeDefinition)
}

export const buildAllNotesQuery = (matrixId: number): string => `
SELECT r.row_id, r.key, d.title, d.body
FROM rank r
JOIN "mx_${matrixId}_data" d ON r.row_id = d.id
WHERE r.matrix_id = ${matrixId}
ORDER BY r.key
`

export const buildSingleNoteQuery = (matrixId: number, rowId: number): string => `
SELECT d.id, d.title, d.body
FROM "mx_${matrixId}_data" d
WHERE d.id = ${rowId}
`

export const notesPlugin: PluginDefinition = {
  id: 'hila.notes',
  name: 'Notes',
  version: '1.0.0',
  matrixes: [
    {
      key: 'notes',
      title: 'Notes',
      columns: [
        { name: 'title', type: 'TEXT' },
        { name: 'body', type: 'TEXT' },
      ],
    },
  ],
  traits: [{ type: 'rank', matrixKey: 'notes' }],
  namedQueries: {
    allNotes: 'buildAllNotesQuery(matrixId)',
    singleNote: 'buildSingleNoteQuery(matrixId, rowId)',
  },
  namedMutations: {},
  faceBindings: [
    { key: 'list', faceTypeId: 'hila.note-list', matrixKey: 'notes' },
    { key: 'editor', faceTypeId: 'hila.note', matrixKey: 'notes' },
  ],
  init: async (ctx) => {
    const matrixId = ctx.matrixIds['notes']
    if (matrixId !== undefined) {
      await seedRow(matrixId, { title: 'Welcome', body: WELCOME_BODY_JSON })
    }
  },
}
