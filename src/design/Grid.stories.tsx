import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { GridContainer, GridRow, GridCol } from './Grid'

const Placeholder = (props: { label: string }) => (
  <div
    style={{
      background: 'var(--c-surface)',
      border: '1px solid var(--c-border-2)',
      padding: 'var(--sp-8) var(--sp-16)',
      'font-size': 'var(--text-xs)',
      'font-family': 'var(--font-mono)',
      color: 'var(--c-fg-3)',
      'text-align': 'center',
    }}
  >
    {props.label}
  </div>
)

const meta: Meta = {
  title: 'Design/Grid',
  parameters: { layout: 'fullscreen' },
}

export default meta

type Story = StoryObj

export const TwoColumn: Story = {
  render: () => (
    <GridContainer>
      <GridRow>
        <GridCol span={8}>
          <Placeholder label="8 cols" />
        </GridCol>
        <GridCol span={8}>
          <Placeholder label="8 cols" />
        </GridCol>
      </GridRow>
    </GridContainer>
  ),
}

export const ThreeColumn: Story = {
  render: () => (
    <GridContainer>
      <GridRow>
        <GridCol span={5}>
          <Placeholder label="5 cols" />
        </GridCol>
        <GridCol span={6}>
          <Placeholder label="6 cols" />
        </GridCol>
        <GridCol span={5}>
          <Placeholder label="5 cols" />
        </GridCol>
      </GridRow>
    </GridContainer>
  ),
}

export const FourColumn: Story = {
  render: () => (
    <GridContainer>
      <GridRow>
        <GridCol span={4}>
          <Placeholder label="4 cols" />
        </GridCol>
        <GridCol span={4}>
          <Placeholder label="4 cols" />
        </GridCol>
        <GridCol span={4}>
          <Placeholder label="4 cols" />
        </GridCol>
        <GridCol span={4}>
          <Placeholder label="4 cols" />
        </GridCol>
      </GridRow>
    </GridContainer>
  ),
}

export const Asymmetric: Story = {
  render: () => (
    <GridContainer>
      <GridRow>
        <GridCol span={4} mdSpan={3}>
          <Placeholder label="sidebar (4/md:3)" />
        </GridCol>
        <GridCol span={12} mdSpan={9}>
          <Placeholder label="main (12/md:9)" />
        </GridCol>
      </GridRow>
    </GridContainer>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <GridContainer>
      <GridRow>
        <GridCol span={16}>
          <Placeholder label="16" />
        </GridCol>
      </GridRow>
      <GridRow>
        <GridCol span={8}>
          <Placeholder label="8" />
        </GridCol>
        <GridCol span={8}>
          <Placeholder label="8" />
        </GridCol>
      </GridRow>
      <GridRow>
        <GridCol span={4}>
          <Placeholder label="4" />
        </GridCol>
        <GridCol span={4}>
          <Placeholder label="4" />
        </GridCol>
        <GridCol span={4}>
          <Placeholder label="4" />
        </GridCol>
        <GridCol span={4}>
          <Placeholder label="4" />
        </GridCol>
      </GridRow>
      <GridRow>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
        <GridCol span={2}>
          <Placeholder label="2" />
        </GridCol>
      </GridRow>
      <GridRow>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
        <GridCol span={1}>
          <Placeholder label="1" />
        </GridCol>
      </GridRow>
    </GridContainer>
  ),
}
