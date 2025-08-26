import { createSignal, type Component } from 'solid-js'

import SqlRunner from './SqlRunner'
import MatrixDebug from './MatrixDebug'

const App: Component = () => {
  const [activeTab, setActiveTab] = createSignal<'sql' | 'matrix'>('matrix')

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
      {activeTab() === 'matrix' && <MatrixDebug />}
      {activeTab() === 'sql' && <SqlRunner />}
    </div>
  )
}

export default App
