import { For, type JSX, Show } from 'solid-js'

import Workspace from '../workspace/Workspace'
import { rootShiftedPanels, rootVisiblePanels, workspaceTitle } from '../workspace/fixtures'

import './theme-card.css'
import {
  themeCardSemanticRoleIds,
  themeCardStateIds,
  type ThemeCardDial,
  type ThemeCardSemanticRoleId,
  type ThemeCardSectionId,
  type ThemeCardStateId,
  type ThemeCardThemeInput,
  type ThemeCardTreatment,
  type ThemeCardTreatmentKind,
} from './types'

type ThemeCardProps = {
  theme: ThemeCardThemeInput
}

type RoleSpecimen = {
  id: ThemeCardSemanticRoleId
  label: string
}

const colorRoles: readonly RoleSpecimen[] = [
  { id: 'color-canvas', label: 'Canvas' },
  { id: 'color-surface', label: 'Surface' },
  { id: 'color-overlay', label: 'Overlay' },
  { id: 'color-text', label: 'Text' },
  { id: 'color-text-muted', label: 'Muted text' },
  { id: 'color-text-faint', label: 'Faint text' },
  { id: 'color-accent', label: 'Accent' },
  { id: 'color-danger', label: 'Danger' },
]

const stateLabels: Record<ThemeCardStateId, string> = {
  default: 'Default',
  hover: 'Hover',
  'keyboard-focus': 'Keyboard focus',
  selected: 'Selected',
  disabled: 'Disabled',
  invalid: 'Invalid',
  'armed-danger': 'Armed danger',
}

const treatmentKindLabels: Record<ThemeCardTreatmentKind, string> = {
  structural: 'Structural',
  'semantic-state': 'Semantic state',
  'optional-decoration': 'Optional decoration',
}

const toRoleStyle = (theme: ThemeCardThemeInput): JSX.CSSProperties => {
  const style: Record<string, string> = {}

  for (const role of themeCardSemanticRoleIds) {
    const value = theme.roles?.[role]
    if (value) style[`--tc-${role}`] = value
  }

  return style as JSX.CSSProperties
}

const Section = (props: {
  id: ThemeCardSectionId
  index: string
  title: string
  summary: string
  treatments?: readonly ThemeCardTreatment[]
  children: JSX.Element
}): JSX.Element => (
  <section class="tc-section" data-theme-card-section={props.id}>
    <header class="tc-section-heading">
      <span class="tc-section-index">{props.index}</span>
      <div>
        <h2>{props.title}</h2>
        <p>{props.summary}</p>
      </div>
    </header>
    <Show when={props.treatments?.length}>
      <ul class="tc-treatment-ledger" aria-label={`${props.title} treatment ledger`}>
        <For each={props.treatments}>
          {(treatment) => (
            <li data-treatment-kind={treatment.kind}>
              <span>{treatmentKindLabels[treatment.kind]}</span>
              <p>{treatment.label}</p>
            </li>
          )}
        </For>
      </ul>
    </Show>
    {props.children}
  </section>
)

const treatmentsFor = (
  theme: ThemeCardThemeInput,
  section: ThemeCardSectionId,
): readonly ThemeCardTreatment[] | undefined =>
  theme.treatments?.filter((treatment) => treatment.section === section)

const StateControl = (props: { state: ThemeCardStateId }): JSX.Element => {
  const disabled = () => props.state === 'disabled'
  const invalid = () => props.state === 'invalid'
  const armedDanger = () => props.state === 'armed-danger'

  return (
    <div class="tc-state-specimen" data-state={props.state}>
      <span class="tc-state-label">{stateLabels[props.state]}</span>
      <button
        type="button"
        class="tc-control tc-control-state"
        disabled={disabled()}
        aria-disabled={disabled()}
        aria-invalid={invalid() || undefined}
        aria-pressed={props.state === 'selected' || armedDanger()}
      >
        {armedDanger() ? 'Confirm delete' : 'Open note'}
      </button>
    </div>
  )
}

const Dial = (props: { dial: ThemeCardDial }): JSX.Element => (
  <fieldset class="tc-dial">
    <legend>{props.dial.label}</legend>
    <p>{props.dial.description}</p>
    <div class="tc-dial-options">
      <For each={props.dial.options}>
        {(option) => (
          <button
            type="button"
            class="tc-control"
            data-state={option.id === props.dial.value ? 'selected' : 'default'}
            aria-pressed={option.id === props.dial.value}
            onClick={() => props.dial.onChange?.(option.id)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  </fieldset>
)

const ThemeCard = (props: ThemeCardProps): JSX.Element => (
  <article
    class="tc-card"
    data-theme-card={props.theme.id}
    data-testid="theme-card"
    style={toRoleStyle(props.theme)}
  >
    <Section
      id="intent"
      index="01"
      title={props.theme.name}
      summary="Intent and delta"
      treatments={treatmentsFor(props.theme, 'intent')}
    >
      <div class="tc-intent-grid">
        <div>
          <h3>Intent</h3>
          <p>{props.theme.intent}</p>
        </div>
        <div>
          <h3>Delta from the shared grammar</h3>
          <p>{props.theme.delta}</p>
        </div>
      </div>
    </Section>

    <Section
      id="palette-type"
      index="02"
      title="Palette and type"
      summary="Semantic color and type roles. The role names are temporary exploration inputs."
      treatments={treatmentsFor(props.theme, 'palette-type')}
    >
      <div class="tc-split-grid">
        <div>
          <h3>Palette</h3>
          <div class="tc-palette">
            <For each={colorRoles}>
              {(role) => (
                <div class="tc-swatch" data-role={role.id}>
                  <span aria-hidden="true" />
                  <code>{role.label}</code>
                </div>
              )}
            </For>
          </div>
        </div>
        <div>
          <h3>Type roles</h3>
          <div class="tc-type-stack">
            <p class="tc-type-display">Reading queue</p>
            <p class="tc-type-body">
              Indexes trade write cost for faster reads. Compare the shape of that trade.
            </p>
            <p class="tc-type-label">STATUS · ANNOTATING</p>
            <p class="tc-type-data">ƒ score = urgency × confidence</p>
          </div>
        </div>
      </div>
    </Section>

    <Section
      id="foundations"
      index="03"
      title="Spacing, geometry, lines, icons, and motion"
      summary="Foundation roles stay separate from component specimens."
      treatments={treatmentsFor(props.theme, 'foundations')}
    >
      <div class="tc-foundation-grid">
        <div>
          <h3>Spacing</h3>
          <div class="tc-space-stack" aria-label="Spacing scale">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div>
          <h3>Geometry</h3>
          <div class="tc-geometry" aria-label="Control, surface, and cut geometry">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div>
          <h3>Lines and icons</h3>
          <div class="tc-lines">
            <i />
            <i />
            <svg viewBox="0 0 24 24" role="img" aria-label="Drill icon">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </div>
        </div>
        <div>
          <h3>Motion</h3>
          <div class="tc-motion-track" aria-label="Motion duration and easing specimen">
            <i />
          </div>
        </div>
      </div>
    </Section>

    <Section
      id="states"
      index="04"
      title="Semantic states"
      summary="Each state is forced on. Comparison does not depend on pointer or keyboard input."
      treatments={treatmentsFor(props.theme, 'states')}
    >
      <div class="tc-state-grid">
        <For each={themeCardStateIds}>{(state) => <StateControl state={state} />}</For>
      </div>
    </Section>

    <Section
      id="controls"
      index="05"
      title="Atomic controls"
      summary="Controls, chips, fields, and compact actions use the same semantic state roles."
      treatments={treatmentsFor(props.theme, 'controls')}
    >
      <div class="tc-control-grid">
        <button type="button" class="tc-control tc-control-primary">
          Add note
        </button>
        <button type="button" class="tc-control">
          Move
        </button>
        <button type="button" class="tc-icon-control" aria-label="Collapse section">
          −
        </button>
        <span class="tc-chip">scope: subtree</span>
        <label class="tc-field">
          <span>Filter</span>
          <input value="storage engines" aria-label="Filter reading queue" />
        </label>
        <label class="tc-check">
          <input type="checkbox" checked />
          <span>Show backlinks</span>
        </label>
      </div>
    </Section>

    <Section
      id="molecules"
      index="06"
      title="Molecules"
      summary="Rows, headers, focused content, properties, tables, and the launcher share one dense fixture."
      treatments={treatmentsFor(props.theme, 'molecules')}
    >
      <div class="tc-molecule-grid">
        <div class="tc-molecule">
          <h3>Row and sticky header</h3>
          <div class="tc-sticky-header">
            <span>Reading queue</span>
            <small>3 open</small>
          </div>
          <div class="tc-row" data-state="selected">
            <button type="button" aria-label="Collapse chapter">
              −
            </button>
            <span>Ch. 3 — Storage and Retrieval</span>
            <button type="button" aria-label="Drill into chapter">
              ›
            </button>
          </div>
          <div class="tc-row" data-state="disabled" aria-disabled="true">
            <span aria-hidden="true" />
            <span>Archived comparison notes</span>
            <span aria-hidden="true" />
          </div>
        </div>

        <div class="tc-molecule tc-focus-specimen">
          <h3>Focus and property pair</h3>
          <header>
            <small>Research / Reading queue / Books</small>
            <h4>Designing Data-Intensive Applications</h4>
          </header>
          <div class="tc-long-form">
            <p>
              Compare storage-engine trade-offs before the next architecture review. Keep the
              evidence near the decision so a later reader can recover why the choice was made.
            </p>
            <p>
              Log-structured engines favor sustained writes and compaction. Page-oriented trees
              favor predictable reads and mature operational tools. Workload shape, failure
              recovery, and maintenance cost decide which trade is useful.
            </p>
            <p>
              Preserve the unresolved measurements with the recommendation. Do not compress the
              source notes into a status label that hides uncertainty.
            </p>
          </div>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>Annotating</dd>
            </div>
            <div>
              <dt>Next</dt>
              <dd>Compare compaction strategies</dd>
            </div>
          </dl>
        </div>

        <div class="tc-molecule tc-table-specimen">
          <h3>Table</h3>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>ƒ score</th>
              </tr>
            </thead>
            <tbody>
              <tr data-state="selected">
                <td>Storage and Retrieval</td>
                <td>Active</td>
                <td>0.92</td>
              </tr>
              <tr>
                <td>Distributed Data</td>
                <td>Queued</td>
                <td>0.76</td>
              </tr>
              <tr data-state="invalid">
                <td>Untitled source</td>
                <td>Invalid</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="tc-molecule tc-launcher-specimen">
          <h3>Launcher</h3>
          <div class="tc-launcher" role="dialog" aria-label="Launcher specimen">
            <label>
              <span aria-hidden="true">⌕</span>
              <input value="storage engines" aria-label="Search all places" />
            </label>
            <div class="tc-launcher-chips">
              <span class="tc-chip">kind: text</span>
              <span class="tc-filter-token">#book</span>
            </div>
            <div class="tc-launcher-result" data-state="selected">
              <span>Ch. 3 — Storage and Retrieval</span>
              <kbd>↵</kbd>
            </div>
            <div class="tc-launcher-result">
              <span>Comparing B-trees and LSM-trees</span>
              <small>Research</small>
            </div>
            <footer>
              <span>Save as view node</span>
              <kbd>⌘S</kbd>
            </footer>
          </div>
        </div>
      </div>
    </Section>

    <Section
      id="workspace"
      index="07"
      title="Workspace gestalt"
      summary="The approved sticky-header skeleton shows both conditional ancestry states."
      treatments={treatmentsFor(props.theme, 'workspace')}
    >
      <div class="tc-workspace-stack">
        <figure class="tc-workspace-specimen">
          <figcaption>
            <span>Root visible</span>
            <small>No ancestry breadcrumb</small>
          </figcaption>
          <div class="tc-workspace-frame">
            <Workspace panels={rootVisiblePanels} workspaceTitle={workspaceTitle} />
          </div>
        </figure>
        <figure class="tc-workspace-specimen">
          <figcaption>
            <span>Root shifted offscreen</span>
            <small>Breadcrumb on first visible focus panel</small>
          </figcaption>
          <div class="tc-workspace-frame">
            <Workspace panels={rootShiftedPanels} workspaceTitle={workspaceTitle} />
          </div>
        </figure>
      </div>
    </Section>

    <Section
      id="dials-notes"
      index="08"
      title="Dials and notes"
      summary="A dial exists only while a named visual decision remains open."
      treatments={treatmentsFor(props.theme, 'dials-notes')}
    >
      <div class="tc-dials-notes">
        <div>
          <h3>Open dials</h3>
          <Show
            when={props.theme.dials?.length}
            fallback={
              <p class="tc-empty">
                No theme-specific dials are assigned. Later cards use the shared dial schema.
              </p>
            }
          >
            <For each={props.theme.dials}>{(dial) => <Dial dial={dial} />}</For>
          </Show>
        </div>
        <div>
          <h3>Notes</h3>
          <Show
            when={props.theme.notes?.length}
            fallback={<p class="tc-empty">No theme notes are recorded.</p>}
          >
            <dl class="tc-notes">
              <For each={props.theme.notes}>
                {(note) => (
                  <div>
                    <dt>{note.label}</dt>
                    <dd>{note.text}</dd>
                  </div>
                )}
              </For>
            </dl>
          </Show>
        </div>
      </div>
    </Section>
  </article>
)

export default ThemeCard
