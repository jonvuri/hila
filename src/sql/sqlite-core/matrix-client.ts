// TODO:
// - [ ] Make into closure function instead of requiring init
// - [ ] Abstract pending map type and creation

import type {
  MatrixClientMessage,
  MatrixWorkerMessage,
  CreateMatrixMessage,
  AddSampleRowsMessage,
  ResetDatabaseMessage,
} from './matrix-types'

// Message posting interface - will be injected by main client
type MessagePoster = (message: MatrixClientMessage) => void

let postMessage: MessagePoster = () => {
  throw new Error('Matrix client not initialized - postMessage not set')
}

export const initMatrixClient = (poster: MessagePoster) => {
  postMessage = poster
}

const pendingMatrixCreations: Map<
  string,
  { resolve: (matrixId: number) => void; reject: (err: unknown) => void }
> = new Map()

const pendingRowAdditions: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()

const pendingDatabaseResets: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()

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

export const handleMatrixWorkerMessage = (message: MatrixWorkerMessage) => {
  const { type } = message

  switch (type) {
    // Matrix creation operations
    case 'createMatrixSuccess': {
      const { id, matrixId } = message
      const resolver = pendingMatrixCreations.get(id)
      if (resolver) {
        resolver.resolve(matrixId)
        pendingMatrixCreations.delete(id)
      }
      break
    }
    case 'createMatrixError': {
      const { id, error } = message
      const resolver = pendingMatrixCreations.get(id)
      if (resolver) {
        resolver.reject(error)
        pendingMatrixCreations.delete(id)
      }
      break
    }

    // Sample row addition operations
    case 'addSampleRowsAck': {
      const { id } = message
      const resolver = pendingRowAdditions.get(id)
      if (resolver) {
        resolver.resolve()
        pendingRowAdditions.delete(id)
      }
      break
    }
    case 'addSampleRowsError': {
      const { id, error } = message
      const resolver = pendingRowAdditions.get(id)
      if (resolver) {
        resolver.reject(error)
        pendingRowAdditions.delete(id)
      }
      break
    }

    // Database reset operations
    case 'resetDatabaseAck': {
      const { id } = message
      const resolver = pendingDatabaseResets.get(id)
      if (resolver) {
        resolver.resolve()
        pendingDatabaseResets.delete(id)
      }
      break
    }
    case 'resetDatabaseError': {
      const { id, error } = message
      const resolver = pendingDatabaseResets.get(id)
      if (resolver) {
        resolver.reject(error)
        pendingDatabaseResets.delete(id)
      }
      break
    }
  }
}
