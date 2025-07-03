import type { Component } from 'solid-js'

import SqlRunner from './SqlRunner'

const App: Component = () => {
  return (
    <>
      <h1>SQL Runner demo</h1>
      <SqlRunner />
    </>
  )
}

export default App
