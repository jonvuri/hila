import { For, Match, Show, Switch, createSignal, onCleanup, onMount, type JSX } from 'solid-js'
import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import type { VisualTheme } from '../tokens'
import Workspace from '../workspace/Workspace'
import { rootVisiblePanels, workspaceTitle } from '../workspace/fixtures'

import { CenteredOverlay } from './Overlay'
import {
  SelectableList,
  getSelectableListAction,
  type SelectableListItem,
} from './SelectableList'
import styles from './LauncherOverlayPrototypes.stories.module.css'

type PrototypeTempo = 'workspace' | 'quick' | 'deep'

type LauncherPrototypeProps = {
  initialTempo: PrototypeTempo
  visualTheme: VisualTheme
}

const launcherItems: readonly SelectableListItem[] = [
  { id: 'planning', label: 'Planning', description: 'Workspace › Roadmap', meta: '[]' },
  {
    id: 'research',
    label: 'Research notes',
    description: 'Workspace › Sources',
    meta: '@',
  },
  { id: 'tasks', label: 'Tasks', description: 'Promoted type', meta: '#' },
  { id: 'reading', label: 'Reading queue', description: 'Workspace › Research', meta: '≤' },
  {
    id: 'new-table',
    label: 'New table',
    description: 'Create under Planning',
    meta: '⌘↵',
  },
  { id: 'settings', label: 'Open settings', description: 'Command', meta: '>' },
]

const echoProgress = [0, 0.18, 0.4, 0.67, 1] as const

type EchoBox = {
  left: number
  top: number
  width: number
  height: number
  progress: number
}

const interpolate = (start: number, end: number, progress: number): number =>
  start + (end - start) * progress

const interpolateBox = (
  start: Omit<EchoBox, 'progress'>,
  end: Omit<EchoBox, 'progress'>,
  progress: number,
): EchoBox => ({
  left: interpolate(start.left, end.left, progress),
  top: interpolate(start.top, end.top, progress),
  width: interpolate(start.width, end.width, progress),
  height: interpolate(start.height, end.height, progress),
  progress,
})

const themeLabel = (visualTheme: VisualTheme): string =>
  `${visualTheme[0]!.toUpperCase()}${visualTheme.slice(1)}`

type LauncherSurfaceProps = {
  visualTheme: VisualTheme
  tempo: Exclude<PrototypeTempo, 'workspace'>
  query: string
  selectedId: string | null
  feedback: string
  setInput: (element: HTMLInputElement) => void
  onQueryChange: (query: string) => void
  onSelectedIdChange: (id: string) => void
  onActivate: (item: SelectableListItem) => void
  onTempoChange: (tempo: Exclude<PrototypeTempo, 'workspace'>) => void
  onDismiss: () => void
}

const LauncherSurface = (props: LauncherSurfaceProps) => {
  const handleInputKeyDown = (event: KeyboardEvent) => {
    const action = getSelectableListAction(launcherItems, props.selectedId, event.key)
    if (!action) return
    event.preventDefault()
    if (action.type === 'select') {
      props.onSelectedIdChange(action.id)
      return
    }
    const item = launcherItems.find(({ id }) => id === action.id)
    if (item && !item.unavailableReason) props.onActivate(item)
  }

  const listId = () => `launcher-${props.visualTheme}-${props.tempo}-results`
  const activeDescendant = () =>
    props.selectedId === null ?
      undefined
    : `${listId()}-option-${encodeURIComponent(props.selectedId)}`

  return (
    <div class={styles.launcherSurface}>
      <div
        class={styles.queryRow}
        style={{ '--cursor-index': `${props.query.length}` } as JSX.CSSProperties}
      >
        <input
          ref={props.setInput}
          id={`${listId()}-input`}
          name="launcher-query"
          class={styles.queryInput}
          classList={{ [styles.wipeoutQueryInput!]: props.visualTheme === 'wipeout' }}
          aria-label="Search places and commands"
          aria-autocomplete="list"
          aria-controls={listId()}
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-activedescendant={activeDescendant()}
          value={props.query}
          placeholder={
            props.visualTheme === 'wipeout' ? undefined : 'Search places and commands…'
          }
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          onKeyDown={handleInputKeyDown}
        />
        <Show when={props.visualTheme === 'wipeout'}>
          <span class={styles.blockCursor} aria-hidden="true" />
        </Show>
      </div>

      <div class={styles.launcherList}>
        <SelectableList
          id={listId()}
          items={launcherItems}
          selectedId={props.selectedId}
          ariaLabel="Launcher results"
          focusable={false}
          onSelectedIdChange={props.onSelectedIdChange}
          onActivate={props.onActivate}
        />
      </div>

      <footer class={styles.launcherFooter}>
        <span class={styles.origin}>hila › Research</span>
        <span class={styles.feedback} aria-live="polite">
          {props.feedback}
        </span>
        <span class={styles.keyboardHint}>↑↓ select · ↵ open · Esc close</span>
        <button
          class={styles.tempoButton}
          type="button"
          onClick={() => props.onTempoChange(props.tempo === 'quick' ? 'deep' : 'quick')}
        >
          {props.tempo === 'quick' ? 'Fill viewport' : 'Return to quick'}
        </button>
        <button class={styles.dismissButton} type="button" onClick={() => props.onDismiss()}>
          Close
        </button>
      </footer>
    </div>
  )
}

type WipeoutOverlayProps = {
  tempo: Exclude<PrototypeTempo, 'workspace'>
  initialFocus: () => HTMLInputElement | undefined
  onDismiss: () => void
  children: JSX.Element
}

const WipeoutOverlay = (props: WipeoutOverlayProps) => {
  let dialog: HTMLDialogElement | undefined
  let echoLayer: HTMLDivElement | undefined
  let quickGeometryProbe: HTMLDivElement | undefined
  let previousFocus: HTMLElement | null = null
  const [echoBoxes, setEchoBoxes] = createSignal<readonly EchoBox[]>([])

  const measureEchoBoxes = (tempo: WipeoutOverlayProps['tempo']) => {
    if (!dialog || !echoLayer) return
    const layerBounds = echoLayer.getBoundingClientRect()
    const endingBox = {
      left: 0,
      top: 0,
      width: layerBounds.width,
      height: layerBounds.height,
    }
    let startingBounds: DOMRect | undefined

    if (tempo === 'quick') {
      const workspaceTitle = document.querySelector<HTMLElement>('.ws-workspace-title')
      if (workspaceTitle?.firstChild) {
        const titleBounds = workspaceTitle.getBoundingClientRect()
        const markStyle = getComputedStyle(workspaceTitle, '::before')
        const titleStyle = getComputedStyle(workspaceTitle)
        const titleRange = document.createRange()
        titleRange.selectNodeContents(workspaceTitle)
        const textBounds = titleRange.getBoundingClientRect()
        const markLeft = titleBounds.left + Number.parseFloat(markStyle.left)
        const markTop = titleBounds.top + Number.parseFloat(markStyle.top)
        const originInset = Number.parseFloat(titleStyle.getPropertyValue('--space-8'))
        const contentLeft = Math.min(markLeft, textBounds.left)
        const contentTop = Math.min(markTop, textBounds.top)
        const contentRight = Math.max(
          markLeft + Number.parseFloat(markStyle.width),
          textBounds.right,
        )
        const contentBottom = Math.max(
          markTop + Number.parseFloat(markStyle.height),
          textBounds.bottom,
        )
        startingBounds = new DOMRect(
          contentLeft - originInset,
          contentTop - originInset,
          contentRight - contentLeft + 2 * originInset,
          contentBottom - contentTop + 2 * originInset,
        )
      }
    } else {
      startingBounds = quickGeometryProbe?.getBoundingClientRect()
    }

    if (!startingBounds) return
    const startingBox = {
      left: startingBounds.left - layerBounds.left,
      top: startingBounds.top - layerBounds.top,
      width: startingBounds.width,
      height: startingBounds.height,
    }
    setEchoBoxes(
      echoProgress.map((progress) => interpolateBox(startingBox, endingBox, progress)),
    )
  }

  onMount(() => {
    const tempo = props.tempo
    const focusTarget = props.initialFocus()
    previousFocus = document.activeElement as HTMLElement | null
    dialog?.showModal()
    queueMicrotask(() => {
      measureEchoBoxes(tempo)
      focusTarget?.focus({ preventScroll: true })
    })
  })

  onCleanup(() => {
    if (dialog?.open) dialog.close()
    queueMicrotask(() => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    })
  })

  return (
    <dialog
      ref={dialog}
      class={`${styles.wipeoutDialog} ${
        props.tempo === 'deep' ? styles.wipeoutDeep : styles.wipeoutQuick
      }`}
      aria-label={`${props.tempo === 'deep' ? 'Deep' : 'Quick'} launcher prototype`}
      onCancel={(event) => {
        event.preventDefault()
        props.onDismiss()
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget || !dialog) return
        const bounds = dialog.getBoundingClientRect()
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        if (outside) props.onDismiss()
      }}
    >
      <div ref={quickGeometryProbe} class={styles.quickGeometryProbe} aria-hidden="true" />
      {props.children}
      <div ref={echoLayer} class={styles.echoes} aria-hidden="true">
        <For each={echoBoxes()}>
          {(box) => (
            <span
              class={styles.echoFrame}
              data-echo-progress={box.progress}
              style={{
                left: `${box.left}px`,
                top: `${box.top}px`,
                width: `${box.width}px`,
                height: `${box.height}px`,
              }}
            />
          )}
        </For>
      </div>
    </dialog>
  )
}

const LauncherPrototype = (props: LauncherPrototypeProps) => {
  let input: HTMLInputElement | undefined
  const [tempo, setTempo] = createSignal<PrototypeTempo>(props.initialTempo)
  const [query, setQuery] = createSignal('')
  const [selectedId, setSelectedId] = createSignal<string | null>(launcherItems[0]!.id)
  const [feedback, setFeedback] = createSignal('Ready')

  const dismiss = () => setTempo('workspace')
  const activate = (item: SelectableListItem) => setFeedback(`Selected ${item.label}`)

  const surface = (currentTempo: Exclude<PrototypeTempo, 'workspace'>) => (
    <LauncherSurface
      visualTheme={props.visualTheme}
      tempo={currentTempo}
      query={query()}
      selectedId={selectedId()}
      feedback={feedback()}
      setInput={(element) => {
        input = element
      }}
      onQueryChange={setQuery}
      onSelectedIdChange={setSelectedId}
      onActivate={activate}
      onTempoChange={setTempo}
      onDismiss={dismiss}
    />
  )

  onMount(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setTempo((current) => (current === 'workspace' ? 'quick' : 'workspace'))
    }
    window.addEventListener('keydown', handleShortcut)
    onCleanup(() => window.removeEventListener('keydown', handleShortcut))
  })

  return (
    <main
      class={styles.prototype}
      data-visual-theme={props.visualTheme}
      aria-label={`${themeLabel(props.visualTheme)} launcher overlay prototype`}
    >
      <div
        class={styles.workspaceLayer}
        aria-hidden={tempo() === 'workspace' ? undefined : 'true'}
      >
        <Workspace panels={rootVisiblePanels} workspaceTitle={workspaceTitle} />
      </div>

      <nav
        class={styles.storyControls}
        classList={{ [styles.storyControlsHidden!]: tempo() !== 'workspace' }}
        aria-label="Prototype states"
        aria-hidden={tempo() === 'workspace' ? undefined : 'true'}
        inert={tempo() === 'workspace' ? undefined : true}
      >
        <span>{themeLabel(props.visualTheme)}</span>
        <button
          type="button"
          aria-current={tempo() === 'workspace' ? 'page' : undefined}
          onClick={dismiss}
        >
          Workspace
        </button>
        <button
          type="button"
          aria-current={tempo() === 'quick' ? 'page' : undefined}
          onClick={() => setTempo('quick')}
        >
          Quick
        </button>
        <button
          type="button"
          aria-current={tempo() === 'deep' ? 'page' : undefined}
          onClick={() => setTempo('deep')}
        >
          Deep
        </button>
      </nav>

      <Switch>
        <Match when={tempo() === 'quick'}>
          <Show
            when={props.visualTheme === 'wipeout'}
            fallback={
              <CenteredOverlay
                class={styles.centeredOverlay}
                ariaLabel="Quick launcher prototype"
                tempo="quick"
                initialFocus={() => input}
                onDismiss={dismiss}
              >
                {surface('quick')}
              </CenteredOverlay>
            }
          >
            <WipeoutOverlay tempo="quick" initialFocus={() => input} onDismiss={dismiss}>
              {surface('quick')}
            </WipeoutOverlay>
          </Show>
        </Match>
        <Match when={tempo() === 'deep'}>
          <Show
            when={props.visualTheme === 'wipeout'}
            fallback={
              <CenteredOverlay
                class={styles.centeredOverlay}
                ariaLabel="Deep launcher prototype"
                tempo="deep"
                initialFocus={() => input}
                onDismiss={dismiss}
              >
                {surface('deep')}
              </CenteredOverlay>
            }
          >
            <WipeoutOverlay tempo="deep" initialFocus={() => input} onDismiss={dismiss}>
              {surface('deep')}
            </WipeoutOverlay>
          </Show>
        </Match>
      </Switch>
    </main>
  )
}

const meta = {
  title: 'Design/Launcher overlay prototypes',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Session 4A compares the workspace, Quick, and Deep states in each theme. Ghost and Null preserve centered modal geometry. Wipeout tests a top-left anchor, full-viewport Deep state, and post-facto border echoes.',
      },
    },
  },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const story = (
  visualTheme: VisualTheme,
  initialTempo: PrototypeTempo,
  description: string,
): Story => ({
  render: () => <LauncherPrototype visualTheme={visualTheme} initialTempo={initialTempo} />,
  globals: { visualTheme },
  parameters: { docs: { description: { story: description } } },
})

export const GhostWorkspace = story(
  'ghost',
  'workspace',
  'The Ghost workspace uses the darker candidate surface roles without changing production tokens.',
)

export const GhostQuick = story(
  'ghost',
  'quick',
  'Ghost keeps the approved centered Quick modal while testing black surfaces separated by borders.',
)

export const GhostDeep = story(
  'ghost',
  'deep',
  'Ghost keeps the approved large centered Deep modal and the darker candidate surface treatment.',
)

export const NullWorkspace = story(
  'null',
  'workspace',
  'Null retains the conventional workspace treatment.',
)

export const NullQuick = story(
  'null',
  'quick',
  'Null retains the approved centered Quick modal.',
)

export const NullDeep = story(
  'null',
  'deep',
  'Null retains the approved large centered Deep modal.',
)

export const WipeoutWorkspace = story(
  'wipeout',
  'workspace',
  'The unboxed hila header and its aligned accent rule mark the launcher origin over black surfaces.',
)

export const WipeoutQuick = story(
  'wipeout',
  'quick',
  'Quick appears instantly at the top-left anchor. Five measured grey echoes accelerate subtly from the hila header region after the state is already usable.',
)

export const WipeoutDeep = story(
  'wipeout',
  'deep',
  'Deep fills the viewport immediately. Measured grey echoes expand from the responsive Quick box without delaying the completed state.',
)
