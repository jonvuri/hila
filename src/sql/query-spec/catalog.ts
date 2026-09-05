import type { ColumnDefinition } from '../../core/matrix'

import { QuerySpecError } from './types'

export type QueryNodeIdentity = { matrixId: number; rowId: number }

export type QueryCatalogMatrixInput = {
  id: number
  title?: string
  tableName?: string
  columns: readonly ColumnDefinition[]
}

export type QueryCatalogInput = {
  matrices: readonly QueryCatalogMatrixInput[]
  nodes?: readonly QueryNodeIdentity[]
}

export type QueryCatalogMatrix = QueryCatalogMatrixInput & { tableName: string }

export type QueryCatalog = {
  matrices: readonly QueryCatalogMatrix[]
  nodes: readonly QueryNodeIdentity[]
}

export const matrixDataTableName = (matrixId: number): string => `mx_${matrixId}_data`

export const createQueryCatalog = (input: QueryCatalogInput): QueryCatalog => ({
  matrices: input.matrices.map((matrix) => ({
    ...matrix,
    tableName: matrix.tableName ?? matrixDataTableName(matrix.id),
    columns: [...matrix.columns],
  })),
  nodes: [...(input.nodes ?? [])],
})

export const resolveCatalogMatrix = (
  catalog: QueryCatalog,
  matrixId: number,
): QueryCatalogMatrix => {
  const matrix = catalog.matrices.find((candidate) => candidate.id === matrixId)
  if (!matrix) throw new QuerySpecError('matrix-not-found', `Matrix ${matrixId} not found`)
  const expectedName = matrixDataTableName(matrixId)
  if (matrix.tableName !== expectedName) {
    throw new QuerySpecError(
      'invalid-physical-name',
      `Matrix ${matrixId} must use physical table ${expectedName}`,
    )
  }
  return matrix
}

export const resolveCatalogColumn = (
  matrix: QueryCatalogMatrix,
  columnId: number,
): ColumnDefinition => {
  const column = matrix.columns.find((candidate) => candidate.id === columnId)
  if (!column) {
    throw new QuerySpecError(
      'column-not-found',
      `Column ${columnId} not found in matrix ${matrix.id}`,
    )
  }
  return column
}

export const resolveCatalogNode = (
  catalog: QueryCatalog,
  identity: QueryNodeIdentity,
): QueryNodeIdentity => {
  const node = catalog.nodes.find(
    (candidate) =>
      candidate.matrixId === identity.matrixId && candidate.rowId === identity.rowId,
  )
  if (!node) {
    throw new QuerySpecError(
      'node-not-found',
      `Node ${identity.matrixId}:${identity.rowId} not found`,
    )
  }
  return node
}

export const physicalTextRoleColumns = (matrix: QueryCatalogMatrix): ColumnDefinition[] =>
  matrix.columns.filter(
    (column) =>
      column.formula === null && (column.role === 'label' || column.role === 'content'),
  )
