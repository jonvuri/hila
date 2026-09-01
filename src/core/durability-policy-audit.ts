import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  CORE_DURABILITY_POLICY,
  DYNAMIC_DATA_TABLE_PATTERN,
  getColumnDurabilityPolicy,
  getTableDurabilityPolicy,
} from './durability-policy'

type SchemaColumn = {
  name: string
  type: string
}

type SchemaTable = {
  name: string
  columns: SchemaColumn[]
}

type TrackingTrigger = {
  name: string
  namedOperation: TrackingOperation | 'UNKNOWN'
  operation: TrackingOperation | 'UNKNOWN'
  columns: string[]
}

const TRACKING_OPERATIONS = ['INSERT', 'UPDATE', 'DELETE'] as const
type TrackingOperation = (typeof TRACKING_OPERATIONS)[number]

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const getSchemaTables = (db: Database): SchemaTable[] => {
  const stmt = db.prepare(
    `SELECT name
     FROM sqlite_schema
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  )
  const names: string[] = []
  while (stmt.step()) names.push((stmt.get({}) as { name: string }).name)
  stmt.finalize()

  return names.map((name) => {
    const columnStmt = db.prepare(`PRAGMA table_info(${quoteIdent(name)})`)
    const columns: SchemaColumn[] = []
    while (columnStmt.step()) {
      const column = columnStmt.get({}) as SchemaColumn
      columns.push({ name: column.name, type: column.type })
    }
    columnStmt.finalize()
    return { name, columns }
  })
}

const getExpectedDynamicTables = (db: Database): Map<string, SchemaColumn[]> => {
  const stmt = db.prepare(
    `SELECT matrix.id AS matrix_id, matrix_columns.name, matrix_columns.type
     FROM matrix
     LEFT JOIN matrix_columns
       ON matrix_columns.matrix_id = matrix.id AND matrix_columns.formula IS NULL
     ORDER BY matrix.id, matrix_columns."order", matrix_columns.id`,
  )
  const tables = new Map<string, SchemaColumn[]>()
  while (stmt.step()) {
    const row = stmt.get({}) as {
      matrix_id: number
      name: string | null
      type: string | null
    }
    const tableName = `mx_${row.matrix_id}_data`
    const columns = tables.get(tableName) ?? [{ name: 'id', type: 'INTEGER' }]
    if (row.name !== null && row.type !== null) columns.push({ name: row.name, type: row.type })
    tables.set(tableName, columns)
  }
  stmt.finalize()
  return tables
}

const getJsonObjectArguments = (sql: string): string | null => {
  const marker = 'json_object('
  const start = sql.toLowerCase().indexOf(marker)
  if (start === -1) return null

  let depth = 1
  let inString = false
  const argumentStart = start + marker.length
  for (let i = argumentStart; i < sql.length; i++) {
    const char = sql[i]
    if (char === "'") {
      if (inString && sql[i + 1] === "'") {
        i++
      } else {
        inString = !inString
      }
      continue
    }
    if (inString) continue
    if (char === '(') depth++
    if (char === ')') depth--
    if (depth === 0) return sql.slice(argumentStart, i)
  }
  return null
}

const splitSqlArguments = (sql: string): string[] => {
  const argumentsList: string[] = []
  let start = 0
  let depth = 0
  let inString = false
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    if (char === "'") {
      if (inString && sql[i + 1] === "'") {
        i++
      } else {
        inString = !inString
      }
      continue
    }
    if (inString) continue
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      argumentsList.push(sql.slice(start, i).trim())
      start = i + 1
    }
  }
  argumentsList.push(sql.slice(start).trim())
  return argumentsList
}

const getTrackedColumns = (sql: string): string[] => {
  const jsonArguments = getJsonObjectArguments(sql)
  if (!jsonArguments) return []
  const argumentsList = splitSqlArguments(jsonArguments)
  const columns: string[] = []
  for (let i = 0; i < argumentsList.length; i += 2) {
    const match = argumentsList[i]?.match(/^'((?:''|[^'])*)'$/)
    if (match) columns.push(match[1]!.replace(/''/g, "'"))
  }
  return columns
}

const getTriggerOperation = (sql: string): TrackingOperation | 'UNKNOWN' => {
  const match = sql.match(/\bAFTER\s+(INSERT|UPDATE|DELETE)\s+ON\b/i)
  return match ? (match[1]!.toUpperCase() as TrackingOperation) : 'UNKNOWN'
}

const getTrackingTriggers = (db: Database): Map<string, TrackingTrigger[]> => {
  const stmt = db.prepare(
    `SELECT name, tbl_name, sql
     FROM sqlite_schema
     WHERE type = 'trigger' AND name LIKE '_sync_track_%'
     ORDER BY tbl_name, name`,
  )
  const byTable = new Map<string, TrackingTrigger[]>()
  while (stmt.step()) {
    const row = stmt.get({}) as { name: string; tbl_name: string; sql: string }
    const namedOperation = TRACKING_OPERATIONS.find((candidate) =>
      row.name.endsWith(`_${candidate}`),
    )
    const triggers = byTable.get(row.tbl_name) ?? []
    triggers.push({
      name: row.name,
      namedOperation: namedOperation ?? 'UNKNOWN',
      operation: getTriggerOperation(row.sql),
      columns: getTrackedColumns(row.sql),
    })
    byTable.set(row.tbl_name, triggers)
  }
  stmt.finalize()
  return byTable
}

/** Return contract violations between the live SQLite schema, policy, and tracking triggers. */
export const auditDurabilityPolicy = (db: Database): string[] => {
  const issues: string[] = []
  const tables = getSchemaTables(db)
  const tableNames = new Set(tables.map((table) => table.name))
  const triggersByTable = getTrackingTriggers(db)
  const canInspectDynamicTables = tableNames.has('matrix') && tableNames.has('matrix_columns')
  const expectedDynamicTables =
    canInspectDynamicTables ? getExpectedDynamicTables(db) : new Map<string, SchemaColumn[]>()

  for (const tableName of Object.keys(CORE_DURABILITY_POLICY)) {
    if (!tableNames.has(tableName))
      issues.push(`Policy table is missing from schema: ${tableName}`)
  }

  for (const tableName of expectedDynamicTables.keys()) {
    if (!tableNames.has(tableName)) issues.push(`Dynamic data table is missing: ${tableName}`)
  }

  for (const table of tables) {
    const tablePolicy = getTableDurabilityPolicy(table.name)
    if (!tablePolicy) {
      issues.push(`Unclassified table: ${table.name}`)
      continue
    }

    const isDynamicTable = DYNAMIC_DATA_TABLE_PATTERN.test(table.name)
    const expectedDynamicColumns = expectedDynamicTables.get(table.name)
    if (isDynamicTable && canInspectDynamicTables && !expectedDynamicColumns) {
      issues.push(`Orphan dynamic data table: ${table.name}`)
    }

    for (const column of table.columns) {
      const columnPolicy = getColumnDurabilityPolicy(table.name, column.name)
      if (!columnPolicy) {
        issues.push(`Unclassified column: ${table.name}.${column.name}`)
      } else if (!isDynamicTable && columnPolicy.storageType !== column.type) {
        issues.push(
          `Column type differs from policy: ${table.name}.${column.name} ` +
            `(expected ${columnPolicy.storageType}, received ${column.type})`,
        )
      }
    }

    if (isDynamicTable && expectedDynamicColumns) {
      for (const column of table.columns) {
        const expectedColumn = expectedDynamicColumns.find(
          (candidate) => candidate.name === column.name,
        )
        if (!expectedColumn) {
          issues.push(`Unregistered dynamic column: ${table.name}.${column.name}`)
        } else if (expectedColumn.type !== column.type) {
          issues.push(
            `Dynamic column type differs from registry: ${table.name}.${column.name} ` +
              `(expected ${expectedColumn.type}, received ${column.type})`,
          )
        }
      }
      for (const column of expectedDynamicColumns) {
        if (!table.columns.some((candidate) => candidate.name === column.name)) {
          issues.push(`Registered dynamic column is missing: ${table.name}.${column.name}`)
        }
      }
    } else if (!isDynamicTable) {
      for (const columnName of Object.keys(tablePolicy.columns)) {
        if (!table.columns.some((column) => column.name === columnName)) {
          issues.push(`Policy column is missing from schema: ${table.name}.${columnName}`)
        }
      }
    }

    const triggers = triggersByTable.get(table.name) ?? []
    if (tablePolicy.durability !== 'replicated-source') {
      if (triggers.length > 0) {
        issues.push(`Non-replicated table is tracked: ${table.name}`)
      }
      continue
    }

    const policyColumns = expectedDynamicColumns ?? table.columns
    const expectedColumns = policyColumns
      .filter((column) => {
        const columnPolicy = getColumnDurabilityPolicy(table.name, column.name)
        return columnPolicy?.durability === 'replicated-source'
      })
      .map((column) => column.name)
      .sort()

    for (const operation of TRACKING_OPERATIONS) {
      const trigger = triggers.find((candidate) => candidate.operation === operation)
      if (!trigger) {
        issues.push(`Missing tracking trigger: ${table.name}.${operation}`)
        continue
      }
      const actualColumns = [...trigger.columns].sort()
      if (actualColumns.join('\0') !== expectedColumns.join('\0')) {
        issues.push(
          `Tracked columns differ: ${table.name}.${operation} ` +
            `(expected ${expectedColumns.join(', ')}, received ${actualColumns.join(', ')})`,
        )
      }
    }

    for (const trigger of triggers) {
      if (trigger.namedOperation === 'UNKNOWN') {
        issues.push(`Unknown tracking trigger: ${trigger.name}`)
      } else if (trigger.operation === 'UNKNOWN') {
        issues.push(`Unknown tracking trigger operation: ${trigger.name}`)
      } else if (trigger.namedOperation !== trigger.operation) {
        issues.push(
          `Tracking trigger operation differs from name: ${trigger.name} ` +
            `(name ${trigger.namedOperation}, SQL ${trigger.operation})`,
        )
      }
    }
  }

  return issues
}
