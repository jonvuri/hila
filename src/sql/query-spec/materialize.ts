import { materializeSqlValue } from '../sql-statement'

import type { QueryCatalog } from './catalog'
import { renderNormalizedQuerySpec } from './compile'
import { normalizeQuerySpec } from './normalize'
import type { NormalizedQuerySpec, QuerySpec } from './types'

export const materializeNormalizedQuerySpec = (
  spec: NormalizedQuerySpec,
  catalog: QueryCatalog,
): string => renderNormalizedQuerySpec(spec, catalog, materializeSqlValue)

export const materializeQuerySpec = (input: QuerySpec, catalog: QueryCatalog): string =>
  materializeNormalizedQuerySpec(normalizeQuerySpec(input, catalog), catalog)
