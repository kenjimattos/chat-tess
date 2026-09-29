import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Regra de dependência da arquitetura hexagonal:
 *   http, infra -> application -> domain
 * O domínio e os use cases não conhecem frameworks, banco nem SDKs.
 */
const FRAMEWORK_PACKAGES = [
  'express',
  'pg',
  '@prisma/*',
  '@google/*',
  '@google-cloud/*',
  '@modelcontextprotocol/*',
  'google-auth-library',
];

/**
 * Testes e código de apoio a testes (*.test-support.ts) podem montar o cenário
 * com adapters em memória, que ficam em infra/.
 */
const TEST_FILES = ['**/*.test.ts', '**/*.test-support.ts'];

const forbidImports = (layerPatterns, message) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: layerPatterns, message },
        {
          group: [...FRAMEWORK_PACKAGES, '**/generated/**'],
          message: 'Frameworks e SDKs só podem ser importados em infra/ ou http/.',
        },
      ],
    },
  ],
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/generated/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/api/src/modules/*/domain/**/*.ts'],
    ignores: TEST_FILES,
    rules: forbidImports(
      ['**/application/**', '**/infra/**', '**/http/**'],
      'domain/ não pode depender de application/, infra/ ou http/.',
    ),
  },
  {
    files: ['apps/api/src/modules/*/application/**/*.ts'],
    ignores: TEST_FILES,
    rules: forbidImports(
      ['**/infra/**', '**/http/**'],
      'application/ não pode depender de infra/ ou http/.',
    ),
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
