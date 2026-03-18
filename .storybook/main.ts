import type { StorybookConfig } from 'storybook-solidjs-vite'
import { patchCssModules } from 'vite-css-modules'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: 'storybook-solidjs-vite',
    options: {},
  },
  async viteFinal(config) {
    config.plugins = [
      patchCssModules({ exportMode: 'default', generateSourceTypes: true }),
      ...(config.plugins ?? []),
    ]
    return config
  },
}

export default config
