import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For } from 'solid-js'

import { fontSizeValues, semanticVar, spacingValues, type SemanticTokenName } from './tokens'

const colorGroups: readonly { label: string; tokens: readonly SemanticTokenName[] }[] = [
  {
    label: 'Surfaces and text',
    tokens: [
      'color-canvas',
      'color-surface',
      'color-overlay',
      'color-text-strong',
      'color-text',
      'color-text-muted',
      'color-text-faint',
    ],
  },
  { label: 'Lines', tokens: ['color-line-strong', 'color-line-subtle'] },
  { label: 'Inverse', tokens: ['color-inverse-surface', 'color-inverse-text'] },
  {
    label: 'State',
    tokens: [
      'color-accent',
      'color-danger',
      'color-state-hover',
      'color-state-selected',
      'color-state-focus',
      'color-state-invalid',
    ],
  },
]

const Swatch = (props: { name: SemanticTokenName }) => (
  <div
    style={{
      display: 'flex',
      height: '64px',
      'min-width': '120px',
      'align-items': 'flex-end',
      padding: 'var(--space-4)',
      background: semanticVar(props.name),
      border: 'var(--border-subtle)',
    }}
  >
    <span
      style={{
        padding: 'var(--space-2) var(--space-4)',
        color: 'var(--color-text)',
        background: 'var(--color-canvas)',
        'font-family': 'var(--type-data-family)',
        'font-size': 'var(--type-label-size)',
      }}
    >
      --{props.name}
    </span>
  </div>
)

const ColorPaletteRender = () => (
  <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-section-gap)' }}>
    <For each={colorGroups}>
      {(group) => (
        <div>
          <div
            style={{
              'margin-bottom': 'var(--space-control-gap)',
              color: 'var(--color-text-faint)',
              'font-family': 'var(--type-label-family)',
              'font-size': 'var(--type-label-size)',
              'font-weight': 'var(--type-label-weight)',
              'letter-spacing': 'var(--type-label-letter-spacing)',
              'text-transform': 'uppercase',
            }}
          >
            {group.label}
          </div>
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 'var(--space-control-gap)',
            }}
          >
            <For each={group.tokens}>{(token) => <Swatch name={token} />}</For>
          </div>
        </div>
      )}
    </For>
  </div>
)

const SpacingScaleRender = () => (
  <div
    style={{ display: 'flex', 'align-items': 'flex-end', gap: 'var(--space-content-inset)' }}
  >
    <For each={Object.entries(spacingValues)}>
      {([key, value]) => (
        <div style={{ 'text-align': 'center' }}>
          <div
            style={{
              width: value,
              height: value,
              margin: '0 auto var(--space-4)',
              background: 'var(--color-accent)',
            }}
          />
          <span
            style={{
              color: 'var(--color-text-faint)',
              'font-family': 'var(--type-data-family)',
              'font-size': 'var(--type-label-size)',
            }}
          >
            --space-{key}
          </span>
        </div>
      )}
    </For>
  </div>
)

const typeSpecimens = Object.entries(fontSizeValues).map(([key, value]) => ({ key, value }))

const TypographyScaleRender = () => (
  <div
    style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-content-inset)' }}
  >
    <For each={typeSpecimens}>
      {(specimen) => (
        <div>
          <div style={{ color: 'var(--color-text)', 'font-size': specimen.value }}>
            Design language — {specimen.value}
          </div>
          <div
            style={{
              'margin-top': 'var(--space-4)',
              color: 'var(--color-text-faint)',
              'font-family': 'var(--type-data-family)',
              'font-size': 'var(--type-label-size)',
            }}
          >
            --font-size-{specimen.key}
          </div>
        </div>
      )}
    </For>
  </div>
)

const meta: Meta = {
  title: 'Design/Tokens',
  parameters: { layout: 'padded' },
}

export default meta

type Story = StoryObj

export const ColorPalette: Story = { render: () => <ColorPaletteRender /> }
export const SpacingScale: Story = { render: () => <SpacingScaleRender /> }
export const TypographyScale: Story = { render: () => <TypographyScaleRender /> }
