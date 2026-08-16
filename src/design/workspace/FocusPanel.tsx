import { createSignal, For, type JSX, Show } from 'solid-js'

import type { WorkspaceAncestry, WorkspaceAncestryItem, WorkspaceFocusContent } from './types'

type FocusPanelProps = {
  title: string
  content: WorkspaceFocusContent
  active: boolean
  ancestry?: WorkspaceAncestry
  onAncestrySelect?: (item: WorkspaceAncestryItem) => void
}

const AncestryBreadcrumb = (props: {
  ancestry: WorkspaceAncestry
  onSelect?: (item: WorkspaceAncestryItem) => void
}): JSX.Element => (
  <nav
    class="ws-breadcrumb"
    aria-label="Ancestry"
    data-source={props.ancestry.source}
    data-testid="workspace-ancestry-breadcrumb"
  >
    <ol>
      <For each={props.ancestry.items}>
        {(item) => (
          <li>
            <button type="button" onClick={() => props.onSelect?.(item)} title={item.label}>
              {item.label}
            </button>
          </li>
        )}
      </For>
    </ol>
  </nav>
)

const FocusPanel = (props: FocusPanelProps): JSX.Element => {
  const [backlinksOpen, setBacklinksOpen] = createSignal(false)

  return (
    <section
      class="ws-focus"
      classList={{ 'ws-focus-active': props.active }}
      data-active={props.active ? 'true' : 'false'}
      data-testid="focus-panel"
    >
      <Show when={props.ancestry}>
        {(ancestry) => (
          <AncestryBreadcrumb ancestry={ancestry()} onSelect={props.onAncestrySelect} />
        )}
      </Show>

      <h2 class="ws-focus-title" contentEditable aria-label={`Edit ${props.title} title`}>
        {props.title}
      </h2>

      <div class="ws-focus-content" aria-label="Content">
        <For each={props.content.content}>
          {(paragraph) => <p contentEditable>{paragraph}</p>}
        </For>
      </div>

      <Show when={props.content.properties.length > 0}>
        <section class="ws-focus-section" aria-label="Properties">
          <h3>Properties</h3>
          <div class="ws-focus-properties">
            <For each={props.content.properties}>
              {([key, value]) => (
                <label>
                  <span>{key}</span>
                  <input type="text" value={value} aria-label={key} />
                </label>
              )}
            </For>
          </div>
        </section>
      </Show>

      <Show when={props.content.backlinks.length > 0}>
        <section class="ws-focus-section">
          <button
            type="button"
            class="ws-section-toggle"
            aria-expanded={backlinksOpen()}
            data-testid="focus-backlinks-toggle"
            onClick={() => setBacklinksOpen((open) => !open)}
          >
            <span aria-hidden="true">{backlinksOpen() ? '−' : '+'}</span>
            Backlinks ({props.content.backlinks.length})
          </button>
          <Show when={backlinksOpen()}>
            <ul class="ws-backlinks">
              <For each={props.content.backlinks}>
                {(label) => (
                  <li>
                    <button type="button">{label}</button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>
    </section>
  )
}

export default FocusPanel
