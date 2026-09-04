/**
 * Reviewed durability policy for every application-owned SQLite table.
 *
 * SQLite's internal `sqlite_*` tables are outside this manifest. Dynamic
 * matrix data tables use `DYNAMIC_DATA_TABLE_POLICY` because their physical
 * columns come from `matrix_columns`.
 */

export type DurabilityClass = 'replicated-source' | 'derived' | 'device-local'

export type DurabilityColumnPolicy = {
  storageType: string
  durability: DurabilityClass
  responsibility: string
}

export type DurabilityTablePolicy = {
  durability: DurabilityClass
  responsibility: string
  identity: readonly string[]
  deleteSemantics: string
  columns: Readonly<Record<string, DurabilityColumnPolicy>>
}

const source = (storageType: string, responsibility: string): DurabilityColumnPolicy => ({
  storageType,
  durability: 'replicated-source',
  responsibility,
})

const derived = (storageType: string, responsibility: string): DurabilityColumnPolicy => ({
  storageType,
  durability: 'derived',
  responsibility,
})

const local = (storageType: string, responsibility: string): DurabilityColumnPolicy => ({
  storageType,
  durability: 'device-local',
  responsibility,
})

export const CORE_DURABILITY_POLICY = {
  plugins: {
    durability: 'replicated-source',
    responsibility: 'Installed plugin identity, version, state, and persistent metadata.',
    identity: ['id'],
    deleteSemantics: 'Delete by stable plugin ID; matrixes and user data survive.',
    columns: {
      id: source('TEXT', 'Stable plugin ID.'),
      name: source('TEXT', 'User-visible plugin name.'),
      version: source('TEXT', 'Installed plugin version.'),
      enabled: source('INTEGER', 'Durable enabled state.'),
      metadata: source('TEXT', 'Plugin-owned durable metadata, including matrix IDs.'),
    },
  },
  matrix: {
    durability: 'replicated-source',
    responsibility: 'Matrix identity, schema provenance, display name, and optional owner.',
    identity: ['id'],
    deleteSemantics: 'Delete by stable matrix ID after dependent row and relation cleanup.',
    columns: {
      id: source('INTEGER', 'Stable random matrix ID.'),
      title: source(
        'TEXT',
        'Authoritative ordinary-matrix title; also the replicated display cache for promoted types.',
      ),
      source_plugin_id: source('TEXT', 'Plugin that provisioned the matrix, when any.'),
      owner_matrix_id: source('INTEGER', 'Matrix half of the optional owning node identity.'),
      owner_row_id: source('INTEGER', 'Row half of the optional owning node identity.'),
    },
  },
  matrix_columns: {
    durability: 'replicated-source',
    responsibility: 'Stable matrix schema and presentation metadata.',
    identity: ['id'],
    deleteSemantics:
      'Delete by stable column ID; dependent normalized metadata follows its FKs.',
    columns: {
      id: source('INTEGER', 'Stable random column ID.'),
      matrix_id: source('INTEGER', 'Owning matrix ID.'),
      name: source('TEXT', 'Current physical column name.'),
      type: source('TEXT', 'Declared SQLite storage type.'),
      display_type: source('TEXT', 'User-visible editor and renderer type.'),
      order: source('INTEGER', 'User-visible column order.'),
      options: source('TEXT', 'Display-type options.'),
      formula: source('TEXT', 'Stable-ID-based formula expression, when computed.'),
      constraints: source('TEXT', 'Declared schema constraints.'),
      managed_by: source('TEXT', 'Plugin that owns the column contract, when any.'),
      role: source('TEXT', 'Optional label or content semantic role.'),
    },
  },
  closure: {
    durability: 'derived',
    responsibility: 'Rebuildable transitive closure of own edges.',
    identity: [
      'ancestor_matrix_id',
      'ancestor_row_id',
      'descendant_matrix_id',
      'descendant_row_id',
    ],
    deleteSemantics: 'Never replicate; clear and rebuild from joins.',
    columns: {
      ancestor_matrix_id: derived('INTEGER', 'Ancestor matrix identity.'),
      ancestor_row_id: derived('INTEGER', 'Ancestor row identity.'),
      descendant_matrix_id: derived('INTEGER', 'Descendant matrix identity.'),
      descendant_row_id: derived('INTEGER', 'Descendant row identity.'),
      depth: derived('INTEGER', 'Derived ownership distance.'),
    },
  },
  scroll_index: {
    durability: 'derived',
    responsibility: 'Rebuildable position index over own and portal edges.',
    identity: ['global_lexkey'],
    deleteSemantics: 'Never replicate; clear and rebuild from joins.',
    columns: {
      global_lexkey: derived('BLOB', 'Derived appearance-path order key.'),
      matrix_id: derived('INTEGER', 'Rendered node matrix identity.'),
      row_id: derived('INTEGER', 'Rendered node row identity.'),
      depth: derived('INTEGER', 'Derived appearance depth.'),
      is_ghost: derived('INTEGER', 'Derived missing-home flag.'),
      lazy: derived('INTEGER', 'Derived portal expansion flag.'),
    },
  },
  joins: {
    durability: 'replicated-source',
    responsibility: 'Ownership, reference, portal, and sibling-position truth.',
    identity: ['source_matrix_id', 'source_row_id', 'target_matrix_id', 'target_row_id'],
    deleteSemantics: 'Delete by the full logical composite key recorded from OLD values.',
    columns: {
      source_matrix_id: source('INTEGER', 'Source node matrix identity.'),
      source_row_id: source('INTEGER', 'Source node row identity.'),
      target_matrix_id: source('INTEGER', 'Target node matrix identity.'),
      target_row_id: source('INTEGER', 'Target node row identity.'),
      kind: source('TEXT', 'Relationship kind: own, ref, or portal.'),
      edge_key: source('BLOB', 'Sibling-local position truth for own and portal edges.'),
    },
  },
  _sync_state: {
    durability: 'device-local',
    responsibility: 'Replica identity and transport high-water marks.',
    identity: ['key'],
    deleteSemantics: 'Local engine lifecycle only.',
    columns: {
      key: local('TEXT', 'Local engine-state key.'),
      value: local('TEXT', 'Local engine-state value.'),
    },
  },
  _sync_changelog: {
    durability: 'device-local',
    responsibility: 'Local outbound mutation journal.',
    identity: ['seq'],
    deleteSemantics: 'Compacted locally after acknowledgement and retention checks.',
    columns: {
      seq: local('INTEGER', 'Replica-local monotonic sequence.'),
      device_id: local('TEXT', 'Originating local device ID.'),
      timestamp: local('TEXT', 'Local change timestamp.'),
      table_name: local('TEXT', 'Changed source table.'),
      row_id: local(
        'INTEGER',
        'Legacy conflict/apply locator; not a universal logical identity.',
      ),
      operation: local('TEXT', 'Insert, update, or delete operation.'),
      data: local('TEXT', 'Serialized tracked row snapshot.'),
    },
  },
  _sync_conflicts: {
    durability: 'device-local',
    responsibility: 'Conflict evidence detected by this replica.',
    identity: ['id'],
    deleteSemantics: 'Resolve or clear locally; conflict UI is deferred.',
    columns: {
      id: local('INTEGER', 'Replica-local conflict ID.'),
      table_name: local('TEXT', 'Conflicting table.'),
      row_id: local('INTEGER', 'Legacy row locator recorded by the sync engine.'),
      winner: local('TEXT', 'Local or remote resolution winner.'),
      losing_data: local('TEXT', 'Retained losing row snapshot.'),
      winning_data: local('TEXT', 'Retained winning row snapshot.'),
      detected_at: local('TEXT', 'Local detection timestamp.'),
      resolved: local('INTEGER', 'Local resolution state.'),
    },
  },
  face_configs: {
    durability: 'replicated-source',
    responsibility: 'Legacy face recipe identity and settings during the runtime migration.',
    identity: ['id'],
    deleteSemantics: 'Delete by stable UUID; normalized child rows cascade.',
    columns: {
      id: source('TEXT', 'Stable face-config UUID.'),
      face_type_id: source('TEXT', 'Selected face type.'),
      matrix_id: source('INTEGER', 'Configured matrix.'),
      slot_bindings: derived(
        'TEXT',
        'Obsolete JSON compatibility copy; normalized rows are truth.',
      ),
      settings: source('TEXT', 'Face interior settings.'),
      created_by_plugin: source('TEXT', 'Provisioning plugin, when any.'),
    },
  },
  _sync_applying: {
    durability: 'device-local',
    responsibility: 'Transaction-local trigger suppression flag.',
    identity: ['flag'],
    deleteSemantics: 'Cleared at the end of local remote-apply transactions.',
    columns: {
      flag: local('INTEGER', 'Presence suppresses local changelog triggers.'),
    },
  },
  formula_column_deps: {
    durability: 'derived',
    responsibility: 'Rebuildable dependency index parsed from matrix column formulas.',
    identity: ['formula_col_id', 'dep_col_id'],
    deleteSemantics: 'Never replicate; rebuild from matrix_columns.formula.',
    columns: {
      formula_col_id: derived('INTEGER', 'Formula column ID.'),
      dep_col_id: derived('INTEGER', 'Referenced column ID.'),
    },
  },
  promoted_nodes: {
    durability: 'replicated-source',
    responsibility: 'Nodes explicitly promoted as named types.',
    identity: ['matrix_id', 'row_id'],
    deleteSemantics: 'Delete by the full logical node identity recorded from OLD values.',
    columns: {
      matrix_id: source('INTEGER', 'Promoted node matrix identity.'),
      row_id: source('INTEGER', 'Promoted node row identity.'),
    },
  },
  block_sources: {
    durability: 'replicated-source',
    responsibility: 'Saved-view subject mode and SQL keyed by its real marker node.',
    identity: ['marker_matrix_id', 'marker_row_id'],
    deleteSemantics: 'Delete by the full logical marker identity recorded from OLD values.',
    columns: {
      marker_matrix_id: source('INTEGER', 'View marker matrix identity.'),
      marker_row_id: source('INTEGER', 'View marker row identity.'),
      kind: source('TEXT', 'Stored child-sourcing mode; currently view only.'),
      sql: source('TEXT', 'User-authored saved-view SQL.'),
    },
  },
  face_slot_bindings: {
    durability: 'replicated-source',
    responsibility: 'Stable-column bindings for a face recipe.',
    identity: ['face_config_id', 'slot_name'],
    deleteSemantics: 'Delete by face-config UUID and slot name.',
    columns: {
      face_config_id: source('TEXT', 'Owning face-config UUID.'),
      slot_name: source('TEXT', 'Face slot identity.'),
      column_id: source('INTEGER', 'Bound stable column ID, when any.'),
    },
  },
  face_sort_config: {
    durability: 'replicated-source',
    responsibility: 'Single durable sort rule for a face recipe.',
    identity: ['face_config_id'],
    deleteSemantics: 'Delete by owning face-config UUID.',
    columns: {
      face_config_id: source('TEXT', 'Owning face-config UUID.'),
      column_id: source('INTEGER', 'Sorted stable column ID.'),
      direction: source('TEXT', 'Ascending or descending direction.'),
    },
  },
  face_filter_configs: {
    durability: 'replicated-source',
    responsibility: 'Ordered durable filter rules for a face recipe.',
    identity: ['id'],
    deleteSemantics: 'Delete by stable filter UUID; order is an independent durable field.',
    columns: {
      id: source('TEXT', 'Stable filter UUID.'),
      face_config_id: source('TEXT', 'Owning face-config UUID.'),
      column_id: source('INTEGER', 'Filtered stable column ID.'),
      operator: source('TEXT', 'Filter operator.'),
      value: source('TEXT', 'Serialized filter value.'),
      order: source('INTEGER', 'Explicit order within the face recipe.'),
    },
  },
} as const satisfies Record<string, DurabilityTablePolicy>

export const DYNAMIC_DATA_TABLE_PATTERN = /^mx_\d+_data$/

export const DYNAMIC_DATA_TABLE_POLICY = {
  durability: 'replicated-source',
  responsibility: 'User-authored physical matrix rows and stable row identity.',
  identity: ['id'],
  deleteSemantics: 'Delete by stable random row ID.',
  columns: {
    id: source('INTEGER', 'Stable random row ID.'),
  },
  additionalColumnPolicy: source(
    'matrix_columns.type',
    'User-authored physical value declared by a non-formula matrix_columns row.',
  ),
} as const

export const getTableDurabilityPolicy = (
  tableName: string,
): DurabilityTablePolicy | typeof DYNAMIC_DATA_TABLE_POLICY | null => {
  if (Object.hasOwn(CORE_DURABILITY_POLICY, tableName)) {
    return CORE_DURABILITY_POLICY[tableName as keyof typeof CORE_DURABILITY_POLICY]
  }
  return DYNAMIC_DATA_TABLE_PATTERN.test(tableName) ? DYNAMIC_DATA_TABLE_POLICY : null
}

export const getColumnDurabilityPolicy = (
  tableName: string,
  columnName: string,
): DurabilityColumnPolicy | null => {
  const tablePolicy = getTableDurabilityPolicy(tableName)
  if (!tablePolicy) return null

  if (Object.hasOwn(tablePolicy.columns, columnName)) {
    return tablePolicy.columns[columnName as keyof typeof tablePolicy.columns]
  }

  return DYNAMIC_DATA_TABLE_PATTERN.test(tableName) ?
      DYNAMIC_DATA_TABLE_POLICY.additionalColumnPolicy
    : null
}

export type ReplicatedTableDefinition = {
  tableName: string
  identity: readonly string[]
  columns: { name: string; type: string }[]
}

/** Fixed-table tracking definitions generated from the reviewed durability policy. */
export const getReplicatedTableDefinitions = (): ReplicatedTableDefinition[] =>
  Object.entries(CORE_DURABILITY_POLICY).flatMap(([tableName, tablePolicy]) => {
    if (tablePolicy.durability !== 'replicated-source') return []

    const columns = Object.entries(tablePolicy.columns).flatMap(([name, columnPolicy]) =>
      columnPolicy.durability === 'replicated-source' ?
        [{ name, type: columnPolicy.storageType }]
      : [],
    )
    return [{ tableName, identity: tablePolicy.identity, columns }]
  })
