import { describe, expect, test, vi } from 'vitest'

import { createOutlineKeymap, outlineShortcutDescriptors } from './editor/keymap'
import {
  collectShortcutDescriptors,
  createShortcutManager,
  displayShortcutKey,
  getShortcutPlatform,
  normalizeKeyEvent,
  normalizeShortcutKey,
} from './shortcuts'

describe('shortcut key normalization', () => {
  test('normalizes declared character keys independently from events', () => {
    expect(normalizeShortcutKey('Mod-b')).toBe('Mod-B')
    expect(normalizeShortcutKey('Shift-Tab')).toBe('Shift-Tab')
  })

  test('normalizes the platform modifier explicitly', () => {
    const macEvent = {
      key: 'b',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
    }
    const otherEvent = { ...macEvent, metaKey: false, ctrlKey: true }

    expect(normalizeKeyEvent(macEvent, 'mac')).toBe('Mod-Shift-B')
    expect(normalizeKeyEvent(otherEvent, 'other')).toBe('Mod-Shift-B')
  })

  test('detects Mac-family platforms', () => {
    expect(getShortcutPlatform('MacIntel')).toBe('mac')
    expect(getShortcutPlatform('Win32')).toBe('other')
  })
})

describe('shortcut display', () => {
  test('uses compact Mac symbols', () => {
    expect(displayShortcutKey('Mod-Shift-b', 'mac')).toBe('⌘⇧B')
    expect(displayShortcutKey('ArrowUp', 'mac')).toBe('↑')
  })

  test('uses readable non-Mac labels', () => {
    expect(displayShortcutKey('Mod-Shift-b', 'other')).toBe('Ctrl+Shift+B')
    expect(displayShortcutKey('Backspace', 'other')).toBe('Backspace')
  })
})

describe('shortcut descriptors', () => {
  test('describes every editor-local outline keymap entry', () => {
    const callback = vi.fn()
    const map = createOutlineKeymap({
      onEnter: callback,
      onBackspaceAtStart: callback,
      onIndent: callback,
      onOutdent: callback,
      onArrowUp: callback,
      onArrowDown: callback,
      onToggleCollapse: callback,
      onShiftEnter: callback,
      onOpenFocus: callback,
    })

    expect(outlineShortcutDescriptors.map((descriptor) => descriptor.key)).toEqual(
      Object.keys(map),
    )
  })

  test('enumerates global registrations in stable order without handlers', () => {
    const manager = createShortcutManager('other')
    const unregisterFirst = manager.register({
      id: 'test.first',
      title: 'First',
      key: 'Mod-a',
      handler: vi.fn(),
    })
    manager.register({
      id: 'test.second',
      title: 'Second',
      key: 'Mod-b',
      context: 'editor',
      handler: vi.fn(),
    })

    expect(manager.getDescriptors()).toEqual([
      { id: 'test.first', title: 'First', key: 'Mod-a' },
      { id: 'test.second', title: 'Second', key: 'Mod-b', context: 'editor' },
    ])

    unregisterFirst()
    expect(manager.getDescriptors().map((descriptor) => descriptor.id)).toEqual(['test.second'])
  })

  test('rejects duplicate stable IDs', () => {
    const manager = createShortcutManager()
    const binding = {
      id: 'test.duplicate',
      title: 'Duplicate',
      key: 'Mod-d',
      handler: vi.fn(),
    }

    manager.register(binding)
    expect(() => manager.register(binding)).toThrow(
      'Shortcut already registered: test.duplicate',
    )
  })

  test('combines global and editor-local metadata for help projection', () => {
    const manager = createShortcutManager()
    manager.register({
      id: 'app.toggle-sidebar',
      title: 'Toggle sidebar',
      key: 'Mod-\\',
      handler: vi.fn(),
    })

    const projection = collectShortcutDescriptors(
      manager.getDescriptors(),
      outlineShortcutDescriptors,
    )

    expect(projection[0]?.id).toBe('app.toggle-sidebar')
    expect(projection.some((descriptor) => descriptor.id === 'editor.insert-link')).toBe(false)
  })

  test('matches normalized registrations while preserving context routing', () => {
    const manager = createShortcutManager('other')
    const globalHandler = vi.fn(() => false)
    const editorHandler = vi.fn()
    manager.register({
      id: 'test.global',
      title: 'Global',
      key: 'Mod-b',
      handler: globalHandler,
    })
    manager.register({
      id: 'test.editor',
      title: 'Editor',
      key: 'Mod-b',
      context: 'editor',
      handler: editorHandler,
    })
    manager.setContext('editor')
    manager.install()

    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true })
    document.dispatchEvent(event)
    manager.uninstall()

    expect(globalHandler).toHaveBeenCalledOnce()
    expect(editorHandler).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  test('captures a global shortcut before an editor stops bubbling', () => {
    const manager = createShortcutManager('mac')
    const handler = vi.fn()
    manager.register({
      id: 'app.open-launcher',
      title: 'Open launcher',
      key: 'Mod-k',
      handler,
    })
    manager.install()
    const editor = document.createElement('div')
    editor.addEventListener('keydown', (event) => event.stopPropagation())
    document.body.appendChild(editor)

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    editor.dispatchEvent(event)
    manager.uninstall()
    editor.remove()

    expect(handler).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })
})
