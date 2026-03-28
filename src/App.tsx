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
import { outlinePlugin, registerOutlineFaceType } from './outline/outline-plugin'
import { notesPlugin, registerNoteFaceTypes } from './notes/notes-plugin'
import { registerTableFaceType } from './table/table-plugin'

const SqlRunner = lazy(() => import('./SqlRunner'))
const MatrixBrowser = lazy(() => import('./admin/MatrixBrowser'))
const OutlineFace = lazy(() => import('./outline/OutlineFace'))
const TableFace = lazy(() => import('./table/TableFace'))
const NoteListFace = lazy(() => import('./notes/NoteListFace'))
const NoteFace = lazy(() => import('./notes/NoteFace'))
const FaceConfigPanel = lazy(() => import('./core/FaceConfigPanel'))

type ActiveView = 'outline' | 'table' | 'notes' | 'notes-outline'

const App: Component = () => {
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [activePanel, setActivePanel] = createSignal<'matrix' | 'sql'>('matrix')
  const [outlineMatrixId, setOutlineMatrixId] = createSignal<number | null>(null)
  const [notesMatrixId, setNotesMatrixId] = createSignal<number | null>(null)
  const [activeView, setActiveView] = createSignal<ActiveView>('outline')
  const [tableFaceConfig, setTableFaceConfig] = createSignal<FaceConfig | null>(null)
  const [selectedNoteId, setSelectedNoteId] = createSignal<number | null>(null)
  const [notesOutlineReady, setNotesOutlineReady] = createSignal(false)
  const [faceConfigTarget, setFaceConfigTarget] = createSignal<{
    matrixId: number
    initialFaceTypeId?: string
  } | null>(null)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  const initPlugins = async () => {
    // Clear stale state so Show guards go falsy → truthy, forcing face
    // remount with fresh matrixIds (critical after DB reset).
    setOutlineMatrixId(null)
    setNotesMatrixId(null)
    setNotesOutlineReady(false)
    setTableFaceConfig(null)
    setSelectedNoteId(null)

    await registerTableFaceType()
    const TableFaceComponent = (await import('./table/TableFace')).default
    registerFaceComponent('hila.table', TableFaceComponent)

    await registerOutlineFaceType()
    const outlineCtx = await registerPlugin(outlinePlugin)
    const matrixId = outlineCtx.matrixIds['root']!
    setOutlineMatrixId(matrixId)

    const configs = await getFaceConfigs(matrixId)
    const tableConfig = configs.find((c) => c.faceTypeId === 'hila.table')
    if (tableConfig) setTableFaceConfig(tableConfig)

    await registerNoteFaceTypes()
    const notesCtx = await registerPlugin(notesPlugin)
    const notesId = notesCtx.matrixIds['notes']!
    setNotesMatrixId(notesId)
  }

  onMount(() => {
    shortcuts.install()

    const unregisterToggle = shortcuts.register({
      key: 'Mod-\\',
      handler: () => {
        toggleSidebar()
      },
    })

    void awaitWorkerReady().then(initPlugins)

    onCleanup(() => {
      unregisterToggle()
      shortcuts.uninstall()
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
                        when={activeView() === 'table' && tableFaceConfig()}
                        fallback={<OutlineFace matrixId={matrixId()} />}
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
    </div>
  )
}

export default App
