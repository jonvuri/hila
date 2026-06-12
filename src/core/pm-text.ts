/**
 * Extract plain text from a ProseMirror document.
 *
 * Accepts either a parsed doc JSON object or a JSON string. Walks
 * top-level blocks and concatenates their text node content.
 *
 * Lives in core (it is a pure JSON walk with no editor dependencies) so the
 * data layer can derive plain-text projections of rich-text columns -- e.g.
 * syncing `matrix.title` from an owner node's label.
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
