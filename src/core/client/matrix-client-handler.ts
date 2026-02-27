import type { MatrixWorkerMessage } from '../matrix-types'
import { recordMutation } from '../../debug/debugState'

import { pendingRequests } from './matrix-client-promises'

const STRUCTURAL_OPS = new Set([
  'insertRowSuccess',
  'deleteRowSuccess',
  'reparentRowSuccess',
  'deleteSubtreeSuccess',
])

export const handleMatrixWorkerMessage = (message: MatrixWorkerMessage) => {
  const pending = pendingRequests.get(message.id)
  if (!pending) return
  pendingRequests.delete(message.id)

  if ('error' in message) {
    pending.reject(message.error)
  } else {
    if (STRUCTURAL_OPS.has(message.type)) {
      recordMutation(message.type.replace('Success', ''))
    }
    pending.resolve(message.result)
  }
}
