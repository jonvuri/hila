import { useNodeViewContext } from '@prosemirror-adapter/solid'

export const ParagraphView = () => {
  const context = useNodeViewContext()
  return <div role="presentation" ref={context().contentRef} />
}
