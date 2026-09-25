import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For } from 'solid-js'

import RetiredSurfaceReference, {
  type RetiredTableState,
  type RetiredTagsState,
} from './RetiredSurfaceReference'

type StoryArgs = {
  surface: 'table' | 'tags'
  state: RetiredTableState | RetiredTagsState
  viewportWidth: 1180 | 500 | 390
}

const tableStates: readonly RetiredTableState[] = ['schema', 'cells', 'sorted', 'editing']
const tagsStates: readonly RetiredTagsState[] = ['list', 'instances', 'create', 'context']

const Reference = (props: StoryArgs) => (
  <main style={{ width: `${props.viewportWidth}px`, 'max-width': '100%' }}>
    {props.surface === 'table' ?
      <RetiredSurfaceReference surface="table" state={props.state as RetiredTableState} />
    : <RetiredSurfaceReference surface="tags" state={props.state as RetiredTagsState} />}
  </main>
)

const meta: Meta<StoryArgs> = {
  title: 'References/Retired top-level surfaces',
  args: { surface: 'table', state: 'schema', viewportWidth: 1180 },
  argTypes: {
    surface: { control: 'inline-radio', options: ['table', 'tags'] },
    state: { control: 'select', options: [...tableStates, ...tagsStates] },
    viewportWidth: { control: 'inline-radio', options: [1180, 500, 390] },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Static, fixture-driven evidence for the Table and Tags roots retired in Phase 12 Session 10. These references do not initialize the SQLite worker or represent current navigation.',
      },
    },
  },
  render: (args) => <Reference {...args} />,
}

export default meta

type Story = StoryObj<StoryArgs>

export const TableStates: Story = {
  name: 'Table · schema, cells, sort, and edit',
  render: () => (
    <main style={{ display: 'grid', gap: 'var(--space-32)', padding: 'var(--space-16)' }}>
      <For each={tableStates}>
        {(state) => (
          <section>
            <h2>{state}</h2>
            <RetiredSurfaceReference surface="table" state={state} />
          </section>
        )}
      </For>
    </main>
  ),
}

export const TagsStates: Story = {
  name: 'Tags · list, counts, instances, create, and context',
  render: () => (
    <main style={{ display: 'grid', gap: 'var(--space-32)', padding: 'var(--space-16)' }}>
      <For each={tagsStates}>
        {(state) => (
          <section>
            <h2>{state}</h2>
            <RetiredSurfaceReference surface="tags" state={state} />
          </section>
        )}
      </For>
    </main>
  ),
}

export const NarrowReferences: Story = {
  name: 'Narrow · 390 px',
  render: () => (
    <main
      style={{ display: 'grid', gap: 'var(--space-32)', width: '390px', 'max-width': '100%' }}
    >
      <RetiredSurfaceReference surface="table" state="editing" />
      <RetiredSurfaceReference surface="tags" state="context" />
    </main>
  ),
}

const themePairs = [
  ['ghost', 'dark'],
  ['ghost', 'light'],
  ['null', 'dark'],
  ['null', 'light'],
  ['wipeout', 'dark'],
  ['wipeout', 'light'],
] as const

export const ThemeAndPolarityMatrix: Story = {
  name: 'All themes and polarities',
  render: () => (
    <main style={{ display: 'grid', gap: 'var(--space-32)', padding: 'var(--space-16)' }}>
      <For each={themePairs}>
        {([visualTheme, polarity]) => (
          <section
            data-theme={polarity}
            data-visual-theme={visualTheme}
            style={{
              display: 'grid',
              gap: 'var(--space-16)',
              padding: 'var(--space-16)',
              color: 'var(--color-text)',
              background: 'var(--color-canvas)',
            }}
          >
            <h2>
              {visualTheme} · {polarity}
            </h2>
            <div
              style={{
                display: 'grid',
                gap: 'var(--space-16)',
                'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
              }}
            >
              <RetiredSurfaceReference surface="table" state="sorted" />
              <RetiredSurfaceReference surface="tags" state="instances" />
            </div>
          </section>
        )}
      </For>
    </main>
  ),
}
