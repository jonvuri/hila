// Incoming side of the Matrix client interface. Handles the receiving of messages from the worker
// and resolves the promises once the operations are complete.

import type { MatrixWorkerMessage } from '../matrix-types'

import {
  pendingMatrixCreations,
  pendingRowAdditions,
  pendingDatabaseResets,
} from './matrix-client-promises'

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
