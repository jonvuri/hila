import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  type Component,
} from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'
import type { PlaceNavigationTarget } from '../core/place-navigation'
import { addObserver, removeObserver } from '../core/client/sql-client'
import type { SqlObserver, SqlQuery, SqlResult } from '../core/sql-types'
import { extractTextFromPmDoc } from '../core/pm-text'
import type { QueryPlan } from '../sql/query-spec/types'
import ScrollVirtualizer, {
  type ScrollVirtualizerHandle,
} from '../virtualizer/ScrollVirtualizer'

import {
  DEEP_PREVIEW_PAGE_SIZE,
  DEEP_PREVIEW_SEMANTIC_LIMIT,
  buildDeepPreviewCountRequest,
  buildDeepPreviewRangeRequest,
  computeDeepPreviewWindowRange,
} from './deep-preview'
import styles from './DeepPreview.module.css'

const ROW_HEIGHT_PX = 40
const MAX_LABEL_CHARACTERS = 240
const MAX_CELL_CHARACTERS = 160

type PreviewRows = {
  readonly offset: number
  readonly rows: SqlResult
}

type ActiveSubscription = {
  readonly request: SqlQuery
  readonly observer: SqlObserver
}

export type DeepPreviewProps = {
  plan: QueryPlan | null
  matrixId: number | null
  columns: readonly ColumnDefinition[]
  /** Label plus predicate/order columns, already deduplicated into display order. */
  presentationColumns: readonly ColumnDefinition[]
  focusOwner?: HTMLInputElement
  active: boolean
  suspended?: boolean
  invalidReason?: string | null
  loadingReason?: string | null
  onNavigate: (target: PlaceNavigationTarget) => void
}

const boundedText = (value: unknown, limit: number): string => {
  const text =
    value instanceof Uint8Array ?
      Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
    : String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

const displayCellText = (column: ColumnDefinition, value: unknown): string =>
  column.role !== null || column.displayType === 'richtext' ?
    extractTextFromPmDoc(value)
  : boundedText(value, 2_000)

const countRows = (result: SqlResult): number => {
  const value = result[0]?.row_count
  const count = typeof value === 'bigint' ? Number(value) : Number(value ?? 0)
  if (!Number.isFinite(count) || count < 0) throw new Error('Preview count is invalid')
  return Math.min(DEEP_PREVIEW_SEMANTIC_LIMIT, Math.floor(count))
}

const optionId = (listId: string, matrixId: number, rowId: number): string =>
  `${listId}-option-${matrixId}-${rowId}`

const rowIdOf = (row: SqlResult[number] | undefined): number | null => {
  const rowId = Number(row?.id)
  return Number.isSafeInteger(rowId) && rowId > 0 ? rowId : null
}

const DeepPreview: Component<DeepPreviewProps> = (props) => {
  const generatedId = createUniqueId()
  const listId = `deep-preview-${generatedId}`
  const [totalRows, setTotalRows] = createSignal<number | null>(null)
  const [previewRows, setPreviewRows] = createSignal<PreviewRows>({ offset: 0, rows: [] })
  const [retainedPages, setRetainedPages] = createSignal<ReadonlySet<number>>(new Set([0]))
  const [countLoading, setCountLoading] = createSignal(false)
  const [rangeLoading, setRangeLoading] = createSignal(false)
  const [queryError, setQueryError] = createSignal<Error | null>(null)
  const [selectedIndex, setSelectedIndex] = createSignal<number | null>(null)
  let virtualizer: ScrollVirtualizerHandle | undefined
  let countSubscription: ActiveSubscription | null = null
  let rangeSubscription: ActiveSubscription | null = null
  let countGeneration = 0
  let rangeGeneration = 0

  const updateRetainedPages = (pages: ReadonlySet<number>): void => {
    setRetainedPages((current) => {
      if (current.size !== pages.size) return new Set(pages)
      for (const page of pages) if (!current.has(page)) return new Set(pages)
      return current
    })
  }

  const runnable = (): boolean =>
    props.active &&
    !props.invalidReason &&
    !props.loadingReason &&
    props.plan !== null &&
    props.matrixId !== null

  const removeCountSubscription = (): void => {
    if (!countSubscription) return
    removeObserver(countSubscription.request, countSubscription.observer)
    countSubscription = null
  }

  const removeRangeSubscription = (): void => {
    if (!rangeSubscription) return
    removeObserver(rangeSubscription.request, rangeSubscription.observer)
    rangeSubscription = null
  }

  createEffect(() => {
    const plan = props.plan
    const canRun = runnable()
    const generation = ++countGeneration

    if (!canRun || !plan) {
      batch(() => {
        setTotalRows(null)
        setPreviewRows({ offset: 0, rows: [] })
        setRetainedPages(new Set([0]))
        setSelectedIndex(null)
        setQueryError(null)
        setCountLoading(false)
        setRangeLoading(false)
      })
      removeCountSubscription()
      removeRangeSubscription()
      return
    }

    batch(() => {
      setPreviewRows({ offset: 0, rows: [] })
      setRetainedPages(new Set([0]))
      setSelectedIndex(null)
      setQueryError(null)
      setCountLoading(true)
    })
    const scrollport = virtualizer?.getScrollport()
    if (scrollport) {
      scrollport.scrollTop = 0
      scrollport.dispatchEvent(new Event('scroll'))
    }

    const request = buildDeepPreviewCountRequest(plan)
    const observer: SqlObserver = (result, error) => {
      if (generation !== countGeneration) return
      if (error) {
        batch(() => {
          setTotalRows(null)
          setCountLoading(false)
          setQueryError(error)
        })
        return
      }
      if (!result) return
      try {
        const nextTotal = countRows(result)
        batch(() => {
          setTotalRows(nextTotal)
          setSelectedIndex(nextTotal > 0 ? 0 : null)
          setCountLoading(false)
          setQueryError(null)
        })
      } catch (countError) {
        batch(() => {
          setTotalRows(null)
          setCountLoading(false)
          setQueryError(
            countError instanceof Error ? countError : new Error(String(countError)),
          )
        })
      }
    }

    // Attach first so value-only changes keep the worker's prepared template alive.
    addObserver(request, observer)
    removeCountSubscription()
    countSubscription = { request, observer }
  })

  createEffect(() => {
    const plan = props.plan
    const total = totalRows()
    const pages = retainedPages()
    const canRun = runnable()
    const generation = ++rangeGeneration
    const range = total === null ? null : computeDeepPreviewWindowRange(total, pages)

    if (!canRun || !plan || !range) {
      setRangeLoading(false)
      removeRangeSubscription()
      return
    }

    const request = buildDeepPreviewRangeRequest(plan, range.minPage, range.maxPage)
    const observer: SqlObserver = (result, error) => {
      if (generation !== rangeGeneration) return
      if (error) {
        batch(() => {
          setRangeLoading(false)
          setPreviewRows({ offset: range.offset, rows: [] })
          setQueryError(error)
        })
        return
      }
      if (!result) return
      batch(() => {
        setPreviewRows({ offset: range.offset, rows: result.slice(0, range.limit) })
        setRangeLoading(false)
        setQueryError(null)
      })
    }

    setRangeLoading(true)
    addObserver(request, observer)
    removeRangeSubscription()
    rangeSubscription = { request, observer }
  })

  onCleanup(() => {
    countGeneration += 1
    rangeGeneration += 1
    removeCountSubscription()
    removeRangeSubscription()
  })

  const labelColumn = createMemo(() => props.columns.find((column) => column.role === 'label'))
  const detailColumns = createMemo(() => {
    const label = labelColumn()
    const seen = new Set<number>()
    return props.presentationColumns.filter((column) => {
      if (
        column.name.toLowerCase() === 'id' ||
        column.id === label?.id ||
        seen.has(column.id)
      ) {
        return false
      }
      seen.add(column.id)
      return true
    })
  })

  const rowAt = (index: number): SqlResult[number] | undefined => {
    const current = previewRows()
    return current.rows[index - current.offset]
  }

  const selectedRow = createMemo(() => {
    const index = selectedIndex()
    return index === null ? undefined : rowAt(index)
  })
  const selectedOptionId = createMemo(() => {
    const matrixId = props.matrixId
    const rowId = rowIdOf(selectedRow())
    return matrixId === null || rowId === null ? null : optionId(listId, matrixId, rowId)
  })

  const navigateTo = (row: SqlResult[number] | undefined): void => {
    const matrixId = props.matrixId
    const rowId = rowIdOf(row)
    if (matrixId === null || rowId === null) return
    props.onNavigate({ type: 'node', node: { matrixId, rowId } })
  }

  const revealSelection = (index: number): void => {
    const selectedId = selectedOptionId()
    queueMicrotask(() => {
      const option = selectedId ? document.getElementById(selectedId) : null
      if (option) {
        option.scrollIntoView?.({ block: 'nearest' })
        return
      }
      const scrollport = virtualizer?.getScrollport()
      if (!scrollport) return
      scrollport.scrollTop = index * ROW_HEIGHT_PX
      scrollport.dispatchEvent(new Event('scroll'))
    })
  }

  const moveSelection = (nextIndex: number): void => {
    const total = totalRows() ?? 0
    if (total === 0) return
    const bounded = Math.max(0, Math.min(total - 1, nextIndex))
    setSelectedIndex(bounded)
    revealSelection(bounded)
  }

  createEffect(() => {
    const owner = props.active && !props.suspended ? props.focusOwner : undefined
    if (!owner) return
    const previous = new Map(
      [
        'aria-activedescendant',
        'aria-controls',
        'aria-expanded',
        'aria-haspopup',
        'aria-autocomplete',
      ].map((name) => [name, owner.getAttribute(name)] as const),
    )
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        !runnable() ||
        countLoading() ||
        rangeLoading() ||
        queryError() ||
        (totalRows() ?? 0) === 0
      ) {
        return
      }
      const current = selectedIndex() ?? 0
      if (event.key === 'ArrowDown') moveSelection(current + 1)
      else if (event.key === 'ArrowUp') moveSelection(current - 1)
      else if (event.key === 'Home') moveSelection(0)
      else if (event.key === 'End') moveSelection((totalRows() ?? 1) - 1)
      else if (event.key === 'Enter') navigateTo(selectedRow())
      else return
      event.preventDefault()
      event.stopPropagation()
    }

    owner.setAttribute('aria-controls', listId)
    owner.setAttribute('aria-expanded', 'true')
    owner.setAttribute('aria-haspopup', 'listbox')
    owner.setAttribute('aria-autocomplete', 'list')
    owner.addEventListener('keydown', handleKeyDown)
    onCleanup(() => {
      owner.removeEventListener('keydown', handleKeyDown)
      for (const [name, value] of previous) {
        if (value === null) owner.removeAttribute(name)
        else owner.setAttribute(name, value)
      }
    })
  })

  createEffect(() => {
    const owner = props.active && !props.suspended ? props.focusOwner : undefined
    if (!owner) return
    const activeId = selectedOptionId()
    if (activeId) owner.setAttribute('aria-activedescendant', activeId)
    else owner.removeAttribute('aria-activedescendant')
  })

  const totalPages = createMemo(() => Math.ceil((totalRows() ?? 0) / DEEP_PREVIEW_PAGE_SIZE))
  const renderWindow = (windowIndex: number) => {
    const start = windowIndex * DEEP_PREVIEW_PAGE_SIZE
    const end = Math.min(start + DEEP_PREVIEW_PAGE_SIZE, totalRows() ?? 0)
    const indexes = Array.from(
      { length: Math.max(0, end - start) },
      (_, offset) => start + offset,
    )
    return (
      <div
        class={styles.window}
        data-preview-window={windowIndex}
        style={{ 'min-height': `${Math.max(0, end - start) * ROW_HEIGHT_PX}px` }}
      >
        <For each={indexes}>
          {(index) => {
            const row = () => rowAt(index)
            const rowId = () => rowIdOf(row())
            const id = () => {
              const matrixId = props.matrixId
              const value = rowId()
              return matrixId === null || value === null ?
                  undefined
                : optionId(listId, matrixId, value)
            }
            const selected = () => selectedIndex() === index
            const label = () => {
              const column = labelColumn()
              return (
                (column ? extractTextFromPmDoc(row()?.[column.name]) : '') ||
                (rowId() === null ? 'Untitled' : `Untitled (#${rowId()})`)
              )
            }
            return (
              <Show when={row()}>
                <div
                  id={id()}
                  class={styles.row}
                  role="option"
                  aria-selected={selected()}
                  data-selected={selected() || undefined}
                  onPointerMove={(event) => {
                    if (event.pointerType !== 'touch') setSelectedIndex(index)
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSelectedIndex(index)
                    navigateTo(row())
                  }}
                >
                  <span class={styles.identity} title={label()}>
                    {boundedText(label(), MAX_LABEL_CHARACTERS)}
                  </span>
                  <For each={detailColumns()}>
                    {(column) => (
                      <span class={styles.cell} data-preview-column={column.name}>
                        <span class={styles.cellLabel}>{column.name}</span>
                        <span
                          class={styles.cellValue}
                          title={displayCellText(column, row()?.[column.name])}
                        >
                          {boundedText(
                            displayCellText(column, row()?.[column.name]),
                            MAX_CELL_CHARACTERS,
                          )}
                        </span>
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            )
          }}
        </For>
      </div>
    )
  }

  const state = createMemo(() => {
    if (props.invalidReason) return 'invalid'
    if (props.loadingReason || countLoading() || rangeLoading()) return 'loading'
    if (queryError()) return 'error'
    if (totalRows() === 0) return 'empty'
    if ((totalRows() ?? 0) > 0) return 'ready'
    return 'loading'
  })

  const stateMessage = createMemo(() => {
    if (props.invalidReason) return props.invalidReason
    if (props.loadingReason) return props.loadingReason
    if (queryError()) return queryError()!.message
    if (totalRows() === 0) return 'No matching rows.'
    return 'Loading preview…'
  })

  const showVirtualizer = createMemo(
    () =>
      (totalRows() ?? 0) > 0 && !queryError() && !props.invalidReason && !props.loadingReason,
  )

  return (
    <Show when={props.active}>
      <div
        id={listId}
        class={styles.root}
        role="listbox"
        aria-label="Query preview"
        aria-busy={state() === 'loading' ? 'true' : undefined}
        aria-invalid={state() === 'invalid' ? 'true' : undefined}
        data-preview-state={state()}
        tabindex={-1}
      >
        <Show
          when={showVirtualizer()}
          fallback={
            <div
              class={styles.state}
              role={state() === 'error' || state() === 'invalid' ? 'alert' : 'status'}
            >
              {stateMessage()}
            </div>
          }
        >
          <ScrollVirtualizer
            minWindowHeight={DEEP_PREVIEW_PAGE_SIZE * ROW_HEIGHT_PX}
            totalWindows={totalPages()}
            virtualizerRef={(handle) => (virtualizer = handle)}
            onVisibleRangeChange={updateRetainedPages}
            getRowGeometry={(windowIndex) => {
              const start = windowIndex * DEEP_PREVIEW_PAGE_SIZE
              const end = Math.min(start + DEEP_PREVIEW_PAGE_SIZE, totalRows() ?? 0)
              const matrixId = props.matrixId
              return Array.from({ length: Math.max(0, end - start) }, (_, offset) => ({
                position: `${matrixId}:${start + offset}`,
                offset: offset * ROW_HEIGHT_PX,
                height: ROW_HEIGHT_PX,
              }))
            }}
            renderWindow={({ windowIndex }) => renderWindow(windowIndex)}
          />
          <Show when={rangeLoading()}>
            <div class={`${styles.state} ${styles.loading}`} role="status">
              {stateMessage()}
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  )
}

export default DeepPreview
