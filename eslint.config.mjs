import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import solid from 'eslint-plugin-solid/configs/typescript'

const FILES = ['src/**/*.{js,mjs,cjs,jsx,mjsx,ts,mts,tsx,mtsx}']

export default tseslint.config({
  extends: [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    solid,
    importX.flatConfigs.recommended,
    importX.flatConfigs.typescript,
  ],
  files: FILES,
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: globals.browser,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    'import-x/first': 'error',
    'import-x/no-unused-modules': 'warn',
    'import-x/no-cycle': 'error',
    'import-x/order': ['error', { 'newlines-between': 'always' }],
  },
  settings: {
    'import-x/resolver': {
      typescript: true,
    },
  },
})
