import { render } from 'solid-js/web'
import { afterEach, describe, expect, test, vi } from 'vitest'

import WorkspacePathHeader from './WorkspacePathHeader'

describe('WorkspacePathHeader', () => {
  let dispose: (() => void) | undefined
  let container: HTMLDivElement

  afterEach(() => {
    dispose?.()
    container?.remove()
  })

  test('shares the root indicator between editable and navigable forms', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const rename = vi.fn()
    const selectRoot = vi.fn()
    const selectSegment = vi.fn()
    dispose = render(
      () => (
        <>
          <WorkspacePathHeader rootLabel="Workspace" onRootRename={rename} />
          <WorkspacePathHeader
            ariaLabel="Current row: ancestry"
            rootLabel="Workspace"
            segments={[{ id: 'alpha', label: 'Alpha' }]}
            onRootSelect={selectRoot}
            onSegmentSelect={selectSegment}
          />
        </>
      ),
      container,
    )

    const indicators = container.querySelectorAll('.workspace-root-indicator')
    expect(indicators).toHaveLength(2)
    expect(
      [...indicators].every(
        (indicator) =>
          indicator.querySelector('[data-launcher-workspace-mark]') != null &&
          indicator.querySelector('[data-launcher-workspace-title]') != null,
      ),
    ).toBe(true)

    const editor = container.querySelector<HTMLElement>('[contenteditable="true"]')!
    editor.textContent = 'Renamed'
    editor.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    expect(rename).toHaveBeenCalledWith('Renamed')

    const nav = container.querySelector('nav')!
    const buttons = nav.querySelectorAll('button')
    buttons[0]!.click()
    buttons[1]!.click()
    expect(selectRoot).toHaveBeenCalledOnce()
    expect(selectSegment).toHaveBeenCalledWith({ id: 'alpha', label: 'Alpha' })
  })
})
