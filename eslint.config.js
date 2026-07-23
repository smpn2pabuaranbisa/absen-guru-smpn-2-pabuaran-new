import reactHooks from 'eslint-plugin-react-hooks';
import typescriptEslintParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' }
  }
];
