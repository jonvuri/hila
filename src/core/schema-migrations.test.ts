import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  getSchemaVersion,
  runSchemaMigrations,
  setSchemaVersion,
  type SchemaMigration,
  UnsupportedSchemaVersionError,
} from './schema-migrations'
import { initMatrixSchema } from './matrix'

describe('reset-only schema initialization', () => {
  test('keeps fresh databases at reset-only version 0 and remains idempotent', async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    const freshDb = new sqlite3.oo1.DB(':memory:', 'c')

    initMatrixSchema(freshDb)

    expect(getSchemaVersion(freshDb)).toBe(0)
    expect(
      freshDb.selectValue("SELECT COUNT(*) FROM sqlite_schema WHERE name = 'matrix'"),
    ).toBe(1)
    expect(() => initMatrixSchema(freshDb)).not.toThrow()
    expect(getSchemaVersion(freshDb)).toBe(0)

    setSchemaVersion(freshDb, 1)
    expect(() => initMatrixSchema(freshDb)).toThrow(UnsupportedSchemaVersionError)
  })
})

describe('schema migrations', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    db.exec(`
      CREATE TABLE migration_fixture (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      INSERT INTO migration_fixture (id, value) VALUES (1, 'before');
    `)
    setSchemaVersion(db, 1)
  })

  test('applies contiguous migrations in forward order and advances stored version', () => {
    const migrations: SchemaMigration[] = [
      {
        version: 2,
        name: 'add status',
        up: (migrationDb) => {
          migrationDb.exec(
            "ALTER TABLE migration_fixture ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
          )
        },
      },
      {
        version: 3,
        name: 'populate status',
        up: (migrationDb) => {
          migrationDb.exec("UPDATE migration_fixture SET status = value || '-migrated'")
        },
      },
    ]

    runSchemaMigrations(db, migrations, 3)

    expect(getSchemaVersion(db)).toBe(3)
    expect(db.selectObject('SELECT value, status FROM migration_fixture WHERE id = 1')).toEqual(
      { value: 'before', status: 'before-migrated' },
    )
    expect(() => runSchemaMigrations(db, migrations, 3)).not.toThrow()
  })

  test('rolls back the full migration batch and version metadata on failure', () => {
    const migrations: SchemaMigration[] = [
      {
        version: 2,
        name: 'add status',
        up: (migrationDb) => {
          migrationDb.exec(
            "ALTER TABLE migration_fixture ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
          )
        },
      },
      {
        version: 3,
        name: 'fail after mutation',
        up: (migrationDb) => {
          migrationDb.exec("UPDATE migration_fixture SET value = 'changed'")
          migrationDb.exec('INSERT INTO missing_table DEFAULT VALUES')
        },
      },
    ]

    expect(() => runSchemaMigrations(db, migrations, 3)).toThrow()

    expect(getSchemaVersion(db)).toBe(1)
    expect(db.selectValue('SELECT value FROM migration_fixture WHERE id = 1')).toBe('before')
    const columns = db.selectObjects("PRAGMA table_info('migration_fixture')") as unknown as {
      name: string
    }[]
    expect(columns.map(({ name }) => name)).toEqual(['id', 'value'])
  })

  test('rejects gaps and databases newer than this build', () => {
    const missingVersion: SchemaMigration[] = [
      {
        version: 3,
        name: 'skips version two',
        up: () => {},
      },
    ]
    expect(() => runSchemaMigrations(db, missingVersion, 3)).toThrow(
      'Missing schema migration for version 2',
    )

    setSchemaVersion(db, 4)
    expect(() => runSchemaMigrations(db, [], 3)).toThrow(UnsupportedSchemaVersionError)
  })
})
