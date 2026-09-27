import type { Component } from 'solid-js'

import type { FaceRenderingProps } from '../core/face-runtime'
import { PropertyLine } from '../shared/PropertyLine'

/** Property-line interior paired with the table face's collection rendering. */
const TableLine: Component<FaceRenderingProps> = (props) => (
  <PropertyLine
    matrixId={props.subject.matrixId}
    rowId={props.subject.rowId}
    density={props.density}
    readOnly={props.subject.mode === 'view'}
  />
)

export default TableLine
