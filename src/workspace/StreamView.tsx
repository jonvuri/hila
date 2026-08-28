import { createMemo, Suspense } from 'solid-js'

import OverlaidCards from '../design/overlaid-cards/OverlaidCards'
import { resolveComponentVariant, type ComponentVariantConfig } from '../design/tokens'

import FocusPanel from './FocusPanel'
import NavigationPanel from './NavigationPanel'
import { createStreamController, type StreamControllerInput } from './stream-controller'

type StreamViewProps = StreamControllerInput & {
  componentConfig?: ComponentVariantConfig
}

const StreamView = (props: StreamViewProps) => {
  const controller = createStreamController(props)
  const navigationOutline = createMemo(() =>
    resolveComponentVariant('navigationOutline', props.componentConfig?.navigationOutline),
  )
  const overlaidGaps = createMemo(() =>
    controller.ancestry().map((chain) =>
      chain.map((ancestor) => ({
        key: ancestor.id,
        label: ancestor.label,
        rowId: ancestor.rowId ?? null,
        matrixId: ancestor.matrixId,
      })),
    ),
  )

  const renderPanel = (panel: ReturnType<typeof controller.panels>[number], index: number) => {
    if (panel.type === 'navigation') {
      return (
        <NavigationPanel
          matrixId={props.matrixId}
          navigationOutline={navigationOutline()}
          rootKey={panel.rootKey}
          onOpenFocus={(matrixId, rowId, key) =>
            controller.appendFocus(index, matrixId, rowId, new Uint8Array(key))
          }
          onOpenFoldedFocus={(matrixId, rowId) =>
            void controller.openFoldedFocus(index, matrixId, rowId)
          }
          focusedRowId={controller.focusedRowForNavigation(index)}
        />
      )
    }

    return (
      <FocusPanel
        matrixId={panel.matrixId}
        navigationOutline={navigationOutline()}
        rowId={panel.rowId}
        rowKey={panel.rowKey}
        foldedOrigin={panel.foldedOrigin}
        unresolvedPosition={panel.unresolvedPosition}
        active={index === controller.panels().length - 1}
        onAppendFocus={(matrixId, rowId, key) =>
          controller.appendFocus(index, matrixId, rowId, new Uint8Array(key))
        }
        onReplaceFocus={(matrixId, rowId, key) =>
          controller.replaceFocus(index, matrixId, rowId, new Uint8Array(key))
        }
        onOpenRowRef={(matrixId, rowId) =>
          void controller.openRowReference(index, matrixId, rowId)
        }
        onOpenFoldedFocus={(matrixId, rowId) =>
          void controller.openFoldedFocus(index, matrixId, rowId)
        }
        onCollapse={() => controller.closeFrom(index + 1)}
        onClose={() => controller.closeFrom(index)}
      />
    )
  }

  return (
    <Suspense
      fallback={
        <div class="card-viewport" style={{ padding: '16px', color: 'var(--text-muted)' }}>
          Loading…
        </div>
      }
    >
      <OverlaidCards
        panels={controller.panels()}
        panelKind={(panel) => (panel.type === 'navigation' ? 'navigation' : 'focus')}
        gaps={overlaidGaps()}
        title={controller.title()}
        renderPanel={renderPanel}
        onAncestorClick={(panelIndex, ancestor) =>
          controller.selectAncestor(panelIndex, {
            id: ancestor.key,
            label: ancestor.label,
            rowId: ancestor.rowId ?? undefined,
            matrixId: ancestor.matrixId,
          })
        }
      />
    </Suspense>
  )
}

export default StreamView
