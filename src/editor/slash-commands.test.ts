import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { commandRegistry } from '../command-registry'
import { createOwnedMatrix, createDependentRow } from '../core/client/matrix-client'

import { setPendingNewTable } from './pending-table'
import { matchCommands, runSlashCommand } from './slash-commands'
import { openSlashTypePicker } from './slash-type-picker'
import { DEFAULT_TABLE_NAME, structuralCommands } from './structural-commands'

vi.mock('../core/client/matrix-client', () => ({
  createOwnedMatrix: vi.fn(async () => 123),
  createDependentRow: vi.fn(async () => 456),
}))

vi.mock('./pending-table', () => ({
  setPendingNewTable: vi.fn(),
}))

vi.mock('./slash-type-picker', () => ({
  openSlashTypePicker: vi.fn(),
}))

const fakeView = {} as EditorView
const node = { matrixId: 7, rowId: 42 }

describe('slash command adapter', () => {
  beforeEach(() => {
    commandRegistry.replaceOwner('hila.workspace', structuralCommands)
    vi.mocked(createOwnedMatrix).mockClear()
    vi.mocked(createDependentRow).mockClear()
    vi.mocked(setPendingNewTable).mockClear()
    vi.mocked(openSlashTypePicker).mockClear()
  })

  afterEach(() => commandRegistry.unregisterOwner('hila.workspace'))

  test('preserves table then attach order for an empty query', () => {
    expect(matchCommands('', node, fakeView).map(({ id }) => id)).toEqual([
      'hila.table',
      'hila.attach',
    ])
  })

  test('exposes the surface-neutral table command to the launcher only', () => {
    const entries = commandRegistry.entries({
      surface: 'launcher',
      subject: node,
      capabilities: { focusCreatedTable: vi.fn() },
    })

    expect(entries.map(({ command }) => command.id)).toEqual(['hila.table'])
  })

  test('matches IDs, keyword prefixes, and no-result queries', () => {
    expect(matchCommands('tab', node, fakeView).map(({ id }) => id)).toEqual(['hila.table'])
    expect(matchCommands('task', node, fakeView).map(({ id }) => id)).toEqual(['hila.attach'])
    expect(matchCommands('data', node, fakeView).map(({ id }) => id)).toEqual(['hila.table'])
    expect(matchCommands('zzz', node, fakeView)).toEqual([])
  })

  test('/table creates the same dedicated matrix and preserves the name handoff', async () => {
    await runSlashCommand('hila.table', node, fakeView)

    expect(createOwnedMatrix).toHaveBeenCalledWith(node, DEFAULT_TABLE_NAME, [
      { name: 'title', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    expect(setPendingNewTable).toHaveBeenCalledWith(123)
    expect(createDependentRow).not.toHaveBeenCalled()
    expect(openSlashTypePicker).not.toHaveBeenCalled()
  })

  test('/attach opens the same standalone type picker without creating a row', async () => {
    await runSlashCommand('hila.attach', node, fakeView)

    expect(openSlashTypePicker).toHaveBeenCalledWith(fakeView, node)
    expect(createDependentRow).not.toHaveBeenCalled()
    expect(createOwnedMatrix).not.toHaveBeenCalled()
  })
})
