import { For, Show, type JSX } from 'solid-js'

import './WorkspacePathHeader.css'

export type WorkspacePathSegment = {
  id: string
  label: string
  matrixId?: number
  rowId?: number
}

type WorkspacePathHeaderProps = {
  ariaLabel?: string
  rootLabel: string
  segments?: readonly WorkspacePathSegment[]
  onRootSelect?: () => void
  onSegmentSelect?: (segment: WorkspacePathSegment) => void
  onRootRename?: (label: string) => void
  testId?: string
  launcherOrigin?: boolean
}

const WorkspacePathHeader = (props: WorkspacePathHeaderProps): JSX.Element => {
  const editable = () => props.onRootRename != null
  const resetEditor = (element: HTMLElement): void => {
    element.textContent = props.rootLabel
  }

  const content = () => (
    <>
      <span class="workspace-root-indicator" data-workspace-root-indicator>
        <span class="workspace-launcher-mark" data-launcher-workspace-mark aria-hidden="true" />
        <Show
          when={editable()}
          fallback={
            <button
              type="button"
              class="workspace-root-title workspace-root-title-action"
              data-launcher-workspace-title
              title={props.rootLabel}
              onClick={() => props.onRootSelect?.()}
            >
              {props.rootLabel}
            </button>
          }
        >
          <span
            class="label-heading workspace-root-title workspace-title-editor"
            contentEditable={true}
            data-launcher-workspace-title
            data-testid="workspace-title-editor"
            onBlur={(event) => {
              const element = event.currentTarget
              const nextLabel = element.textContent?.trim() ?? ''
              if (nextLabel && nextLabel !== props.rootLabel) {
                props.onRootRename?.(nextLabel)
              } else if (!nextLabel) {
                resetEditor(element)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                resetEditor(event.currentTarget)
                event.currentTarget.blur()
              }
            }}
          >
            {props.rootLabel}
          </span>
        </Show>
      </span>
      <Show when={(props.segments?.length ?? 0) > 0}>
        <ol class="workspace-path-segments">
          <For each={props.segments}>
            {(segment) => (
              <li>
                <button
                  type="button"
                  title={segment.label}
                  onClick={() => props.onSegmentSelect?.(segment)}
                >
                  {segment.label}
                </button>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </>
  )

  return (
    <Show
      when={props.onRootSelect != null || (props.segments?.length ?? 0) > 0}
      fallback={
        <div
          class="workspace-path-header"
          data-launcher-origin={props.launcherOrigin ? 'true' : undefined}
          data-testid={props.testId}
        >
          {content()}
        </div>
      }
    >
      <nav
        aria-label={props.ariaLabel}
        class="workspace-path-header"
        data-launcher-origin={props.launcherOrigin ? 'true' : undefined}
        data-testid={props.testId}
      >
        {content()}
      </nav>
    </Show>
  )
}

export default WorkspacePathHeader
