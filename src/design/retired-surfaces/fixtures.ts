export type RetiredTableColumn = {
  readonly key: string
  readonly label: string
  readonly type: string
  readonly role?: string
}

export type RetiredTableRow = {
  readonly id: string
  readonly cells: Readonly<Record<string, string>>
}

export type RetiredTagType = {
  readonly id: string
  readonly name: string
  readonly count: number
}

export type RetiredTagInstance = {
  readonly id: string
  readonly source: string
  readonly snippet: string
}

export const retiredTableColumns: readonly RetiredTableColumn[] = [
  { key: 'title', label: 'Title', type: 'TEXT', role: 'label' },
  { key: 'status', label: 'Status', type: 'TEXT' },
  { key: 'due', label: 'Due', type: 'TEXT' },
  { key: 'score', label: 'Score', type: 'REAL' },
]

export const retiredTableRows: readonly RetiredTableRow[] = [
  {
    id: 'row-1',
    cells: { title: 'Prepare research brief', status: 'active', due: '2026-09-25', score: '8' },
  },
  {
    id: 'row-2',
    cells: { title: 'Review field notes', status: 'draft', due: '2026-09-27', score: '5' },
  },
  {
    id: 'row-3',
    cells: { title: 'Publish synthesis', status: 'planned', due: '2026-10-02', score: '13' },
  },
]

export const retiredTagTypes: readonly RetiredTagType[] = [
  { id: 'task', name: 'task', count: 12 },
  { id: 'review', name: 'review', count: 4 },
  { id: 'source', name: 'source', count: 1 },
]

export const retiredTagInstances: readonly RetiredTagInstance[] = [
  { id: 'instance-1', source: 'Workspace', snippet: 'Prepare research brief' },
  { id: 'instance-2', source: 'Reading queue', snippet: 'Review field notes' },
  { id: 'instance-3', source: 'Workspace', snippet: 'Publish synthesis' },
]
