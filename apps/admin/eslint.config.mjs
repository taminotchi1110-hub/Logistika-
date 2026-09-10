import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLFormElement: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      ...reactHooks.configs.recommended.rules,

      // `_` bilan boshlangan argument ataylab ishlatilmaydi
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Admin panelda `console.error` foydali: operator brauzer
      // konsolidan skrinshot yuborishi mumkin
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
  {
    // Testlarda `any` va bo'sh funksiyalar normal hol
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',

      // `act(async () => { vi.advanceTimersByTime(...) })` — ichida
      // `await` yo'q, lekin `async` SHART: `act` faqat async callback
      // bilan mikrotasklarni to'liq bo'shatadi va React holatini
      // yangilaydi. Sinxron variantda test holatni ko'rmaydi.
      '@typescript-eslint/require-await': 'off',
    },
  },
  prettier,
];
