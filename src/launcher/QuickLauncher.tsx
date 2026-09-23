import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
  type JSX,
} from 'solid-js'

import {
  commandRegistry,
  type CommandInvocationCapabilities,
  type CommandInvocationContext,
} from '../command-registry'
import type { PlaceNavigationTarget } from '../core/place-navigation'
import { CenteredOverlay } from '../design/overlay/Overlay'
import {
  SelectableList,
  getInitialSelectableListId,
  getSelectableListAction,
} from '../design/overlay/SelectableList'
import type { VisualTheme } from '../design/tokens'
import { createWorkspaceDiscoveryService } from '../discovery/workspace-discovery'
import type {
  DiscoveryRequest,
  DiscoveryResult,
  DiscoverySearchOutcome,
} from '../discovery/types'
import { outlineShortcutDescriptors } from '../editor/keymap'
import {
  collectShortcutDescriptors,
  displayShortcutKey,
  getShortcutPlatform,
  shortcuts,
} from '../shortcuts'

import { createLauncherEchoBoxes, type LauncherEchoBox } from './echo'
import type { LauncherInvocation } from './invocation'
import {
  buildLauncherItems,
  launcherFamilyForToken,
  launcherFamilies,
  launcherInteractionShortcutDescriptors,
  navigationTargetForLauncherItem,
  splitLauncherInput,
  type LauncherFamilyFilter,
  type LauncherListItem,
} from './model'
import styles from './QuickLauncher.module.css'

export type LauncherDiscoveryService = {
  search: (request: DiscoveryRequest) => Promise<DiscoverySearchOutcome>
  cancel: () => void
}

export type QuickLauncherProps = {
  rootMatrixId: number | null
  visualTheme: VisualTheme
  invocation: LauncherInvocation
  commandCapabilities?: CommandInvocationCapabilities
  discoveryService?: LauncherDiscoveryService
  runCommand?: (id: string, context: CommandInvocationContext) => Promise<void>
  onNavigate: (target: PlaceNavigationTarget) => void
  onDismiss: () => void
}

const WipeoutQuickEchoes = () => {
  let layer: HTMLDivElement | undefined
  let frame = 0
  const [boxes, setBoxes] = createSignal<readonly LauncherEchoBox[]>([])

  const measure = () => {
    if (!layer) return
    const mark = document.querySelector<HTMLElement>('[data-launcher-workspace-mark]')
    const title = document.querySelector<HTMLElement>('[data-launcher-workspace-title]')
    const layerBounds = layer.getBoundingClientRect()
    if (!mark || !title || layerBounds.width === 0 || layerBounds.height === 0) return

    const markBounds = mark.getBoundingClientRect()
    const titleBounds = title.getBoundingClientRect()
    const inset = Number.parseFloat(getComputedStyle(layer).getPropertyValue('--space-8')) || 8
    const left = Math.min(markBounds.left, titleBounds.left) - inset
    const top = Math.min(markBounds.top, titleBounds.top) - inset
    const right = Math.max(markBounds.right, titleBounds.right) + inset
    const bottom = Math.max(markBounds.bottom, titleBounds.bottom) + inset
    setBoxes(
      createLauncherEchoBoxes(
        {
          left: left - layerBounds.left,
          top: top - layerBounds.top,
          width: right - left,
          height: bottom - top,
        },
        { left: 0, top: 0, width: layerBounds.width, height: layerBounds.height },
      ),
    )
  }

  onMount(() => {
    frame = requestAnimationFrame(measure)
  })
  onCleanup(() => cancelAnimationFrame(frame))

  return (
    <div ref={layer} class={styles.echoes} data-testid="launcher-echoes" aria-hidden="true">
      <For each={boxes()}>
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
  )
}

const QuickLauncher = (props: QuickLauncherProps) => {
  const context: CommandInvocationContext = {
    surface: 'launcher',
    subject: untrack(() => props.invocation.subject),
    capabilities: { ...untrack(() => props.commandCapabilities) },
  }
  const discovery =
    untrack(() => props.discoveryService) ??
    createWorkspaceDiscoveryService({
      commandContext: () => context,
    })
  const invokeCommand = untrack(() => props.runCommand) ?? commandRegistry.invoke
  const [query, setQuery] = createSignal('')
  const [filter, setFilter] = createSignal<LauncherFamilyFilter | null>(null)
  const [rawResults, setRawResults] = createSignal<DiscoveryResult[]>([])
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [helpOpen, setHelpOpen] = createSignal(false)
  const [restoreInvoker, setRestoreInvoker] = createSignal(true)
  const [cursorIndex, setCursorIndex] = createSignal(0)
  const [input, setInput] = createSignal<HTMLInputElement>()
  let searchGeneration = 0

  const searchActive = () => filter() !== null || query().trim().length > 0
  const items = createMemo(() =>
    buildLauncherItems({
      results: rawResults(),
      query: query(),
      filter: filter(),
      subjectLabel: props.invocation.subjectLabel,
    }),
  )
  const activeFilter = createMemo(() =>
    launcherFamilies.find((family) => family.filter === filter()),
  )
  const listId = 'quick-launcher-results'
  const shortcutGuide = collectShortcutDescriptors(
    shortcuts.getDescriptors(),
    outlineShortcutDescriptors,
    launcherInteractionShortcutDescriptors,
  )
  const commandGuide = commandRegistry.entries(context)
  const platform = getShortcutPlatform()

  createEffect(() => {
    const rootMatrixId = props.rootMatrixId
    const requestedQuery = query()
    const requestedFilter = filter()
    const showingHelp = helpOpen()
    const generation = ++searchGeneration

    if (showingHelp || (!requestedFilter && !requestedQuery.trim()) || rootMatrixId == null) {
      discovery.cancel()
      batch(() => {
        setRawResults([])
        setLoading(false)
      })
      return
    }

    batch(() => {
      setRawResults([])
      setLoading(true)
    })
    void discovery
      .search({
        rootMatrixId,
        query: requestedQuery,
        filter: requestedFilter ?? 'all',
        limit: 12,
      })
      .then((outcome) => {
        if (generation !== searchGeneration || outcome.status === 'stale') return
        batch(() => {
          setRawResults([...outcome.results])
          setLoading(false)
        })
      })
      .catch(() => {
        if (generation !== searchGeneration) return
        batch(() => {
          setRawResults([])
          setLoading(false)
        })
      })
  })

  createEffect(() => {
    const nextItems = items()
    setSelectedId((current) => getInitialSelectableListId(nextItems, current))
  })

  onCleanup(() => {
    searchGeneration += 1
    discovery.cancel()
  })

  const dismiss = () => {
    discovery.cancel()
    props.onDismiss()
  }

  const applyFilter = (nextFilter: LauncherFamilyFilter, clearQuery: boolean) => {
    batch(() => {
      setHelpOpen(false)
      setFilter(nextFilter)
      if (clearQuery) {
        setQuery('')
        setCursorIndex(0)
      }
    })
    queueMicrotask(() => untrack(input)?.focus({ preventScroll: true }))
  }

  const activate = (item: LauncherListItem) => {
    if (item.kind === 'family') {
      applyFilter(item.filter, true)
      return
    }

    if (item.result.family === 'command') {
      void invokeCommand(item.result.commandId, context).catch((error: unknown) => {
        console.error('launcher command failed', error)
      })
      dismiss()
      return
    }

    const target = navigationTargetForLauncherItem(item)
    if (!target) return
    setRestoreInvoker(false)
    props.onNavigate(target)
    dismiss()
  }

  const syncCursor = (element: HTMLInputElement) => {
    setCursorIndex(element.selectionStart ?? element.value.length)
  }

  const handleInput = (element: HTMLInputElement) => {
    const parsed = splitLauncherInput(element.value)
    batch(() => {
      setHelpOpen(false)
      if (parsed.filter) setFilter(parsed.filter)
      setQuery(parsed.query)
      setCursorIndex(element.selectionStart ?? parsed.query.length)
    })
  }

  const handleInputKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return
    const element = event.currentTarget as HTMLInputElement
    const atStart = element.selectionStart === 0 && element.selectionEnd === 0

    if (event.key === '?' && !filter() && !query() && atStart) {
      event.preventDefault()
      setHelpOpen(true)
      return
    }

    const family = launcherFamilyForToken(event.key)
    if (family && atStart) {
      event.preventDefault()
      applyFilter(family.filter, false)
      return
    }

    if (event.key === 'Backspace' && filter() && atStart) {
      event.preventDefault()
      setFilter(null)
      return
    }

    if (event.key === 'Tab') {
      const selectedItem = items().find((item) => item.id === selectedId())
      if (selectedItem?.kind === 'family') {
        event.preventDefault()
        activate(selectedItem)
        return
      }
    }

    const action = getSelectableListAction(items(), selectedId(), event.key)
    if (!action) return
    event.preventDefault()
    if (action.type === 'select') {
      setSelectedId(action.id)
      return
    }
    const item = items().find((candidate) => candidate.id === action.id)
    if (item && !item.unavailableReason) activate(item)
  }

  const countAnnouncement = () => {
    if (!searchActive() || helpOpen()) return ''
    if (loading()) return 'Searching places and commands.'
    return `${items().length} ${items().length === 1 ? 'result' : 'results'}.`
  }

  return (
    <CenteredOverlay
      class={`${styles.overlay} ${props.visualTheme === 'wipeout' ? styles.wipeoutOverlay : styles.centeredOverlay}`}
      ariaLabel="Quick launcher"
      tempo="quick"
      initialFocus={input}
      restoreFocusTo={props.invocation.focusElement}
      restoreFocus={restoreInvoker()}
      onDismiss={dismiss}
      testId="quick-launcher"
    >
      <section
        class={styles.surface}
        data-launcher-theme={props.visualTheme}
        data-filter={filter() ?? undefined}
      >
        <div
          class={styles.queryRow}
          style={
            {
              '--launcher-cursor-index': `${cursorIndex() + (filter() ? 2 : 0)}`,
            } as JSX.CSSProperties
          }
        >
          <Show when={activeFilter()}>
            {(family) => (
              <button
                type="button"
                class={styles.filterToken}
                aria-label={`Remove ${family().label.toLowerCase()} filter`}
                onClick={() => {
                  setFilter(null)
                  input()?.focus({ preventScroll: true })
                }}
              >
                {family().token}
              </button>
            )}
          </Show>
          <input
            ref={setInput}
            id="quick-launcher-input"
            name="quick-launcher-query"
            class={styles.queryInput}
            aria-label="Search places and commands"
            value={query()}
            placeholder="Search places and commands…"
            onInput={(event) => handleInput(event.currentTarget)}
            onKeyDown={handleInputKeyDown}
            onKeyUp={(event) => syncCursor(event.currentTarget)}
            onClick={(event) => syncCursor(event.currentTarget)}
            onSelect={(event) => syncCursor(event.currentTarget)}
          />
          <Show when={props.visualTheme === 'wipeout'}>
            <span
              class={styles.blockCursor}
              data-testid="launcher-block-cursor"
              aria-hidden="true"
            />
          </Show>
        </div>

        <div class={styles.body}>
          <Show
            when={!helpOpen()}
            fallback={
              <div class={styles.guide} data-testid="launcher-guide">
                <section>
                  <h2>Keyboard</h2>
                  <dl>
                    <For each={shortcutGuide}>
                      {(shortcut) => (
                        <>
                          <dt>{displayShortcutKey(shortcut.key, platform)}</dt>
                          <dd>{shortcut.title}</dd>
                        </>
                      )}
                    </For>
                  </dl>
                </section>
                <section>
                  <h2>Commands</h2>
                  <ul>
                    <For each={commandGuide}>
                      {(entry) => (
                        <li>
                          <span>{entry.command.label}</span>
                          <Show when={entry.unavailableReason}>
                            <small>{entry.unavailableReason}</small>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </div>
            }
          >
            <Show
              when={searchActive()}
              fallback={
                <div class={styles.emptyState} data-testid="launcher-empty-state">
                  <section>
                    <h2>Jump back</h2>
                    <p>Places visited this session will appear here.</p>
                  </section>
                  <section>
                    <h2>Recent deep searches</h2>
                    <p>Deep searches will appear here.</p>
                  </section>
                </div>
              }
            >
              <SelectableList
                id={listId}
                items={items()}
                selectedId={selectedId()}
                ariaLabel="Launcher results"
                emptyMessage={loading() ? 'Searching…' : 'No matching places or commands'}
                focusable={false}
                focusOwner={input()}
                onSelectedIdChange={(id) => setSelectedId(id)}
                onActivate={activate}
                onMarkActivate={(item) => applyFilter(item.filter, false)}
              />
            </Show>
          </Show>
        </div>

        <footer class={styles.footer}>
          <span class={styles.origin}>{props.invocation.subjectLabel ?? 'Workspace'}</span>
          <span class={styles.keyboardHint}>↑↓ select · ↵ open · Esc close</span>
          <button
            type="button"
            class={styles.helpButton}
            onClick={() => setHelpOpen((open) => !open)}
          >
            ? guide
          </button>
        </footer>

        <div class={styles.status} role="status" aria-live="polite" aria-atomic="true">
          {countAnnouncement()}
        </div>
        <Show when={props.visualTheme === 'wipeout'}>
          <WipeoutQuickEchoes />
        </Show>
      </section>
    </CenteredOverlay>
  )
}

export default QuickLauncher
