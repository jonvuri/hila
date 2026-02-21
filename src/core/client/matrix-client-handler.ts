// Incoming side of the Matrix client interface. Handles the receiving of messages from the worker
// and resolves the promises once the operations are complete.

import type { MatrixWorkerMessage } from '../matrix-types'

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

const resolve = <T>(
  map: Map<string, { resolve: (v: T) => void; reject: (e: unknown) => void }>,
  id: string,
  value: T,
) => {
  const r = map.get(id)
  if (r) {
    r.resolve(value)
    map.delete(id)
  }
}

const reject = (
  map: Map<string, { resolve: (...args: never[]) => void; reject: (e: unknown) => void }>,
  id: string,
  error: unknown,
) => {
  const r = map.get(id)
  if (r) {
    r.reject(error)
    map.delete(id)
  }
}

export const handleMatrixWorkerMessage = (message: MatrixWorkerMessage) => {
  const { type } = message

  switch (type) {
    // Matrix creation operations
    case 'createMatrixSuccess': {
      resolve(pendingMatrixCreations, message.id, message.matrixId)
      break
    }
    case 'createMatrixError': {
      reject(pendingMatrixCreations, message.id, message.error)
      break
    }

    // Sample row addition operations
    case 'addSampleRowsAck': {
      resolve(pendingRowAdditions, message.id, undefined)
      break
    }
    case 'addSampleRowsError': {
      reject(pendingRowAdditions, message.id, message.error)
      break
    }

    // Database reset operations
    case 'resetDatabaseAck': {
      resolve(pendingDatabaseResets, message.id, undefined)
      break
    }
    case 'resetDatabaseError': {
      reject(pendingDatabaseResets, message.id, message.error)
      break
    }

    // Row insert operations
    case 'insertRowSuccess': {
      resolve(pendingRowInserts, message.id, { key: message.key, rowId: message.rowId })
      break
    }
    case 'insertRowError': {
      reject(pendingRowInserts, message.id, message.error)
      break
    }

    // Row update operations
    case 'updateRowAck': {
      resolve(pendingRowUpdates, message.id, undefined)
      break
    }
    case 'updateRowError': {
      reject(pendingRowUpdates, message.id, message.error)
      break
    }

    // Row delete operations
    case 'deleteRowAck': {
      resolve(pendingRowDeletes, message.id, undefined)
      break
    }
    case 'deleteRowError': {
      reject(pendingRowDeletes, message.id, message.error)
      break
    }

    // Row reparent operations
    case 'reparentRowSuccess': {
      resolve(pendingRowReparents, message.id, message.newKey)
      break
    }
    case 'reparentRowError': {
      reject(pendingRowReparents, message.id, message.error)
      break
    }

    // Subtree delete operations
    case 'deleteSubtreeAck': {
      resolve(pendingSubtreeDeletes, message.id, undefined)
      break
    }
    case 'deleteSubtreeError': {
      reject(pendingSubtreeDeletes, message.id, message.error)
      break
    }
  }
}
