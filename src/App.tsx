import type { Component } from 'solid-js'

import ScrollVirtualizer from './ScrollVirtualizer'
import { DefaultWindowRenderer } from './WindowRenderer'

import './global.css'

const App: Component = () => {
  return (
    <>
      <h1>Scrolling Virtualizer Demo</h1>
      <ScrollVirtualizer renderWindow={DefaultWindowRenderer} minWindowHeight={3000} />
    </>
  )
}

export default App
