import type { Database } from '@sqlite.org/sqlite-wasm'

import { withTransaction } from './transaction'

/** The first schema version whose data is covered by the durability promise. */
export const DURABILITY_MILESTONE_SCHEMA_VERSION = 1

/** Version 0 remains reset-only until the durable dogfooding gate is crossed. */
export const CURRENT_SCHEMA_VERSION = 0

export type SchemaMigration = {
  version: number
  name: string
  up: (db: Database) => void
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(version: number, currentVersion: number) {
    super(
      `Database schema version ${version} is newer than supported version ${currentVersion}`,
    )
    this.name = 'UnsupportedSchemaVersionError'
  }
}

export const getSchemaVersion = (db: Database): number =>
  db.selectValue('PRAGMA user_version') as number

export const setSchemaVersion = (db: Database, version: number): void => {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error(`Invalid database schema version: ${version}`)
  }
  db.exec(`PRAGMA user_version = ${version}`)
}

/**
 * Apply every pending migration in ascending, contiguous version order.
 *
 * The complete batch and its version writes share one transaction. A failure
 * therefore leaves both schema and version metadata at the opening version.
 * The caller must arrange the required persistent backup before supplying any
 * pending production migration.
 */
export const runSchemaMigrations = (
  db: Database,
  migrations: readonly SchemaMigration[],
  currentVersion: number,
): void => {
  const openingVersion = getSchemaVersion(db)

  if (openingVersion > currentVersion) {
    throw new UnsupportedSchemaVersionError(openingVersion, currentVersion)
  }

  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index]!
    const previousMigration = migrations[index - 1]
    if (
      migration.version < 1 ||
      (previousMigration !== undefined && previousMigration.version >= migration.version)
    ) {
      throw new Error('Schema migrations must be declared once in ascending version order')
    }
  }

  const pending = migrations.filter(
    ({ version }) => version > openingVersion && version <= currentVersion,
  )
  for (let index = 0; index < pending.length; index += 1) {
    const expectedVersion = openingVersion + index + 1
    if (pending[index]!.version !== expectedVersion) {
      throw new Error(`Missing schema migration for version ${expectedVersion}`)
    }
  }

  if (openingVersion === currentVersion) return
  if (pending.at(-1)?.version !== currentVersion) {
    throw new Error(`Missing schema migration for version ${currentVersion}`)
  }

  withTransaction(db, () => {
    for (const migration of pending) {
      migration.up(db)
      setSchemaVersion(db, migration.version)
    }
  })
}

// At the durable dogfooding gate, establish version 1 as the baseline. Add
// each later production migration here and increment CURRENT_SCHEMA_VERSION.
export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = []

export const migrateSchema = (db: Database): void => {
  runSchemaMigrations(db, SCHEMA_MIGRATIONS, CURRENT_SCHEMA_VERSION)
}
