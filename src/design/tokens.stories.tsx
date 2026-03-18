import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For } from 'solid-js'

import { spacing, fontSize, fontFamily } from './tokens'

const colorGroups = [
  {
    label: 'Surface & text',
    tokens: ['bg', 'surface', 'elevated', 'hover', 'active', 'fg', 'fg-2', 'fg-3', 'fg-4'],
  },
  { label: 'Borders', tokens: ['border', 'border-2'] },
  { label: 'Inverted', tokens: ['invert-bg', 'invert-fg'] },
  { label: 'Accent', tokens: ['accent', 'accent-2', 'accent-border', 'accent-3'] },
] as const

const Swatch = (props: { name: string }) => (
  <div
    style={{
      background: `var(--c-${props.name})`,
      height: '48px',
      display: 'flex',
      'align-items': 'flex-end',
      padding: 'var(--sp-4)',
      border: '1px solid var(--c-border-2)',
      'min-width': '100px',
    }}
  >
    <span
      style={{
        'font-size': 'var(--text-xs)',
        'font-family': 'var(--font-mono)',
        opacity: '0.8',
        color: props.name.startsWith('fg') ? 'var(--c-bg)' : 'var(--c-fg-2)',
      }}
    >
      {props.name}
    </span>
  </div>
)

const ColorPaletteRender = () => (
  <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-32)' }}>
    <For each={colorGroups}>
      {(group) => (
        <div>
          <div
            style={{
              'font-size': 'var(--text-xs)',
              'font-weight': '500',
              'letter-spacing': '1px',
              'text-transform': 'uppercase',
              color: 'var(--c-fg-3)',
              'margin-bottom': 'var(--sp-8)',
            }}
          >
            {group.label}
          </div>
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: 'var(--sp-8)',
            }}
          >
            <For each={group.tokens as unknown as string[]}>
              {(token) => <Swatch name={token} />}
            </For>
          </div>
        </div>
      )}
    </For>
  </div>
)

const SpacingScaleRender = () => (
  <div style={{ display: 'flex', 'align-items': 'flex-end', gap: 'var(--sp-16)' }}>
    <For each={Object.entries(spacing)}>
      {([key, value]) => (
        <div style={{ 'text-align': 'center' }}>
          <div
            style={{
              width: value,
              height: value,
              background: 'var(--c-accent)',
              margin: '0 auto var(--sp-4)',
            }}
          />
          <span
            style={{
              'font-size': 'var(--text-xs)',
              color: 'var(--c-fg-3)',
              'font-family': 'var(--font-mono)',
            }}
          >
            {key}
          </span>
        </div>
      )}
    </For>
  </div>
)

const typeSpecimens = Object.entries(fontSize).map(([key, value]) => ({
  key,
  value,
  weight:
    key === '3xl' ? '300'
    : key === 'lg' ? '500'
    : '400',
  color:
    key === 'sm' ? 'var(--c-fg-2)'
    : key === 'xs' ? 'var(--c-fg-3)'
    : 'var(--c-fg)',
}))

const TypographyScaleRender = () => (
  <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-16)' }}>
    <For each={typeSpecimens}>
      {(spec) => (
        <div style={{ 'line-height': '1.3' }}>
          <div
            style={{
              'font-size': spec.value,
              'font-weight': spec.weight,
              color: spec.color,
            }}
          >
            Design language — {spec.value}
          </div>
          <div
            style={{
              'font-size': 'var(--text-xs)',
              'font-family': 'var(--font-mono)',
              color: 'var(--c-fg-3)',
              'margin-top': 'var(--sp-4)',
            }}
          >
            --text-{spec.key} · {spec.weight}
          </div>
        </div>
      )}
    </For>
    <div style={{ 'line-height': '1.3' }}>
      <div
        style={{
          'font-size': fontSize.base,
          'font-family': fontFamily.mono,
          color: 'var(--c-fg-2)',
        }}
      >
        const matrix = createMatrix('outline')
      </div>
      <div
        style={{
          'font-size': 'var(--text-xs)',
          'font-family': 'var(--font-mono)',
          color: 'var(--c-fg-3)',
          'margin-top': 'var(--sp-4)',
        }}
      >
        --font-mono · --text-base
      </div>
    </div>
  </div>
)

const meta: Meta = {
  title: 'Design/Tokens',
  parameters: { layout: 'padded' },
}

export default meta

type Story = StoryObj

export const ColorPalette: Story = {
  render: () => <ColorPaletteRender />,
}

export const SpacingScale: Story = {
  render: () => <SpacingScaleRender />,
}

export const TypographyScale: Story = {
  render: () => <TypographyScaleRender />,
}
