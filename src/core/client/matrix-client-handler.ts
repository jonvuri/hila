import type { MatrixWorkerMessage } from '../matrix-types'

import { pendingRequests } from './matrix-client-promises'

export const handleMatrixWorkerMessage = (message: MatrixWorkerMessage) => {
  const pending = pendingRequests.get(message.id)
  if (!pending) return
  pendingRequests.delete(message.id)

  if ('error' in message) {
    pending.reject(message.error)
  } else {
    pending.resolve(message.result)
  }
}
