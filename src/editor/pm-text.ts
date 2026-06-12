// Re-export from core: the implementation moved there (Phase 8c §8.3) so the
// data layer can derive plain-text projections without importing from the
// editor layer. Editor-side consumers keep importing from this module.
export { extractTextFromPmDoc } from '../core/pm-text'
