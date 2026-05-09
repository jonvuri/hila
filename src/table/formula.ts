import type { ColumnDefinition } from '../core/matrix'

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const REF_TOKEN = /\{\{(\d+)\}\}/g

/**
 * Walk a formula string, calling `onRef` for each `{{id}}` token that is
 * NOT inside a SQL string literal. SQL strings are `'...'` with `''`
 * as the escape for a literal quote.
 */
const walkRefs = (formula: string, onRef: (match: RegExpExecArray) => void): void => {
  let inString = false
  let pos = 0

  while (pos < formula.length) {
    if (inString) {
      if (formula[pos] === "'" && formula[pos + 1] === "'") {
        pos += 2 // escaped quote
      } else if (formula[pos] === "'") {
        inString = false
        pos += 1
      } else {
        pos += 1
      }
      continue
    }

    if (formula[pos] === "'") {
      inString = true
      pos += 1
      continue
    }

    REF_TOKEN.lastIndex = pos
    const m = REF_TOKEN.exec(formula)
    if (m && m.index === pos) {
      onRef(m)
      pos = REF_TOKEN.lastIndex
    } else {
      pos += 1
    }
  }
}

/**
 * Replace `{{columnId}}` tokens (outside SQL string literals) with the
 * current quoted column name. Raw SQL operators, literals, and string
 * contents pass through unchanged.
 */
export const compileFormula = (formula: string, columns: ColumnDefinition[]): string => {
  const byId = new Map(columns.map((c) => [c.id, c.name]))
  let result = ''
  let lastEnd = 0

  walkRefs(formula, (m) => {
    result += formula.slice(lastEnd, m.index)
    const id = Number(m[1])
    const name = byId.get(id)
    if (!name) throw new Error(`Formula references unknown column ID ${id}`)
    result += quoteIdent(name)
    lastEnd = m.index + m[0].length
  })

  result += formula.slice(lastEnd)
  return result
}

/** Extract all column IDs referenced in a formula expression (outside SQL string literals). */
export const parseFormulaRefs = (formula: string): number[] => {
  const refs: number[] = []
  walkRefs(formula, (m) => {
    refs.push(Number(m[1]))
  })
  return refs
}
