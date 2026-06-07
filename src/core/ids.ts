/**
 * Reserved identity constants for the own-forest.
 *
 * Kept in a dependency-free leaf module so both `matrix.ts` and `tree.ts` can
 * import them without forming an import cycle. `matrix.ts` re-exports them, so
 * the documented home of these constants remains the matrix module.
 */

/**
 * Root sentinel identity. Every row in the own-forest has exactly one inbound
 * `own`-edge carrying its sibling order; the forest roots (top-level workspace
 * bullets) attach to this reserved sentinel. It is never a real matrix or row
 * and is never rendered -- it exists only to be the `source` of the top-level
 * `own`-edges. Phase 8 resolution §5 commits us to this root-sentinel variant
 * (the sentinel is load-bearing: it makes "every row has one own-edge" hold
 * uniformly, which is what lets order live on the edge with no special-casing
 * for roots).
 */
export const ROOT_MATRIX_ID = 0
export const ROOT_ROW_ID = 0
