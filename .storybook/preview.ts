import type { Preview } from 'storybook-solidjs-vite'
import '../src/design/tokens.css'
import '../src/design/reset.css'

import { resolvePolarity, resolveVisualTheme } from '../src/design/tokens'

const preview: Preview = {
  globalTypes: {
    polarity: {
      description: 'Light or dark polarity',
      toolbar: {
        title: 'Polarity',
        icon: 'circlehollow',
        items: [
          { value: 'dark', icon: 'moon', title: 'Dark' },
          { value: 'light', icon: 'sun', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
    visualTheme: {
      description: 'Global visual theme',
      toolbar: {
        title: 'Visual theme',
        icon: 'paintbrush',
        items: [
          { value: 'ghost', title: 'Ghost' },
          { value: 'null', title: 'Null' },
          { value: 'wipeout', title: 'Wipeout' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    polarity: 'dark',
    visualTheme: 'ghost',
  },
  decorators: [
    (Story, context) => {
      const polarity = resolvePolarity(context.globals.polarity)
      const visualTheme = resolveVisualTheme(context.globals.visualTheme)
      document.documentElement.setAttribute('data-theme', polarity)
      document.documentElement.setAttribute('data-visual-theme', visualTheme)
      return Story()
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
