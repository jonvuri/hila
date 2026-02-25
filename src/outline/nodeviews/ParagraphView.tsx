import { useNodeViewContext } from '@prosemirror-adapter/solid'

export function ParagraphView() {
  const context = useNodeViewContext()
  return <div role="presentation" ref={context().contentRef} />
}
