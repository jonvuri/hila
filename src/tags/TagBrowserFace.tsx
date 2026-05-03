import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  type Component,
} from 'solid-js'

import { useQuery } from '../sql/useQuery'
import {
  createTagType,
  updateTagType as updateTagTypeClient,
  deleteTagType as deleteTagTypeClient,
} from '../core/client/matrix-client'

import { tagColorFromName, tagBadgeBackground } from './tag-color'
import { buildTagTypesWithCountsQuery, buildTagInstancesQuery } from './tag-queries'

type TagTypeRow = {
  id: number
  name: string
  matrix_id: number
  color: string | null
  icon: string | null
  instance_count: number
}

type TagInstanceRow = {
  source_matrix_id: number
  source_row_id: number
  target_row_id: number
  source_matrix_name: string
}

type TagBrowserFaceProps = {
  outlineMatrixId?: number
  notesMatrixId?: number
  onNavigateToOutlineRow?: (matrixId: number, rowId: number) => void
  onNavigateToNote?: (matrixId: number, noteId: number) => void
  onOpenTableFace?: (matrixId: number) => void
}

const extractTextFromContent = (contentJson: unknown): string => {
  if (typeof contentJson !== 'string') return String(contentJson ?? '')
  try {
    const doc = JSON.parse(contentJson) as {
      content?: { content?: { text?: string }[] }[]
    }
    if (!doc.content) return contentJson || ''
    return (
      doc.content
        .flatMap((block) => block.content ?? [])
        .map((node) => node.text ?? '')
        .join('') || ''
    )
  } catch {
    return contentJson
  }
}

const getSnippet = (row: Record<string, unknown>): string => {
  const skip = new Set(['id', 'source_matrix_id', 'source_row_id'])
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key) || value == null || value === '') continue
    const text = extractTextFromContent(value)
    if (text) return text.length > 80 ? text.slice(0, 80) + '...' : text
  }
  return ''
}

const TagBrowserFace: Component<TagBrowserFaceProps> = (props) => {
  const [showForm, setShowForm] = createSignal(false)
  const [newName, setNewName] = createSignal('')
  const [creating, setCreating] = createSignal(false)
  const [formError, setFormError] = createSignal<string | null>(null)
  const [selectedTagType, setSelectedTagType] = createSignal<TagTypeRow | null>(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = createSignal<{
    x: number
    y: number
    tagType: TagTypeRow
  } | null>(null)
  const [renaming, setRenaming] = createSignal<{ id: number; value: string } | null>(null)
  const [colorPicking, setColorPicking] = createSignal<{ id: number; value: string } | null>(
    null,
  )

  const { result } = useQuery(() => buildTagTypesWithCountsQuery())

  const tagTypes = (): TagTypeRow[] => {
    const r = result()
    if (!r || r.length === 0) return []
    return r as unknown as TagTypeRow[]
  }

  const resolveColor = (tt: TagTypeRow): string => tt.color ?? tagColorFromName(tt.name)

  // Instance drill-down query
  const { result: instanceResult } = useQuery(() => {
    const sel = selectedTagType()
    if (!sel) return ''
    return buildTagInstancesQuery(sel.matrix_id)
  })

  const instances = (): TagInstanceRow[] => {
    const r = instanceResult()
    if (!r || r.length === 0) return []
    return r as unknown as TagInstanceRow[]
  }

  // For each source matrix, fetch all rows in that matrix that appear in
  // our instances. We build a single query per source matrix.
  const sourceRowQueries = createMemo(() => {
    const inst = instances()
    const byMatrix = new Map<number, number[]>()
    for (const i of inst) {
      const arr = byMatrix.get(i.source_matrix_id) ?? []
      arr.push(i.source_row_id)
      byMatrix.set(i.source_matrix_id, arr)
    }
    return byMatrix
  })

  // Single combined data query: for each source matrix, fetch the rows
  const [sourceRowData, setSourceRowData] = createSignal<Map<string, Record<string, unknown>>>(
    new Map(),
  )

  // Use reactive queries for source row data per matrix
  const sourceDataQueries = createMemo(() => {
    const queries: { matrixId: number; sql: string }[] = []
    for (const [matrixId, rowIds] of sourceRowQueries()) {
      const idList = rowIds.join(',')
      queries.push({
        matrixId,
        sql: `SELECT * FROM "mx_${matrixId}_data" WHERE id IN (${idList})`,
      })
    }
    return queries
  })

  // Individual reactive query hooks per source matrix
  const SourceDataLoader: Component<{
    matrixId: number
    sql: string
    onData: (matrixId: number, rows: Record<string, unknown>[]) => void
  }> = (loaderProps) => {
    const { result: dataResult } = useQuery(() => loaderProps.sql)
    createEffect(() => {
      const data = dataResult()
      if (data) {
        loaderProps.onData(loaderProps.matrixId, data as unknown as Record<string, unknown>[])
      }
    })
    return null
  }

  const handleSourceData = (matrixId: number, rows: Record<string, unknown>[]) => {
    setSourceRowData((prev) => {
      const next = new Map(prev)
      for (const row of rows) {
        const rowId = row.id as number
        next.set(`${matrixId}:${rowId}`, row)
      }
      return next
    })
  }

  const getSourceRowSnippet = (matrixId: number, rowId: number): string => {
    const row = sourceRowData().get(`${matrixId}:${rowId}`)
    if (!row) return ''
    return getSnippet(row)
  }

  // -- Tag type creation --

  const handleCreate = async () => {
    const name = newName().trim()
    if (!name) return

    setCreating(true)
    setFormError(null)
    try {
      await createTagType(name)
      setNewName('')
      setShowForm(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create tag type'
      setFormError(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !creating()) {
      void handleCreate()
    } else if (e.key === 'Escape') {
      setShowForm(false)
      setNewName('')
      setFormError(null)
    }
  }

  // -- Context menu --

  const handleContextMenu = (e: MouseEvent, tt: TagTypeRow) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, tagType: tt })
  }

  createEffect(() => {
    if (ctxMenu()) {
      const handleClick = () => setCtxMenu(null)
      document.addEventListener('click', handleClick)
      onCleanup(() => document.removeEventListener('click', handleClick))
    }
  })

  const handleRename = async () => {
    const r = renaming()
    if (!r || !r.value.trim()) return
    try {
      await updateTagTypeClient(r.id, { name: r.value.trim() })
      // If the renamed tag type was selected, update the selection
      const sel = selectedTagType()
      if (sel && sel.id === r.id) {
        setSelectedTagType({ ...sel, name: r.value.trim() })
      }
    } catch {
      // ignore
    }
    setRenaming(null)
  }

  const handleColorChange = async () => {
    const c = colorPicking()
    if (!c) return
    try {
      await updateTagTypeClient(c.id, { color: c.value || null })
    } catch {
      // ignore
    }
    setColorPicking(null)
  }

  const handleDeleteTagType = async (id: number) => {
    if (!confirm('Delete this tag type? The underlying matrix will be preserved.')) return
    try {
      await deleteTagTypeClient(id)
      if (selectedTagType()?.id === id) {
        setSelectedTagType(null)
      }
    } catch {
      // ignore
    }
  }

  // -- Navigation --

  const handleInstanceClick = (inst: TagInstanceRow) => {
    if (props.notesMatrixId && inst.source_matrix_id === props.notesMatrixId) {
      props.onNavigateToNote?.(inst.source_matrix_id, inst.source_row_id)
    } else if (props.outlineMatrixId && inst.source_matrix_id === props.outlineMatrixId) {
      props.onNavigateToOutlineRow?.(inst.source_matrix_id, inst.source_row_id)
    } else {
      props.onOpenTableFace?.(inst.source_matrix_id)
    }
  }

  const handleViewAllInTable = () => {
    const sel = selectedTagType()
    if (sel) {
      props.onOpenTableFace?.(sel.matrix_id)
    }
  }

  // -- Render --

  return (
    <div class="tag-browser">
      {/* Hidden reactive data loaders */}
      <For each={sourceDataQueries()}>
        {(q) => (
          <SourceDataLoader matrixId={q.matrixId} sql={q.sql} onData={handleSourceData} />
        )}
      </For>

      <div class="tag-browser-header">
        <Show
          when={!selectedTagType()}
          fallback={
            <div class="tag-browser-breadcrumb">
              <button
                class="tag-browser-back-btn"
                onClick={() => setSelectedTagType(null)}
                data-testid="tag-browser-back"
              >
                ← Tags
              </button>
              {(() => {
                const sel = selectedTagType()!
                const color = resolveColor(sel)
                const bg = tagBadgeBackground(color)
                return (
                  <span class="tag-type-badge" style={{ background: bg, color }}>
                    #{sel.name}
                  </span>
                )
              })()}
            </div>
          }
        >
          <h2 class="tag-browser-title">Tags</h2>
        </Show>
        <Show when={!selectedTagType()}>
          <button
            class="tag-browser-new-btn"
            onClick={() => setShowForm(!showForm())}
            data-testid="new-tag-type-btn"
          >
            {showForm() ? 'Cancel' : '+ New Tag Type'}
          </button>
        </Show>
        <Show when={selectedTagType()}>
          <button
            class="tag-browser-table-link"
            onClick={handleViewAllInTable}
            data-testid="view-all-in-table"
          >
            View all in table
          </button>
        </Show>
      </div>

      <Show when={showForm()}>
        <div class="tag-browser-form" data-testid="new-tag-type-form">
          <input
            class="tag-browser-form-input"
            type="text"
            placeholder="Tag type name (e.g. task, review)"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={creating()}
            autofocus
            data-testid="new-tag-type-input"
          />
          <button
            class="tag-browser-form-submit"
            onClick={() => void handleCreate()}
            disabled={creating() || !newName().trim()}
            data-testid="new-tag-type-submit"
          >
            {creating() ? 'Creating...' : 'Create'}
          </button>
          <Show when={formError()}>
            <div class="tag-browser-form-error">{formError()}</div>
          </Show>
        </div>
      </Show>

      {/* Tag type list view */}
      <Show when={!selectedTagType()}>
        <div class="tag-browser-list" data-testid="tag-type-list">
          <Show
            when={tagTypes().length > 0}
            fallback={
              <div class="tag-browser-empty">No tag types yet. Create one to get started.</div>
            }
          >
            <For each={tagTypes()}>
              {(tt) => {
                const color = resolveColor(tt)
                const bg = tagBadgeBackground(color)
                return (
                  <Show
                    when={renaming()?.id !== tt.id}
                    fallback={
                      <div class="tag-type-row tag-type-row-editing" data-testid="tag-type-row">
                        <input
                          class="tag-type-rename-input"
                          type="text"
                          value={renaming()!.value}
                          onInput={(e) =>
                            setRenaming({ id: tt.id, value: e.currentTarget.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleRename()
                            if (e.key === 'Escape') setRenaming(null)
                          }}
                          onBlur={() => void handleRename()}
                          autofocus
                          data-testid="tag-type-rename-input"
                        />
                      </div>
                    }
                  >
                    <Show
                      when={colorPicking()?.id !== tt.id}
                      fallback={
                        <div
                          class="tag-type-row tag-type-row-editing"
                          data-testid="tag-type-row"
                        >
                          <span class="tag-type-badge" style={{ background: bg, color }}>
                            #{tt.name}
                          </span>
                          <input
                            class="tag-type-color-input"
                            type="color"
                            value={colorPicking()!.value || '#7c3aed'}
                            onInput={(e) =>
                              setColorPicking({ id: tt.id, value: e.currentTarget.value })
                            }
                            onBlur={() => void handleColorChange()}
                            onChange={() => void handleColorChange()}
                            autofocus
                            data-testid="tag-type-color-input"
                          />
                        </div>
                      }
                    >
                      <div
                        class="tag-type-row"
                        data-testid="tag-type-row"
                        onClick={() => setSelectedTagType(tt)}
                        onContextMenu={(e) => handleContextMenu(e, tt)}
                      >
                        <span class="tag-type-badge" style={{ background: bg, color }}>
                          #{tt.name}
                        </span>
                        <span class="tag-type-count" data-testid="tag-type-count">
                          {tt.instance_count}{' '}
                          {tt.instance_count === 1 ? 'instance' : 'instances'}
                        </span>
                      </div>
                    </Show>
                  </Show>
                )
              }}
            </For>
          </Show>
        </div>
      </Show>

      {/* Instance drill-down view */}
      <Show when={selectedTagType()}>
        {(sel) => (
          <div class="tag-browser-instances" data-testid="tag-instance-list">
            <Show
              when={instances().length > 0}
              fallback={<div class="tag-browser-empty">No instances of #{sel().name} yet.</div>}
            >
              {(() => {
                const grouped = createMemo(() => {
                  const map = new Map<string, { matrixName: string; items: TagInstanceRow[] }>()
                  for (const inst of instances()) {
                    const key = `${inst.source_matrix_id}`
                    const group = map.get(key) ?? {
                      matrixName: inst.source_matrix_name,
                      items: [],
                    }
                    group.items.push(inst)
                    map.set(key, group)
                  }
                  return Array.from(map.values())
                })

                return (
                  <For each={grouped()}>
                    {(group) => (
                      <div class="tag-instance-group">
                        <div class="tag-instance-group-header">
                          {group.matrixName}
                          <span class="tag-instance-group-count">({group.items.length})</span>
                        </div>
                        <For each={group.items}>
                          {(inst) => {
                            const snippet = () =>
                              getSourceRowSnippet(inst.source_matrix_id, inst.source_row_id)
                            return (
                              <div
                                class="tag-instance-row"
                                data-testid="tag-instance-row"
                                onClick={() => handleInstanceClick(inst)}
                              >
                                <div class="tag-instance-snippet">
                                  {snippet() || 'Row #' + inst.source_row_id}
                                </div>
                                <div class="tag-instance-meta">
                                  {group.matrixName} · row {inst.source_row_id}
                                </div>
                              </div>
                            )
                          }}
                        </For>
                      </div>
                    )}
                  </For>
                )
              })()}
            </Show>
          </div>
        )}
      </Show>

      {/* Context menu */}
      <Show when={ctxMenu()}>
        {(menu) => (
          <div
            class="tag-type-context-menu"
            style={{ top: `${menu().y}px`, left: `${menu().x}px` }}
            onClick={(e) => e.stopPropagation()}
            data-testid="tag-type-context-menu"
          >
            <button
              class="tag-type-context-item"
              onClick={() => {
                setCtxMenu(null)
                setRenaming({ id: menu().tagType.id, value: menu().tagType.name })
              }}
              data-testid="ctx-rename"
            >
              Rename
            </button>
            <button
              class="tag-type-context-item"
              onClick={() => {
                setCtxMenu(null)
                setColorPicking({
                  id: menu().tagType.id,
                  value: menu().tagType.color ?? '#7c3aed',
                })
              }}
              data-testid="ctx-change-color"
            >
              Change color
            </button>
            <button
              class="tag-type-context-item"
              onClick={() => {
                setCtxMenu(null)
                props.onOpenTableFace?.(menu().tagType.matrix_id)
              }}
              data-testid="ctx-open-table"
            >
              Open identity face
            </button>
            <div class="tag-type-context-separator" />
            <button
              class="tag-type-context-item tag-type-context-danger"
              onClick={() => {
                setCtxMenu(null)
                void handleDeleteTagType(menu().tagType.id)
              }}
              data-testid="ctx-delete"
            >
              Delete tag type
            </button>
          </div>
        )}
      </Show>
    </div>
  )
}

export default TagBrowserFace
