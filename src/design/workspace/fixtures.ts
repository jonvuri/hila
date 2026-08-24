import {
  workspacePanels as archivedWorkspacePanels,
  workspaceTitle,
} from '../overlaid-cards/fixtures'

import type { WorkspaceAncestry, WorkspaceAncestryItem, WorkspacePanel } from './types'

const denseLeaves = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    content: `${prefix} row ${index + 1}`,
  }))

const ancestryItem = (id: string, label: string, matrixId = 1): WorkspaceAncestryItem => ({
  id,
  label,
  matrixId,
})

const rootToBook: WorkspaceAncestry = {
  source: 'provenance',
  items: [
    ancestryItem('root', workspaceTitle),
    ancestryItem('research', 'Research'),
    ancestryItem('reading-queue', 'Reading queue'),
    ancestryItem('books', 'Books'),
  ],
}

const rootToChapter: WorkspaceAncestry = {
  source: 'provenance',
  items: [
    ...rootToBook.items,
    ancestryItem('ddia', archivedWorkspacePanels[1]!.title),
    ancestryItem('part-1', 'Part I — Foundations of Data Systems'),
  ],
}

const rootToSection: WorkspaceAncestry = {
  source: 'provenance',
  items: [...rootToChapter.items, ancestryItem('chapter-3', archivedWorkspacePanels[2]!.title)],
}

const sectionPanel: WorkspacePanel = {
  id: 'section-31',
  kind: 'focus',
  title: '3.1 Data structures that power your database',
  ancestry: rootToSection,
  items: [
    {
      id: 'hash-indexes',
      content: 'Hash indexes',
      children: [
        { id: 'hash-map', content: 'Keep an in-memory hash map' },
        { id: 'segment-files', content: 'Break the log into segment files' },
      ],
    },
    { id: 'sstables', content: 'SSTables and LSM-trees' },
    { id: 'b-trees', content: 'B-trees' },
  ],
  selectedId: 'sstables',
  focus: {
    content: [
      'Indexes trade write cost for faster reads. The useful comparison is the shape of that trade, not one universal winner.',
    ],
    properties: [
      ['status', 'annotating'],
      ['next', 'compare compaction strategies'],
    ],
    backlinks: ['Storage engine sketches', 'Write amplification notes'],
  },
}

const comparisonPanel: WorkspacePanel = {
  id: 'comparison',
  kind: 'focus',
  title: 'Comparing B-trees and LSM-trees',
  ancestry: {
    source: 'provenance',
    items: [...rootToSection.items, ancestryItem('section-31', sectionPanel.title)],
  },
  items: [
    { id: 'comparison-reads', content: 'Read performance' },
    { id: 'comparison-writes', content: 'Write performance' },
    { id: 'comparison-ops', content: 'Operational trade-offs' },
  ],
  selectedId: 'comparison-writes',
  focus: {
    content: [
      'LSM-trees usually sustain higher write throughput. B-trees offer steadier read behavior and simpler operational expectations.',
    ],
    properties: [['review', 'after the storage spike']],
    backlinks: ['Phase 8b performance notes'],
  },
}

const adaptArchivedPanel = (index: number): WorkspacePanel => {
  const panel = archivedWorkspacePanels[index]!
  const ancestry =
    index === 1 ? rootToBook
    : index === 2 ? rootToChapter
    : undefined

  return {
    id:
      index === 0 ? 'root'
      : index === 1 ? 'ddia'
      : 'chapter-3',
    kind: panel.kind,
    title: panel.title,
    items: panel.items,
    initialCollapsed: panel.initialCollapsed,
    drillId: panel.drillId,
    selectedId: panel.drillId,
    disabledIds: index === 0 ? new Set(['archive']) : undefined,
    focus: panel.focus,
    ancestry,
  }
}

export const rootVisiblePanels: readonly WorkspacePanel[] = [
  adaptArchivedPanel(0),
  adaptArchivedPanel(1),
  adaptArchivedPanel(2),
]

export const fourColumnPanels: readonly WorkspacePanel[] = [...rootVisiblePanels, sectionPanel]

const fiveColumnPath: readonly WorkspacePanel[] = [...fourColumnPanels, comparisonPanel]

export const rootShiftedPanels: readonly WorkspacePanel[] = fiveColumnPath.slice(1)

export const longWorkspaceTitle =
  'hila — a deliberately long workspace title that must remain usable at narrow column widths'

export const longLabelPanels: readonly WorkspacePanel[] = rootVisiblePanels.map(
  (panel, index) =>
    index === 0 ?
      {
        ...panel,
        title: longWorkspaceTitle,
        items: [
          {
            id: 'long-project',
            content:
              'A very long navigation label that must truncate without moving the collapse or drill controls outside the column',
            children: panel.items.slice(0, 2),
          },
          ...panel.items.slice(2),
        ],
        drillId: 'long-project',
        selectedId: 'long-project',
      }
    : panel,
)

export const crossMatrixPanels: readonly WorkspacePanel[] = [
  {
    ...sectionPanel,
    id: 'cross-matrix-task',
    title: 'Verify the storage-engine comparison',
    ancestry: {
      source: 'provenance',
      items: [
        ancestryItem('root', workspaceTitle, 1),
        ancestryItem('research', 'Research', 1),
        ancestryItem('reading-queue', 'Reading queue', 1),
        ancestryItem('ddia', archivedWorkspacePanels[1]!.title, 1),
        ancestryItem('task-type', '#task', 7),
      ],
    },
    items: [
      { id: 'task-checklist', content: 'Checklist' },
      { id: 'task-evidence', content: 'Evidence' },
      { id: 'task-followup', content: 'Follow-up' },
    ],
    selectedId: 'task-evidence',
    focus: {
      content: [
        'This task is stored in the task matrix. Its visible ancestry still follows the appearance that opened it.',
      ],
      properties: [
        ['status', 'in progress'],
        ['matrix', 'Tasks'],
      ],
      backlinks: ['Ch. 3 — Storage and Retrieval'],
    },
  },
]

export const stickyThresholdPanels: readonly WorkspacePanel[] = [
  {
    id: 'threshold-title',
    kind: 'navigation',
    title: 'Title only',
    items: denseLeaves('Title only', 36),
  },
  {
    id: 'threshold-one-level',
    kind: 'navigation',
    title: 'One level',
    items: Array.from({ length: 9 }, (_, index) => ({
      id: `one-level-${index + 1}`,
      content: `Section ${index + 1}`,
      children: denseLeaves(`Section ${index + 1}`, 3),
    })),
  },
  {
    id: 'threshold-multi-level',
    kind: 'navigation',
    title: 'Multiple levels',
    items: Array.from({ length: 6 }, (_, index) => ({
      id: `multi-${index + 1}`,
      content: `Area ${index + 1}`,
      children: [
        {
          id: `multi-${index + 1}-group`,
          content: `Group ${index + 1}`,
          children: denseLeaves(`Nested ${index + 1}`, 4),
        },
        { id: `multi-${index + 1}-tail`, content: `Area ${index + 1} tail` },
      ],
    })),
  },
  {
    id: 'threshold-drill-top',
    kind: 'navigation',
    title: 'Drill at top',
    items: denseLeaves('Top drill', 36),
    drillId: 'Top drill-3',
    selectedId: 'Top drill-3',
  },
  {
    id: 'threshold-drill-bottom',
    kind: 'navigation',
    title: 'Drill at bottom',
    items: denseLeaves('Bottom drill', 36),
    drillId: 'Bottom drill-34',
    selectedId: 'Bottom drill-34',
  },
]

export const navigationOutlinePanels: readonly WorkspacePanel[] = [
  {
    id: 'outline-review',
    kind: 'navigation',
    title: 'Guides',
    items: [
      {
        id: 'active-branch',
        content: 'Selected branch',
        children: [
          {
            id: 'deep-branch',
            content: 'Deep hierarchy',
            children: [
              {
                id: 'deeper-branch',
                content: 'Editable nested row',
                children: [
                  { id: 'selected-leaf', content: 'Selected leaf' },
                  { id: 'disabled-leaf', content: 'Disabled leaf' },
                ],
              },
              {
                id: 'long-leaf',
                content:
                  'A long navigation label stays truncated while the guide depth increases',
              },
            ],
          },
          { id: 'active-tail', content: 'Branch tail' },
        ],
      },
      {
        id: 'collapsed-branch',
        content: 'Collapsed branch',
        children: denseLeaves('Hidden child', 4),
      },
      {
        id: 'drill-branch',
        content: 'Drill target',
        children: denseLeaves('Drill child', 5),
      },
      ...denseLeaves('Boundary context', 24),
    ],
    initialCollapsed: new Set(['collapsed-branch']),
    drillId: 'drill-branch',
    selectedId: 'selected-leaf',
    disabledIds: new Set(['disabled-leaf']),
  },
]

export { workspaceTitle }
