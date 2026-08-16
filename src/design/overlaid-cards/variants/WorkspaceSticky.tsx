// ---------------------------------------------------------------------------
// WorkspaceSticky -- sticky headers as the breadcrumb, at workspace scale
// (session 4b).
//
// Full-screen column stream mirroring the wired app's shape: the leftmost
// column is the root navigation panel; every drill-down column is a
// FocusPanel mockup above its children navigation panel. There is no tab
// layer at all -- the sticky header stacks ARE the breadcrumb (see
// StickyNav). Drill columns render no gap-ancestor rows (they'd duplicate
// rows already visible in a column to the left); the continuous ancestry
// reads through the accents instead: light left-edge bars on drill-path
// ancestors, and the drill rows' throughlines carrying into the next column.
// ---------------------------------------------------------------------------

import { For, type JSX, Show } from 'solid-js'

import type { OutlineTheme } from '../../outline/types'
import './wipeout.css'
import './workspace.css'
import type { WorkspacePanel } from '../fixtures'
import type { WipeoutDisplayFont } from '../types'

import StickyNav from './StickyNav'
import WorkspaceFocusPanel from './WorkspaceFocusPanel'

type WorkspaceStickyProps = {
  panels: readonly WorkspacePanel[]
  title: string
  outlineTheme: OutlineTheme
  displayFont?: WipeoutDisplayFont
}

const WorkspaceSticky = (props: WorkspaceStickyProps): JSX.Element => (
  <div
    class="wo-cards wo-wsp"
    classList={{ 'wo-font-orbitron': props.displayFont === 'orbitron' }}
    data-testid="stream-view"
  >
    <For each={props.panels}>
      {(panel, i) => {
        const isLast = () => i() === props.panels.length - 1
        return (
          <div
            class="wo-wsp-col"
            data-testid={
              panel.kind === 'navigation' ? 'stream-nav-column' : 'stream-focus-column'
            }
          >
            <Show when={panel.kind === 'focus' && panel.focus}>
              {(meta) => (
                <WorkspaceFocusPanel title={panel.title} meta={meta()} active={isLast()} />
              )}
            </Show>
            <StickyNav
              title={panel.kind === 'navigation' ? props.title : undefined}
              items={panel.items}
              initialCollapsed={panel.initialCollapsed}
              drillId={panel.drillId}
              drillLabel={props.panels[i() + 1]?.title}
              outlineTheme={props.outlineTheme}
            />
          </div>
        )
      }}
    </For>
  </div>
)

export default WorkspaceSticky
