import { For, Show, createSignal, untrack } from 'solid-js'
import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import type { Polarity, VisualTheme } from '../tokens'

import { AnchoredOverlay, CenteredOverlay, type OverlayAnchor } from './Overlay'
import { SelectableList, type SelectableListItem } from './SelectableList'
import styles from './SelectableOverlay.stories.module.css'

const standardItems: readonly SelectableListItem[] = [
  { id: 'planning', label: 'Planning', description: 'Workspace › Roadmap', meta: '[]' },
  { id: 'research', label: 'Research notes', description: 'Workspace › Sources', meta: '@' },
  { id: 'table', label: 'New table', description: 'Create under Planning', meta: '⌘↵' },
  { id: 'tasks', label: 'Tasks', description: 'Promoted type', meta: '#' },
]

const longItems: readonly SelectableListItem[] = [
  {
    id: 'long',
    label:
      'A deliberately long result label that must truncate without moving its metadata or widening the overlay',
    description: 'Workspace › Research › Distributed systems › Storage engines › Comparisons',
    meta: '⌘↵',
  },
  {
    id: 'opaque',
    label: 'Custom SQL view',
    description: 'Not gesture-recognized',
    appearance: 'opaque',
  },
]

const unavailableItems: readonly SelectableListItem[] = [
  {
    id: 'save',
    label: 'Save as view',
    unavailableReason: 'Choose a concrete matrix and return to a place first',
    meta: '⌘S',
  },
  {
    id: 'insert',
    label: 'Insert reference',
    unavailableReason: 'Open the launcher from an editor selection',
    meta: '⌘↵',
  },
]

type ListHarnessProps = {
  items?: readonly SelectableListItem[]
  invalid?: boolean
  emptyMessage?: string
  focusOwner?: HTMLElement
  focusable?: boolean
}

const ListHarness = (props: ListHarnessProps) => {
  const initialItems = untrack(() => props.items ?? standardItems)
  const [selectedId, setSelectedId] = createSignal<string | null>(initialItems[0]?.id ?? null)
  const [message, setMessage] = createSignal('Use ↑ and ↓ to move, then Enter to activate.')
  return (
    <div class={styles.listHarness}>
      <SelectableList
        items={props.items ?? standardItems}
        selectedId={selectedId()}
        ariaLabel="Selectable results"
        invalid={props.invalid}
        emptyMessage={props.emptyMessage}
        focusOwner={props.focusOwner}
        focusable={props.focusable}
        onSelectedIdChange={setSelectedId}
        onActivate={(item) => setMessage(`Activated ${item.label}`)}
      />
      <p class={styles.feedback} aria-live="polite">
        {message()}
      </p>
    </div>
  )
}

type CenteredHarnessProps = ListHarnessProps & { tempo: 'quick' | 'deep' }

const CenteredHarness = (props: CenteredHarnessProps) => {
  const [open, setOpen] = createSignal(true)
  return (
    <div class={styles.storyFrame}>
      <button class={styles.reopen} onClick={() => setOpen(true)}>
        Open palette
      </button>
      <Show when={open()}>
        <CenteredOverlay
          ariaLabel={`${props.tempo === 'deep' ? 'Deep' : 'Quick'} palette specimen`}
          tempo={props.tempo}
          onDismiss={() => setOpen(false)}
        >
          <div class={props.tempo === 'deep' ? styles.deepContent : styles.quickContent}>
            <header class={styles.header}>
              <strong>{props.tempo === 'deep' ? 'Deep palette' : 'Quick palette'}</strong>
              <span>Shared overlay/list physics</span>
            </header>
            <ListHarness {...props} />
          </div>
        </CenteredOverlay>
      </Show>
    </div>
  )
}

const AnchoredHarness = () => {
  let invoker: HTMLInputElement | undefined
  const [open, setOpen] = createSignal(true)
  const [anchor, setAnchor] = createSignal<OverlayAnchor>({
    left: 80,
    right: 96,
    top: 72,
    bottom: 92,
  })

  const openAtInvoker = () => {
    const rect = invoker?.getBoundingClientRect()
    if (rect) setAnchor(rect)
    setOpen(true)
  }

  return (
    <div class={styles.anchoredFrame}>
      <input
        ref={invoker}
        class={styles.invoker}
        aria-label="Slash command editor"
        value="/ commands"
        readOnly
        autofocus
        onClick={openAtInvoker}
      />
      <Show when={open()}>
        <AnchoredOverlay
          anchor={anchor()}
          restoreFocusTo={invoker}
          onDismiss={() => setOpen(false)}
        >
          <ListHarness focusOwner={invoker} focusable={false} />
        </AnchoredOverlay>
      </Show>
    </div>
  )
}

const themes: readonly VisualTheme[] = ['ghost', 'null', 'wipeout']
const polarities: readonly Polarity[] = ['dark', 'light']

const ThemeMatrix = () => (
  <div class={styles.themeMatrix}>
    <For each={themes}>
      {(visualTheme) => (
        <For each={polarities}>
          {(polarity) => (
            <section
              class={styles.themeCell}
              data-theme={polarity}
              data-visual-theme={visualTheme}
              aria-label={`${visualTheme}, ${polarity}`}
            >
              <header>
                {visualTheme} · {polarity}
              </header>
              <ListHarness />
            </section>
          )}
        </For>
      )}
    </For>
  </div>
)

const meta: Meta<typeof CenteredOverlay> = {
  title: 'Design/Selectable overlay',
  component: CenteredOverlay,
  parameters: { layout: 'fullscreen' },
}

export default meta

type Story = StoryObj<typeof meta>

export const QuickCentered: Story = { render: () => <CenteredHarness tempo="quick" /> }

export const DeepCentered: Story = { render: () => <CenteredHarness tempo="deep" /> }

export const CursorAnchored: Story = { render: () => <AnchoredHarness /> }

export const LongLabelsAndOpaqueRows: Story = {
  render: () => <CenteredHarness tempo="quick" items={longItems} />,
}

export const Empty: Story = {
  render: () => (
    <CenteredHarness tempo="quick" items={[]} emptyMessage="No commands match this query" />
  ),
}

export const DisabledReasons: Story = {
  render: () => <CenteredHarness tempo="quick" items={unavailableItems} />,
}

export const Invalid: Story = {
  render: () => (
    <CenteredHarness
      tempo="quick"
      invalid
      items={[
        {
          id: 'invalid',
          label: 'due < sometime',
          description: 'Enter a date or a supported relative-date phrase',
          appearance: 'invalid',
        },
      ]}
    />
  ),
}

export const NarrowViewport: Story = {
  render: () => (
    <div class={styles.narrowFrame}>
      <ListHarness items={longItems} />
    </div>
  ),
}

export const ThemeAndPolarityMatrix: Story = { render: () => <ThemeMatrix /> }

export const ReducedMotion: Story = {
  render: () => (
    <div class={styles.reducedMotion}>
      <CenteredHarness tempo="quick" />
    </div>
  ),
}
