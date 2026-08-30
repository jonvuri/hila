export type ChangeEntry = {
  table: string
  rowId: number
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  timestamp: string
  data: Record<string, unknown> | null
}

export type Changeset = {
  deviceId: string
  fromSeq: number
  toSeq: number
  /** Source changelog order. Receivers must preserve it during apply. */
  entries: ChangeEntry[]
}

export type ConflictRecord = {
  id: number
  tableName: string
  rowId: number
  winner: 'local' | 'remote'
  losingData: string
  winningData: string
  detectedAt: string
  resolved: number
}

export type ApplyResult = {
  applied: number
  conflicts: ConflictRecord[]
}
