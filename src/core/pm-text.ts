/**
 * Extract plain text from a ProseMirror document.
 *
 * Accepts either a parsed doc JSON object or a JSON string. Walks nested
 * `content` arrays and concatenates text-node content without reading attrs.
 *
 * Lives in core (it is a pure JSON walk with no editor dependencies) so the
 * data layer can derive plain-text projections of rich-text columns -- e.g.
 * syncing `matrix.title` from an owner node's label.
 */
export const extractTextFromPmDoc = (docJson: unknown): string => {
  let value = docJson

  if (typeof docJson === 'string') {
    try {
      value = JSON.parse(docJson) as unknown
    } catch {
      return docJson
    }
  }

  if (typeof value !== 'object' || value === null) {
    return typeof docJson === 'string' ? docJson : ''
  }

  const root = value as { content?: unknown }
  if (!Array.isArray(root.content)) return typeof docJson === 'string' ? docJson : ''

  const text: string[] = []
  const stack = [...root.content].reverse()
  const visited = new Set<object>()
  while (stack.length > 0) {
    const candidate = stack.pop()
    if (typeof candidate !== 'object' || candidate === null || visited.has(candidate)) continue
    visited.add(candidate)

    const node = candidate as { text?: unknown; content?: unknown }
    if (typeof node.text === 'string') text.push(node.text)
    if (Array.isArray(node.content)) {
      for (let index = node.content.length - 1; index >= 0; index -= 1) {
        stack.push(node.content[index])
      }
    }
  }

  return text.join('')
}
