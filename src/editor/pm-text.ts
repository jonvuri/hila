/**
 * Extract plain text from a ProseMirror document.
 *
 * Accepts either a parsed doc JSON object or a JSON string. Walks
 * top-level blocks and concatenates their text node content.
 */
export const extractTextFromPmDoc = (docJson: unknown): string => {
  let doc: { content?: { content?: { text?: string }[] }[] }

  if (typeof docJson === 'string') {
    try {
      doc = JSON.parse(docJson) as typeof doc
    } catch {
      return docJson
    }
  } else {
    doc = docJson as typeof doc
  }

  if (!doc?.content) return typeof docJson === 'string' ? (docJson as string) : ''

  return (
    doc.content
      .flatMap((block) => block.content ?? [])
      .map((node) => node.text ?? '')
      .join('') || ''
  )
}
