import type { PluginDefinition } from '../core/plugin-types'

/**
 * Inline references plugin definition.
 *
 * This is shared editor infrastructure providing cross-matrix references
 * inside rich text (`@`/`[[` for ref-kind, `#` for own-kind). It creates
 * no matrixes or face bindings — the actual ProseMirror plugin,
 * node views, and sync logic are wired directly by consuming faces
 * (outline, notes). Registered here for identity and discoverability.
 */
export const inlineReferencesPlugin: PluginDefinition = {
  id: 'hila.inlineref',
  name: 'Inline References',
  version: '1.0.0',
  matrixes: [],
  namedQueries: {},
  namedMutations: {},
  faceBindings: [],
}
