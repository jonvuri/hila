export const pendingMatrixCreations: Map<
  string,
  { resolve: (matrixId: number) => void; reject: (err: unknown) => void }
> = new Map()

export const pendingRowAdditions: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()

export const pendingDatabaseResets: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()

export const pendingRowInserts: Map<
  string,
  {
    resolve: (result: { key: Uint8Array; rowId: number }) => void
    reject: (err: unknown) => void
  }
> = new Map()

export const pendingRowUpdates: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()

export const pendingRowDeletes: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()

export const pendingRowReparents: Map<
  string,
  { resolve: (newKey: Uint8Array) => void; reject: (err: unknown) => void }
> = new Map()

export const pendingSubtreeDeletes: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()
