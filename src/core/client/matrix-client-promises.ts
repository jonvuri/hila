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
