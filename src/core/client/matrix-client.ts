// Outgoing side of the Matrix client interface. Sends messages to the worker
// that will resolve the promises once the operations are complete.

import type {
  CreateMatrixMessage,
  AddSampleRowsMessage,
  ResetDatabaseMessage,
  InsertRowMessage,
  UpdateRowMessage,
  DeleteRowMessage,
  ReparentRowMessage,
  DeleteSubtreeMessage,
} from '../matrix-types'

import { postMessage } from './worker-client'
import {
  pendingMatrixCreations,
  pendingRowAdditions,
  pendingDatabaseResets,
  pendingRowInserts,
  pendingRowUpdates,
  pendingRowDeletes,
  pendingRowReparents,
  pendingSubtreeDeletes,
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

export const insertRow = (
  matrixId: number,
  params?: {
    parentKey?: Uint8Array
    prevKey?: Uint8Array
    nextKey?: Uint8Array
    values?: Record<string, unknown>
  },
) =>
  new Promise<{ key: Uint8Array; rowId: number }>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingRowInserts.set(id, { resolve, reject })
    const message: InsertRowMessage = {
      type: 'insertRow',
      id,
      matrixId,
      ...params,
    }
    postMessage(message)
  })

export const updateRow = (matrixId: number, rowId: number, values: Record<string, unknown>) =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingRowUpdates.set(id, { resolve, reject })
    const message: UpdateRowMessage = { type: 'updateRow', id, matrixId, rowId, values }
    postMessage(message)
  })

export const deleteRow = (matrixId: number, key: Uint8Array) =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingRowDeletes.set(id, { resolve, reject })
    const message: DeleteRowMessage = { type: 'deleteRow', id, matrixId, key }
    postMessage(message)
  })

export const reparentRow = (
  matrixId: number,
  nodeKey: Uint8Array,
  params?: {
    newParentKey?: Uint8Array
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingRowReparents.set(id, { resolve, reject })
    const message: ReparentRowMessage = {
      type: 'reparentRow',
      id,
      matrixId,
      nodeKey,
      ...params,
    }
    postMessage(message)
  })

export const deleteSubtree = (matrixId: number, key: Uint8Array) =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingSubtreeDeletes.set(id, { resolve, reject })
    const message: DeleteSubtreeMessage = { type: 'deleteSubtree', id, matrixId, key }
    postMessage(message)
  })
