// ---------------------------------------------------------------------------
// WorkspaceFocusPanel -- Wipeout-themed focus-panel mockup (session 4b).
//
// The stub counterpart of the wired `src/workspace/FocusPanel.tsx`: the part
// of a drill-down column that sits ABOVE the children navigation panel --
// title header, content prose, Properties strip, Backlinks toggle. Purely
// presentational; the Design/Workspace stories compose it over the shared
// workspace fixture.
// ---------------------------------------------------------------------------

import { createSignal, For, type JSX, Show } from 'solid-js'

import './wipeout.css'
import './workspace.css'
import type { WorkspaceFocusMeta } from '../fixtures'

type WorkspaceFocusPanelProps = {
  title: string
  meta: WorkspaceFocusMeta
  /** Rightmost (active) panel: accent flag + full-strength title. */
  active?: boolean
}

const WorkspaceFocusPanel = (props: WorkspaceFocusPanelProps): JSX.Element => {
  const [backlinksOpen, setBacklinksOpen] = createSignal(false)

  return (
    <div
      class="wo-fp"
      classList={{ 'wo-fp-active': props.active === true }}
      data-testid="focus-panel"
    >
      <div class="wo-fp-head">
        <Show when={props.active}>
          <span class="wo-fp-flag" />
        </Show>
        <span class="wo-fp-title">{props.title}</span>
      </div>
      <div class="wo-fp-rule" />

      <div class="wo-fp-content">
        <For each={props.meta.content}>{(para) => <p>{para}</p>}</For>
      </div>

      <Show when={props.meta.properties.length > 0}>
        <div class="wo-fp-sect">Properties</div>
        <div class="wo-fp-props">
          <For each={props.meta.properties}>
            {([key, value]) => (
              <>
                <span class="wo-fp-k">{key}</span>
                <span class="wo-fp-v">{value}</span>
              </>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.meta.backlinks.length > 0}>
        <button
          type="button"
          class="wo-fp-sect"
          data-testid="focus-backlinks-toggle"
          onClick={() => setBacklinksOpen((open) => !open)}
        >
          {backlinksOpen() ? '▾' : '▸'} Backlinks ({props.meta.backlinks.length})
        </button>
        <Show when={backlinksOpen()}>
          <div>
            <For each={props.meta.backlinks}>
              {(label) => (
                <button type="button" class="wo-fp-backlink">
                  {label}
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

export default WorkspaceFocusPanel
