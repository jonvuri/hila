import type { Component } from 'solid-js'

import ScrollingVirtualizer from './Comp'

import './global.css'

const App: Component = () => {
  return (
    <>
      <h1>Scrolling Virtualizer Demo</h1>
      <ScrollingVirtualizer />
    </>
  )
}

export default App
