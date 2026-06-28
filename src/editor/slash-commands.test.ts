import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { EditorView } from 'prosemirror-view'

import { createOwnedMatrix, createDependentRow } from '../core/client/matrix-client'

import { setPendingNewTable } from './pending-table'
import { openSlashTypePicker } from './slash-type-picker'
import { SLASH_COMMANDS, DEFAULT_TABLE_NAME, matchCommands } from './slash-commands'

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

// `run` only needs an opaque view handle for the launchers we test here.
const fakeView = {} as EditorView
const command = (id: string) => SLASH_COMMANDS.find((c) => c.id === id)!

describe('slash command matching', () => {
  test('empty query returns all commands', () => {
    expect(matchCommands('').map((c) => c.id)).toEqual(['table', 'attach'])
  })

  test('matches a command by id prefix', () => {
    expect(matchCommands('tab').map((c) => c.id)).toEqual(['table'])
    expect(matchCommands('att').map((c) => c.id)).toEqual(['attach'])
  })

  test('matches a command by keyword prefix', () => {
    // 'task' and 'tag' are keywords of attach; 'database' of table.
    expect(matchCommands('task').map((c) => c.id)).toEqual(['attach'])
    expect(matchCommands('data').map((c) => c.id)).toEqual(['table'])
  })

  test('no match returns empty', () => {
    expect(matchCommands('zzz')).toEqual([])
  })
})

describe('slash command registry', () => {
  test('every command is an argument-free launcher (has a run)', () => {
    expect(SLASH_COMMANDS.map((c) => c.id)).toEqual(['table', 'attach'])
    for (const cmd of SLASH_COMMANDS) {
      expect(typeof cmd.run).toBe('function')
    }
  })
})

describe('slash command run dispatch', () => {
  beforeEach(() => {
    vi.mocked(createOwnedMatrix).mockClear()
    vi.mocked(createDependentRow).mockClear()
    vi.mocked(setPendingNewTable).mockClear()
    vi.mocked(openSlashTypePicker).mockClear()
  })

  test('/table mints a dedicated own-matrix (label + content) and hands off to its name input', async () => {
    command('table').run({ matrixId: 7, rowId: 42 }, fakeView)

    expect(createOwnedMatrix).toHaveBeenCalledWith(
      { matrixId: 7, rowId: 42 },
      DEFAULT_TABLE_NAME,
      [
        { name: 'title', type: 'TEXT', role: 'label' },
        { name: 'content', type: 'TEXT', role: 'content' },
      ],
    )
    expect(createDependentRow).not.toHaveBeenCalled()
    expect(openSlashTypePicker).not.toHaveBeenCalled()

    // The run is fire-and-forget; once the create resolves, the new matrix id is
    // queued for the SubTableBand name-input handoff.
    await vi.waitFor(() => expect(setPendingNewTable).toHaveBeenCalledWith(123))
  })

  test('/attach opens the standalone type picker (no inline arg, no op yet)', () => {
    const node = { matrixId: 7, rowId: 42 }
    command('attach').run(node, fakeView)

    expect(openSlashTypePicker).toHaveBeenCalledWith(fakeView, node)
    // Instantiation happens when the user picks a type *in the second menu*, not
    // as part of the launcher itself.
    expect(createDependentRow).not.toHaveBeenCalled()
    expect(createOwnedMatrix).not.toHaveBeenCalled()
  })
})
