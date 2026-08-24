// ---------------------------------------------------------------------------
// Shared Storybook fixtures for OverlaidCards (session 4b).
//
// One module reused by every story and theme variant: the session-4 "Reading
// queue" world expanded to real density (the dense-gestalt scenario), the
// original four layout scenarios, and the shared PanelBody renderer that
// feeds the real presentational `Outline` into panels. Imported only by
// stories -- never by the app.
// ---------------------------------------------------------------------------

import { For, type JSX, Show } from 'solid-js'

import './fixtures.css'
import { Outline } from '../outline/Outline'
import type { LegacyOutlineVariant, OutlineNode } from '../outline/types'

import type { OverlaidAncestor } from './types'

// ---------------------------------------------------------------------------
// Panel model
// ---------------------------------------------------------------------------

export type StubPanel = {
  kind: 'navigation' | 'focus'
  title: string
  /** Dense outline content (gestalt scenario). */
  items?: OutlineNode[]
  initialCollapsed?: ReadonlySet<string>
  /** Legacy em-dash placeholder lines (the original four scenarios). */
  lines?: string[]
}

export type Scenario = {
  label: string
  title: string
  panels: StubPanel[]
  gaps: OverlaidAncestor[][]
}

export const anc = (id: number, label: string): OverlaidAncestor => ({
  key: `anc-${id}`,
  label,
  rowId: id,
})

const stubLines = (n: number, seed: number): string[] =>
  Array.from({ length: n }, (_, i) => '—'.repeat(((seed + i * 3) % 5) + 4))

export const focus = (title: string, lines = 5, seed = 0): StubPanel => ({
  kind: 'focus',
  title,
  lines: stubLines(lines, seed),
})

export const nav = (title: string): StubPanel => ({
  kind: 'navigation',
  title,
  lines: stubLines(6, 2),
})

// ---------------------------------------------------------------------------
// The dense "Reading queue" world (session-4 scene, at real density)
// ---------------------------------------------------------------------------

const rootItems: OutlineNode[] = [
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
                // The long label that must truncate.
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

const ddiaItems: OutlineNode[] = [
  { id: 'ddia-status', content: 'Status — reading, ch. 3 of 12' },
  {
    id: 'part-1',
    content: 'Part I — Foundations of Data Systems',
    children: [
      { id: 'ch-1', content: 'Ch. 1 — Reliable, Scalable, Maintainable' },
      { id: 'ch-2', content: 'Ch. 2 — Data Models and Query Languages' },
      { id: 'ch-3', content: 'Ch. 3 — Storage and Retrieval' },
    ],
  },
  {
    id: 'part-2',
    content: 'Part II — Distributed Data',
    children: [
      { id: 'ch-5', content: 'Ch. 5 — Replication' },
      { id: 'ch-6', content: 'Ch. 6 — Partitioning' },
    ],
  },
  { id: 'part-3', content: 'Part III — Derived Data' },
  {
    id: 'ddia-live',
    content: 'Live view — notes, newest first',
    children: [
      { id: 'lv-1', content: 'LSM vs B-trees — margin note' },
      { id: 'lv-2', content: '“Data outlives code” — clipped quote' },
    ],
  },
]

const ch3Items: OutlineNode[] = [
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
]

/** Dense-gestalt scenario: the deep-chain scene every session-4 prototype
 *  rendered, one level deeper per panel so the tab groups carry real
 *  ancestry -- 2 / 3 / 2 tabs per column:
 *  hila › Research ▸ [nav] · Reading queue › Books › [DDIA] · Part I › [Ch. 3]. */
export const denseGestalt: Scenario = {
  label: 'Dense gestalt — Reading queue',
  title: 'hila',
  panels: [
    { kind: 'navigation', title: 'hila', items: rootItems },
    {
      kind: 'focus',
      title: 'Designing Data-Intensive Applications — reading notes and quotes',
      items: ddiaItems,
      initialCollapsed: new Set(['part-2']),
    },
    {
      kind: 'focus',
      title: 'Ch. 3 — Storage and Retrieval',
      items: ch3Items,
      initialCollapsed: new Set(['ch3-quotes']),
    },
  ],
  gaps: [
    [anc(1, 'Research')],
    [anc(2, 'Reading queue'), anc(3, 'Books')],
    [anc(4, 'Part I — Foundations')],
  ],
}

// ---------------------------------------------------------------------------
// The original four layout scenarios (kept working)
// ---------------------------------------------------------------------------

export const rootAncestors: Scenario = {
  label: 'Root ancestors only',
  title: 'Workspace',
  panels: [focus('Quarterly planning', 6, 1)],
  gaps: [[anc(1, 'Company'), anc(2, 'Product'), anc(3, 'Roadmap')]],
}

export const interPanelGap: Scenario = {
  label: 'Inter-panel gap',
  title: 'Workspace',
  panels: [nav('Outline'), focus('Alpha', 5, 0), focus('Charlie', 6, 3)],
  gaps: [[], [], [anc(10, 'Bravo')]],
}

export const deepChain: Scenario = {
  label: 'Deep multi-gap chain',
  title: 'Workspace',
  panels: [focus('Origins', 4, 0), focus('Mid-tier', 5, 2), focus('Deep leaf', 6, 4)],
  gaps: [
    [anc(1, 'Vision'), anc(2, 'Strategy'), anc(3, 'Initiatives')],
    [anc(4, 'Epic'), anc(5, 'Story')],
    [anc(6, 'Task'), anc(7, 'Subtask'), anc(8, 'Detail')],
  ],
}

export const maxColumns: Scenario = {
  label: 'Max columns (4)',
  title: 'Workspace',
  panels: [
    focus('Bravo', 5, 1),
    focus('Charlie', 5, 2),
    focus('Delta', 5, 3),
    focus('Echo', 6, 4),
  ],
  gaps: [[anc(1, 'Alpha')], [], [], []],
}

export const scenarios: Scenario[] = [
  denseGestalt,
  rootAncestors,
  interPanelGap,
  deepChain,
  maxColumns,
]

// ---------------------------------------------------------------------------
// Workspace fixture (Design/Workspace stories)
//
// The same "Reading queue" world, reshaped for full-column workspace mockups:
// each drill-down panel carries focus-panel content (title, prose, properties,
// backlinks) above its children outline, plus the id of the row that was
// drilled into to spawn the next panel (the "focus-drill" row). Gaps here are
// the true ancestor chains between consecutive panel roots (denseGestalt
// shifts them one level for tab-group density; these are the honest ones).
// ---------------------------------------------------------------------------

export type WorkspaceFocusMeta = {
  /** Fake prose paragraphs for the content editor area. */
  content: string[]
  /** Intrinsic overflow columns (the Properties strip). */
  properties: [string, string][]
  /** Backlink labels (collapsed count + expandable list). */
  backlinks: string[]
}

export type WorkspacePanel = {
  kind: 'navigation' | 'focus'
  title: string
  items: OutlineNode[]
  initialCollapsed?: ReadonlySet<string>
  /** Ancestors between the previous panel's root and this panel's row. */
  gap: OverlaidAncestor[]
  /** Row in `items` that was drilled into, spawning the next panel. */
  drillId?: string
  /** Focus-panel mockup content (drill-down columns only). */
  focus?: WorkspaceFocusMeta
}

export const workspaceTitle = 'hila'

// Extended workspace-only trees: at full-screen column height the shared
// dense-gestalt trees fit without scrolling, and the sticky machinery never
// engages. Everyday sections sit ABOVE the Research subtree so the drill row
// starts below the fold (demoing the bottom dock at rest).
const workspaceRootItems: OutlineNode[] = [
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
  ...rootItems,
]

const workspaceDdiaItems: OutlineNode[] = [
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

const workspaceCh3Items: OutlineNode[] = [
  ...ch3Items,
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

export const workspacePanels: WorkspacePanel[] = [
  {
    kind: 'navigation',
    title: workspaceTitle,
    items: workspaceRootItems,
    gap: [],
    drillId: 'rq-ddia',
  },
  {
    kind: 'focus',
    title: 'Designing Data-Intensive Applications — reading notes and quotes',
    items: workspaceDdiaItems,
    initialCollapsed: new Set(['part-2']),
    gap: [anc(1, 'Research'), anc(2, 'Reading queue'), anc(3, 'Books')],
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
    items: workspaceCh3Items,
    initialCollapsed: new Set(['ch3-quotes']),
    gap: [anc(4, 'Part I — Foundations')],
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

// ---------------------------------------------------------------------------
// PanelBody -- the shared panel renderer
//
// Renders the real presentational Outline when the panel carries items,
// falling back to the legacy em-dash lines. Styling flows through the --pb-*
// hooks (fixtures.css) so each theme variant rethemes it from its own CSS
// (e.g. Wipeout hides non-active headers per Resolution B).
// ---------------------------------------------------------------------------

export const PanelBody = (props: {
  panel: StubPanel
  active: boolean
  outlineTheme: LegacyOutlineVariant
}): JSX.Element => (
  <div class="pb-body">
    <div classList={{ 'pb-head-active': props.active, 'pb-head-inactive': !props.active }}>
      <div class="pb-head-row">
        <span class="pb-flag" />
        <span class="pb-title">{props.panel.title}</span>
      </div>
      <div class="pb-rule" />
    </div>
    <Show
      when={props.panel.items}
      fallback={
        <For each={props.panel.lines}>{(line) => <div class="pb-lines">{line}</div>}</For>
      }
    >
      {(items) => (
        <div class="pb-outline">
          <Outline
            theme={props.outlineTheme}
            items={items()}
            initialCollapsed={props.panel.initialCollapsed}
          />
        </div>
      )}
    </Show>
  </div>
)
