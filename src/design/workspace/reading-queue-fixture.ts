import type { OutlineNode } from '../outline/types'

import type { WorkspaceFocusContent } from './types'

type ReadingQueuePanel = {
  kind: 'navigation' | 'focus'
  title: string
  items: OutlineNode[]
  initialCollapsed?: ReadonlySet<string>
  drillId?: string
  focus?: WorkspaceFocusContent
}

export const workspaceTitle = 'hila'

const rootItems: OutlineNode[] = [
  {
    id: 'inbox',
    content: 'Inbox',
    children: [
      { id: 'in-1', content: 'Reply to Petra re: schema review' },
      { id: 'in-2', content: 'Renew domain registrations' },
      { id: 'in-3', content: 'Clip — “Local-first software” essay' },
      { id: 'in-4', content: 'Book dentist' },
      { id: 'in-5', content: 'File the co-op paperwork' },
      { id: 'in-6', content: 'Clip — VFD segment display datasheet' },
    ],
  },
  {
    id: 'projects',
    content: 'Projects',
    children: [
      {
        id: 'prj-hila',
        content: 'hila — phase 10 theming',
        children: [
          { id: 'prj-h1', content: 'Token reconciliation pass' },
          { id: 'prj-h2', content: 'Launcher overlay treatments' },
          { id: 'prj-h3', content: 'global.css migration sequence' },
        ],
      },
      {
        id: 'prj-cabin',
        content: 'Cabin — insulation and wiring',
        children: [
          { id: 'prj-c1', content: 'Order rockwool batts' },
          { id: 'prj-c2', content: 'Subpanel load calculation' },
        ],
      },
    ],
  },
  {
    id: 'log',
    content: 'Log',
    children: [
      { id: 'log-1', content: 'W28 — rank-key collision hunt' },
      { id: 'log-2', content: 'W27 — sub-table boundary hops' },
      { id: 'log-3', content: 'W26 — folded block drill-in' },
      { id: 'log-4', content: 'W25 — substrate region unification' },
      { id: 'log-5', content: 'W24 — aspect band tethering' },
    ],
  },
  {
    id: 'research',
    content: 'Research',
    children: [
      {
        id: 'rq',
        content: 'Reading queue',
        children: [
          {
            id: 'rq-books',
            content: 'Books',
            children: [
              {
                id: 'rq-ddia',
                content: 'Designing Data-Intensive Applications — reading notes and quotes',
              },
              { id: 'rq-noo', content: 'The Nature of Order' },
              { id: 'rq-mmm', content: 'The Mythical Man-Month' },
            ],
          },
          {
            id: 'rq-papers',
            content: 'Papers',
            children: [
              { id: 'rq-p1', content: 'Out of the Tar Pit' },
              { id: 'rq-p2', content: 'A Note on Distributed Computing' },
            ],
          },
          { id: 'rq-clips', content: 'Web clips' },
        ],
      },
      {
        id: 'fieldnotes',
        content: 'Field notes',
        children: [
          { id: 'fn-1', content: 'Local-first sync — open questions' },
          { id: 'fn-2', content: 'Schema migration patterns worth stealing' },
        ],
      },
    ],
  },
  {
    id: 'trips',
    content: 'Trips',
    children: [
      { id: 'trip-1', content: 'Iceland — route, cabins, packing list' },
      { id: 'trip-2', content: 'Kyoto' },
    ],
  },
  { id: 'archive', content: 'Archive' },
]

const bookItems: OutlineNode[] = [
  { id: 'ddia-status', content: 'Status — reading, ch. 3 of 12' },
  {
    id: 'part-1',
    content: 'Part I — Foundations of Data Systems',
    children: [
      { id: 'ch-1', content: 'Ch. 1 — Reliable, Scalable, Maintainable' },
      { id: 'ch-2', content: 'Ch. 2 — Data Models and Query Languages' },
      { id: 'ch-3', content: 'Ch. 3 — Storage and Retrieval' },
      { id: 'ch-4', content: 'Ch. 4 — Encoding and Evolution' },
    ],
  },
  {
    id: 'part-2',
    content: 'Part II — Distributed Data',
    children: [
      { id: 'ch-5', content: 'Ch. 5 — Replication' },
      { id: 'ch-6', content: 'Ch. 6 — Partitioning' },
      { id: 'ch-7', content: 'Ch. 7 — Transactions' },
      { id: 'ch-8', content: 'Ch. 8 — The Trouble with Distributed Systems' },
      { id: 'ch-9', content: 'Ch. 9 — Consistency and Consensus' },
    ],
  },
  {
    id: 'part-3',
    content: 'Part III — Derived Data',
    children: [
      { id: 'ch-10', content: 'Ch. 10 — Batch Processing' },
      { id: 'ch-11', content: 'Ch. 11 — Stream Processing' },
      { id: 'ch-12', content: 'Ch. 12 — The Future of Data Systems' },
    ],
  },
  {
    id: 'ddia-live',
    content: 'Live view — notes, newest first',
    children: [
      { id: 'lv-1', content: 'LSM vs B-trees — margin note' },
      { id: 'lv-2', content: '“Data outlives code” — clipped quote' },
      { id: 'lv-3', content: 'Write amplification vs the rank table' },
      { id: 'lv-4', content: 'Schema-on-read echoes the face-slot model' },
    ],
  },
]

const chapterItems: OutlineNode[] = [
  {
    id: 's31',
    content: '3.1 Data structures that power your database',
    children: [
      { id: 's31-hash', content: 'Hash indexes' },
      { id: 's31-lsm', content: 'SSTables and LSM-trees' },
      { id: 's31-btree', content: 'B-trees' },
      { id: 's31-cmp', content: 'Comparing B-trees and LSM-trees' },
    ],
  },
  { id: 's32', content: '3.2 Transaction processing or analytics?' },
  {
    id: 'ch3-quotes',
    content: 'Quotes',
    children: [
      { id: 'q-1', content: '“The log is the database”' },
      { id: 'q-2', content: '“Memory is the new disk”' },
    ],
  },
  {
    id: 'ch3-notes',
    content: 'Margin notes',
    children: [
      { id: 'mn-1', content: 'Compaction cost — check against the matrix layer' },
      { id: 'mn-2', content: 'LSM-trees append and compact; B-trees update in place' },
    ],
  },
  {
    id: 's33',
    content: '3.3 Column-oriented storage',
    children: [
      { id: 's33-comp', content: 'Column compression' },
      { id: 's33-sort', content: 'Sort order in column storage' },
      { id: 's33-agg', content: 'Aggregation: data cubes and materialized views' },
    ],
  },
  {
    id: 'ch3-todo',
    content: 'Follow-ups',
    children: [
      { id: 'td-1', content: 'Sketch LSM compaction against matrix snapshots' },
      { id: 'td-2', content: 'Re-read hash index section before phase 11' },
    ],
  },
]

export const readingQueuePanels: readonly ReadingQueuePanel[] = [
  {
    kind: 'navigation',
    title: workspaceTitle,
    items: rootItems,
    drillId: 'rq-ddia',
  },
  {
    kind: 'focus',
    title: 'Designing Data-Intensive Applications — reading notes and quotes',
    items: bookItems,
    initialCollapsed: new Set(['part-2']),
    drillId: 'ch-3',
    focus: {
      content: [
        'Kleppmann’s tour of storage, replication, and consistency. Reading it against the matrix layer — most chapters map onto a hila subsystem uncomfortably well.',
        'Working through one chapter per week; quotes and margin notes get their own rows under the live view.',
      ],
      properties: [
        ['status', 'reading — ch. 3 of 12'],
        ['author', 'Martin Kleppmann'],
        ['started', '2026-05-14'],
      ],
      backlinks: [
        'Local-first sync — open questions',
        'Compaction cost — check against the matrix layer',
      ],
    },
  },
  {
    kind: 'focus',
    title: 'Ch. 3 — Storage and Retrieval',
    items: chapterItems,
    initialCollapsed: new Set(['ch3-quotes']),
    focus: {
      content: [
        'The log-structured vs page-oriented split. LSM-trees append and compact; B-trees update in place — the write-amplification trade runs the whole chapter.',
      ],
      properties: [
        ['pages', '69–103'],
        ['revisit', 'yes — after the rank-key work'],
      ],
      backlinks: ['LSM vs B-trees — margin note'],
    },
  },
]
