import type { Component } from 'solid-js'

import ScrollingVirtualizer from './Comp'
import { DefaultWindowRenderer } from './WindowRenderer'

import './global.css'

const App: Component = () => {
  return (
    <>
      <h1>Scrolling Virtualizer Demo</h1>
      <ScrollingVirtualizer renderWindow={DefaultWindowRenderer} minWindowHeight={3000} />
    </>
  )
}

export default App
