import antfu from '@antfu/eslint-config';

export default antfu(
  {
    typescript: true,
    pnpm: true,
  },
  [
    {
      ignores: [],
    },
    {
      rules: {
        'curly': ['error', 'all'],
        'style/brace-style': 'error',
        'style/multiline-ternary': ['error', 'always'],
        'style/max-statements-per-line': ['warn', { max: 1 }],
        'unused-imports/no-unused-imports': 'off',
        'unused-imports/no-unused-vars': [
          'warn',
          {
            args: 'after-used',
            argsIgnorePattern: '^_',
            vars: 'all',
            varsIgnorePattern: '^_',
          },
        ],
        'no-console': ['warn'],
        'style/semi': ['error', 'always'],
        'style/indent': ['error', 2, { SwitchCase: 1 }],
        'style/max-len': [
          'error',
          {
            code: 120,
            tabWidth: 2,
            ignoreRegExpLiterals: true,
            ignoreStrings: true,
            ignoreUrls: true,
            ignoreTemplateLiterals: true,
            ignoreComments: true,
          },
        ],
        'comma-dangle': ['error', 'always-multiline'],
        'style/quotes': ['error', 'single'],
        'pnpm/json-prefer-workspace-settings': 'off',
      },
    },
    {
      files: ['**/*.md'],
      rules: {
        'style/max-len': 'off',
      },
    },
  ],
);
