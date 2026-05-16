import {
  createSignal,
  lazy,
  onCleanup,
  onMount,
  Show,
  Suspense,
  type Component,
} from 'solid-js'

import type { FaceConfig } from './core/face-types'
import { registerFaceComponent } from './core/FaceRenderer'
import { applyFaceToMatrix, getFaceConfigs, registerPlugin } from './core/client/matrix-client'
import { awaitWorkerReady } from './core/client/worker-client'
import { shortcuts } from './shortcuts'
import { inlineReferencesPlugin } from './editor/inlineref-plugin-def'
import { outlinePlugin } from './outline/outline-plugin'
import { notesPlugin } from './notes/notes-plugin'
import { tagsPlugin } from './tags/tags-plugin'
import { workspacePlugin } from './workspace/workspace-plugin'
import { registerTableFaceType } from './table/table-plugin'
import TagPropertyPanel from './tags/TagPropertyPanel'

const SqlRunner = lazy(() => import('./SqlRunner'))
const MatrixBrowser = lazy(() => import('./admin/MatrixBrowser'))
const OutlineFace = lazy(() => import('./outline/OutlineFace'))
const TableFace = lazy(() => import('./table/TableFace'))
const NoteListFace = lazy(() => import('./notes/NoteListFace'))
const NoteFace = lazy(() => import('./notes/NoteFace'))
const FaceConfigPanel = lazy(() => import('./core/FaceConfigPanel'))
const TagBrowserFace = lazy(() => import('./tags/TagBrowserFace'))
const NavigationPanel = lazy(() => import('./workspace/NavigationPanel'))
const FocusPanel = lazy(() => import('./workspace/FocusPanel'))

type ActiveView = 'outline' | 'table' | 'notes' | 'notes-outline' | 'tags' | 'workspace'

const App: Component = () => {
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [activePanel, setActivePanel] = createSignal<'matrix' | 'sql'>('matrix')
  const [outlineMatrixId, setOutlineMatrixId] = createSignal<number | null>(null)
  const [notesMatrixId, setNotesMatrixId] = createSignal<number | null>(null)
  const [activeView, setActiveView] = createSignal<ActiveView>('outline')
  const [tableFaceConfig, setTableFaceConfig] = createSignal<FaceConfig | null>(null)
  const [selectedNoteId, setSelectedNoteId] = createSignal<number | null>(null)
  const [notesOutlineReady, setNotesOutlineReady] = createSignal(false)
  const [workspaceMatrixId, setWorkspaceMatrixId] = createSignal<number | null>(null)
  const [faceConfigTarget, setFaceConfigTarget] = createSignal<{
    matrixId: number
    initialFaceTypeId?: string
  } | null>(null)

  const [focusPanelTarget, setFocusPanelTarget] = createSignal<{
    rowId: number
    rowKey: Uint8Array
  } | null>(null)

  const [tagPanel, setTagPanel] = createSignal<{
    matrixId: number
    rowId: number
    tagTypeName: string
    tagTypeColor: string | null
    anchorRect: DOMRect
  } | null>(null)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  const initPlugins = async () => {
    // Clear stale state so Show guards go falsy → truthy, forcing face
    // remount with fresh matrixIds (critical after DB reset).
    setOutlineMatrixId(null)
    setNotesMatrixId(null)
    setNotesOutlineReady(false)
    setWorkspaceMatrixId(null)
    setTableFaceConfig(null)
    setSelectedNoteId(null)

    // Table face type is core infrastructure — register it first so all
    // plugins can create identity faces for their matrixes.
    await registerTableFaceType()
    const TableFaceComponent = (await import('./table/TableFace')).default
    registerFaceComponent('hila.table', TableFaceComponent)

    // Plugins declare their own face types via faceTypes in PluginDefinition;
    // registerPlugin handles registration both locally and in the worker.
    await registerPlugin(inlineReferencesPlugin)

    const outlineCtx = await registerPlugin(outlinePlugin)
    const matrixId = outlineCtx.matrixIds['root']!
    setOutlineMatrixId(matrixId)

    const configs = await getFaceConfigs(matrixId)
    const tableConfig = configs.find((c) => c.faceTypeId === 'hila.table')
    if (tableConfig) setTableFaceConfig(tableConfig)

    const notesCtx = await registerPlugin(notesPlugin)
    const notesId = notesCtx.matrixIds['notes']!
    setNotesMatrixId(notesId)

    await registerPlugin(tagsPlugin)

    const workspaceCtx = await registerPlugin(workspacePlugin)
    const wsId = workspaceCtx.matrixIds['root']!
    setWorkspaceMatrixId(wsId)
  }

  const handleTagPanelEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      matrixId: number
      rowId: number
      tagTypeName: string
      tagTypeColor: string | null
      anchorRect: {
        top: number
        left: number
        bottom: number
        right: number
        width: number
        height: number
      }
    }
    if (detail?.matrixId != null && detail?.rowId != null) {
      setTagPanel({
        matrixId: detail.matrixId,
        rowId: detail.rowId,
        tagTypeName: detail.tagTypeName,
        tagTypeColor: detail.tagTypeColor,
        anchorRect: new DOMRect(
          detail.anchorRect.left,
          detail.anchorRect.top,
          detail.anchorRect.width,
          detail.anchorRect.height,
        ),
      })
    }
  }

  onMount(() => {
    shortcuts.install()

    const unregisterToggle = shortcuts.register({
      key: 'Mod-\\',
      handler: () => {
        toggleSidebar()
      },
    })

    document.addEventListener('inlineref-open-tag-panel', handleTagPanelEvent)

    void awaitWorkerReady().then(initPlugins)

    onCleanup(() => {
      unregisterToggle()
      shortcuts.uninstall()
      document.removeEventListener('inlineref-open-tag-panel', handleTagPanelEvent)
    })
  })

  const handleSelectNote = (noteId: number) => setSelectedNoteId(noteId)

  const handleBackToList = () => setSelectedNoteId(null)

  return (
    <div class="app-shell">
      <div class="app-main">
        <Show when={outlineMatrixId()}>
          <div class="view-switcher">
            <button
              class="view-tab"
              data-active={activeView() === 'outline'}
              onClick={() => {
                setActiveView('outline')
                setSelectedNoteId(null)
              }}
            >
              Outline
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'table'}
              onClick={() => {
                setActiveView('table')
                setSelectedNoteId(null)
              }}
            >
              Table
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'notes'}
              onClick={() => setActiveView('notes')}
            >
              Notes
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'tags'}
              data-testid="tags-tab"
              onClick={() => setActiveView('tags')}
            >
              Tags
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'workspace'}
              data-testid="workspace-tab"
              onClick={() => setActiveView('workspace')}
            >
              Workspace
            </button>
            <Show when={notesMatrixId()}>
              <button
                class="view-tab"
                data-active={activeView() === 'notes-outline'}
                data-testid="notes-outline-tab"
                onClick={() => {
                  const mid = notesMatrixId()
                  if (mid && !notesOutlineReady()) {
                    void applyFaceToMatrix('hila.outline', mid).then(() => {
                      setNotesOutlineReady(true)
                      setActiveView('notes-outline')
                    })
                  } else {
                    setActiveView('notes-outline')
                  }
                }}
              >
                Notes Outline
              </button>
            </Show>
            <button
              class="view-tab view-as-btn"
              onClick={() => {
                const mid = activeView() === 'notes' ? notesMatrixId() : outlineMatrixId()
                if (mid) setFaceConfigTarget({ matrixId: mid })
              }}
              data-testid="view-as-button"
            >
              View as…
            </button>
          </div>
        </Show>
        <Suspense fallback={<div class="app-loading">Loading…</div>}>
          <Show when={faceConfigTarget()}>
            {(target) => (
              <div class="face-config-overlay">
                <FaceConfigPanel
                  matrixId={target().matrixId}
                  initialFaceTypeId={target().initialFaceTypeId}
                  onApply={(config) => {
                    setFaceConfigTarget(null)
                    if (config.faceTypeId === 'hila.table') {
                      setTableFaceConfig(config)
                      setActiveView('table')
                    }
                  }}
                  onCancel={() => setFaceConfigTarget(null)}
                />
              </div>
            )}
          </Show>
          <Show when={outlineMatrixId()} fallback={<div class="app-loading">Loading…</div>}>
            {(matrixId) => (
              <Show
                when={
                  activeView() === 'notes-outline' && notesOutlineReady() && notesMatrixId()
                }
                fallback={
                  <Show
                    when={activeView() === 'notes' && notesMatrixId()}
                    fallback={
                      <Show
                        when={activeView() === 'tags'}
                        fallback={
                          <Show
                            when={activeView() === 'table' && tableFaceConfig()}
                            fallback={
                              <Show
                                when={activeView() === 'workspace' && workspaceMatrixId()}
                                fallback={<OutlineFace matrixId={matrixId()} />}
                              >
                                {(wsId) => (
                                  <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                                    <div style={{ flex: 1, overflow: 'auto', 'min-width': '300px' }}>
                                      <NavigationPanel
                                        matrixId={wsId()}
                                        onOpenFocus={(rowId, key) => setFocusPanelTarget({ rowId, rowKey: new Uint8Array(key) })}
                                        focusedRowId={focusPanelTarget()?.rowId}
                                      />
                                    </div>
                                    <Show when={focusPanelTarget()}>
                                      {(target) => (
                                        <div style={{ flex: 1, overflow: 'auto', 'min-width': '360px' }}>
                                          <FocusPanel
                                            matrixId={wsId()}
                                            rowId={target().rowId}
                                            rowKey={target().rowKey}
                                            onOpenFocus={(rowId, key) => setFocusPanelTarget({ rowId, rowKey: new Uint8Array(key) })}
                                            onClose={() => setFocusPanelTarget(null)}
                                          />
                                        </div>
                                      )}
                                    </Show>
                                  </div>
                                )}
                              </Show>
                            }
                          >
                            {(config) => (
                              <TableFace
                                config={config()}
                                bindings={{ bindings: [], overflowColumns: [] }}
                              />
                            )}
                          </Show>
                        }
                      >
                        <TagBrowserFace
                          outlineMatrixId={outlineMatrixId() ?? undefined}
                          notesMatrixId={notesMatrixId() ?? undefined}
                          onNavigateToOutlineRow={() => {
                            setActiveView('outline')
                          }}
                          onNavigateToNote={(_matrixId, noteId) => {
                            setActiveView('notes')
                            setSelectedNoteId(noteId)
                          }}
                          onOpenTableFace={(targetMatrixId) => {
                            void getFaceConfigs(targetMatrixId).then((configs) => {
                              const tableConfig = configs.find(
                                (c) => c.faceTypeId === 'hila.table',
                              )
                              if (tableConfig) {
                                setTableFaceConfig(tableConfig)
                                setActiveView('table')
                              }
                            })
                          }}
                        />
                      </Show>
                    }
                  >
                    {(notesId) => (
                      <Show
                        when={selectedNoteId()}
                        keyed
                        fallback={
                          <NoteListFace matrixId={notesId()} onSelectNote={handleSelectNote} />
                        }
                      >
                        {(noteId) => (
                          <NoteFace
                            matrixId={notesId()}
                            noteId={noteId}
                            onBack={handleBackToList}
                            onNavigateToNote={handleSelectNote}
                          />
                        )}
                      </Show>
                    )}
                  </Show>
                }
              >
                {(notesId) => (
                  <OutlineFace
                    matrixId={notesId()}
                    contentColumn="title"
                    contentIsPlainText={true}
                    defaultRowValues={{
                      body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
                    }}
                  />
                )}
              </Show>
            )}
          </Show>
        </Suspense>
      </div>

      <Show when={!sidebarOpen()}>
        <button
          class="sidebar-toggle"
          onClick={toggleSidebar}
          title="Toggle dev tools (Cmd/Ctrl+\)"
          aria-label="Toggle dev tools"
        >
          ⚙
        </button>
      </Show>

      <Show when={sidebarOpen()}>
        <div class="app-sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">Dev Tools</span>
            <button
              class="sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              ×
            </button>
          </div>
          <div class="sidebar-tabs">
            <button
              class="sidebar-tab"
              data-active={activePanel() === 'matrix'}
              onClick={() => setActivePanel('matrix')}
            >
              Matrix Browser
            </button>
            <button
              class="sidebar-tab"
              data-active={activePanel() === 'sql'}
              onClick={() => setActivePanel('sql')}
            >
              SQL Runner
            </button>
          </div>
          <Suspense fallback={<div class="app-loading">Loading…</div>}>
            <div class="sidebar-content">
              {activePanel() === 'matrix' && (
                <MatrixBrowser
                  onReset={initPlugins}
                  onApplyFace={(matrixId) => setFaceConfigTarget({ matrixId })}
                />
              )}
              {activePanel() === 'sql' && <SqlRunner />}
            </div>
          </Suspense>
        </div>
      </Show>

      <Show when={tagPanel()}>
        {(panel) => (
          <TagPropertyPanel
            matrixId={panel().matrixId}
            rowId={panel().rowId}
            tagTypeName={panel().tagTypeName}
            tagTypeColor={panel().tagTypeColor}
            anchorRect={panel().anchorRect}
            onClose={() => setTagPanel(null)}
          />
        )}
      </Show>
    </div>
  )
}

export default App
