import { createSignal, For, Show, type Component } from 'solid-js'

import { useQuery } from '../sql/useQuery'
import { createTagType } from '../core/client/matrix-client'

import { tagColorFromName, tagBadgeBackground } from './tag-color'
import { buildTagTypesWithCountsQuery } from './tag-queries'

type TagTypeRow = {
  id: number
  name: string
  matrix_id: number
  color: string | null
  icon: string | null
  instance_count: number
}

const TagBrowserFace: Component = () => {
  const [showForm, setShowForm] = createSignal(false)
  const [newName, setNewName] = createSignal('')
  const [creating, setCreating] = createSignal(false)
  const [formError, setFormError] = createSignal<string | null>(null)

  const { result } = useQuery(() => buildTagTypesWithCountsQuery())

  const tagTypes = (): TagTypeRow[] => {
    const r = result()
    if (!r || r.length === 0) return []
    return r as unknown as TagTypeRow[]
  }

  const resolveColor = (tt: TagTypeRow): string => tt.color ?? tagColorFromName(tt.name)

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

  return (
    <div class="tag-browser">
      <div class="tag-browser-header">
        <h2 class="tag-browser-title">Tags</h2>
        <button
          class="tag-browser-new-btn"
          onClick={() => setShowForm(!showForm())}
          data-testid="new-tag-type-btn"
        >
          {showForm() ? 'Cancel' : '+ New Tag Type'}
        </button>
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
            {creating() ? 'Creating…' : 'Create'}
          </button>
          <Show when={formError()}>
            <div class="tag-browser-form-error">{formError()}</div>
          </Show>
        </div>
      </Show>

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
                <div class="tag-type-row" data-testid="tag-type-row">
                  <span class="tag-type-badge" style={{ background: bg, color }}>
                    #{tt.name}
                  </span>
                  <span class="tag-type-count" data-testid="tag-type-count">
                    {tt.instance_count} {tt.instance_count === 1 ? 'instance' : 'instances'}
                  </span>
                </div>
              )
            }}
          </For>
        </Show>
      </div>
    </div>
  )
}

export default TagBrowserFace
