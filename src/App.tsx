import { createSignal, lazy, type Component } from 'solid-js'

import SqlRunner from './SqlRunner'
import MatrixDebug from './MatrixDebug'

const EditorHarness = lazy(() => import('./outline/EditorHarness'))
const OutlineRowHarness = lazy(() => import('./outline/OutlineRowHarness'))
const OutlineFace = lazy(() => import('./outline/OutlineFace'))

const App: Component = () => {
  const [activeTab, setActiveTab] = createSignal<
    'sql' | 'matrix' | 'editor' | 'outlineRow' | 'outlineFace'
  >('outlineFace')

  return (
    <div style={{ padding: '20px' }}>
      <h1>Hila Development Interface</h1>

      {/* Tab Navigation */}
      <div
        style={{
          'margin-bottom': '20px',
          'border-bottom': '2px solid #ddd',
        }}
      >
        <button
          onClick={() => setActiveTab('matrix')}
          style={{
            padding: '10px 20px',
            margin: '0 5px 0 0',
            border: 'none',
            'border-bottom':
              activeTab() === 'matrix' ? '3px solid #007acc' : '3px solid transparent',
            'background-color': activeTab() === 'matrix' ? '#f0f8ff' : 'transparent',
            cursor: 'pointer',
            'font-weight': activeTab() === 'matrix' ? 'bold' : 'normal',
          }}
        >
          Matrix Debug
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          style={{
            padding: '10px 20px',
            margin: '0 5px',
            border: 'none',
            'border-bottom':
              activeTab() === 'editor' ? '3px solid #007acc' : '3px solid transparent',
            'background-color': activeTab() === 'editor' ? '#f0f8ff' : 'transparent',
            cursor: 'pointer',
            'font-weight': activeTab() === 'editor' ? 'bold' : 'normal',
          }}
        >
          Editor Harness
        </button>
        <button
          onClick={() => setActiveTab('outlineFace')}
          style={{
            padding: '10px 20px',
            margin: '0 5px',
            border: 'none',
            'border-bottom':
              activeTab() === 'outlineFace' ? '3px solid #007acc' : '3px solid transparent',
            'background-color': activeTab() === 'outlineFace' ? '#f0f8ff' : 'transparent',
            cursor: 'pointer',
            'font-weight': activeTab() === 'outlineFace' ? 'bold' : 'normal',
          }}
        >
          Outline Face
        </button>
        <button
          onClick={() => setActiveTab('outlineRow')}
          style={{
            padding: '10px 20px',
            margin: '0 5px',
            border: 'none',
            'border-bottom':
              activeTab() === 'outlineRow' ? '3px solid #007acc' : '3px solid transparent',
            'background-color': activeTab() === 'outlineRow' ? '#f0f8ff' : 'transparent',
            cursor: 'pointer',
            'font-weight': activeTab() === 'outlineRow' ? 'bold' : 'normal',
          }}
        >
          Outline Row
        </button>
        <button
          onClick={() => setActiveTab('sql')}
          style={{
            padding: '10px 20px',
            margin: '0 5px',
            border: 'none',
            'border-bottom':
              activeTab() === 'sql' ? '3px solid #007acc' : '3px solid transparent',
            'background-color': activeTab() === 'sql' ? '#f0f8ff' : 'transparent',
            cursor: 'pointer',
            'font-weight': activeTab() === 'sql' ? 'bold' : 'normal',
          }}
        >
          SQL Runner
        </button>
      </div>

      {/* Tab Content */}
      {activeTab() === 'outlineFace' && <OutlineFace />}
      {activeTab() === 'outlineRow' && <OutlineRowHarness />}
      {activeTab() === 'editor' && <EditorHarness />}
      {activeTab() === 'matrix' && <MatrixDebug />}
      {activeTab() === 'sql' && <SqlRunner />}
    </div>
  )
}

export default App
