import { createOwnedMatrix } from '../core/client/matrix-client'
import type { CommandDescriptor } from '../command-registry'

export const DEFAULT_TABLE_NAME = 'Untitled table'

export const structuralCommands: readonly CommandDescriptor[] = [
  {
    id: 'hila.table',
    label: 'New table',
    keywords: ['collection', 'database', 'subtable'],
    surfaces: ['slash'],
    subject: 'required',
    unavailableReason: ({ capabilities }) =>
      capabilities.focusCreatedTable ? null : 'This surface cannot focus a new table.',
    run: async ({ subject, capabilities }) => {
      if (!subject || !capabilities.focusCreatedTable) return
      const matrixId = await createOwnedMatrix(subject, DEFAULT_TABLE_NAME, [
        { name: 'title', type: 'TEXT', role: 'label' },
        { name: 'content', type: 'TEXT', role: 'content' },
      ])
      capabilities.focusCreatedTable(matrixId)
    },
  },
  {
    id: 'hila.attach',
    label: 'Attach a typed row',
    keywords: ['tag', 'type', 'task', 'add'],
    surfaces: ['slash'],
    subject: 'required',
    unavailableReason: ({ capabilities }) =>
      capabilities.openTypePicker ? null : 'This surface cannot open the type picker.',
    run: ({ subject, capabilities }) => {
      if (subject && capabilities.openTypePicker) capabilities.openTypePicker(subject)
    },
  },
]
