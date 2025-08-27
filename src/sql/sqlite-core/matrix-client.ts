import { postMessage } from './worker-client'
import type {
  CreateMatrixMessage,
  AddSampleRowsMessage,
  ResetDatabaseMessage,
} from './matrix-types'
import {
  pendingMatrixCreations,
  pendingRowAdditions,
  pendingDatabaseResets,
} from './matrix-client-promises'

export const createMatrix = (title: string) =>
  new Promise<number>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingMatrixCreations.set(id, { resolve, reject })
    const message: CreateMatrixMessage = { type: 'createMatrix', id, title }
    postMessage(message)
  })

export const addSampleRows = (matrixId: number) =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingRowAdditions.set(id, { resolve, reject })
    const message: AddSampleRowsMessage = { type: 'addSampleRows', id, matrixId }
    postMessage(message)
  })

export const resetDatabase = () =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingDatabaseResets.set(id, { resolve, reject })
    const message: ResetDatabaseMessage = { type: 'resetDatabase', id }
    postMessage(message)
  })
