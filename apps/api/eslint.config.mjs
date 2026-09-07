import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript kompilyatori mavjud boʻlmagan identifikatorlarni oʻzi topadi
      // va buni ancha aniqroq qiladi (global tiplar, modul chegaralari bilan).
      // ESLint'ning `no-undef` qoidasi esa TS fayllarida `fetch`, `describe`
      // kabi globallarni "topilmadi" deb notoʻgʻri belgilaydi —
      // typescript-eslint uni oʻchirishni rasman tavsiya qiladi.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      // Xom SQL faqat ataylab yoziladi — code review'da alohida tasdiqlanadi
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier,
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
];
