import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Vitest's 5s default is a runaway guard, not an assertion — and it is too
    // tight for whole-screen integration tests. These render a full screen and
    // drive Radix controls through userEvent, which costs ~1-2s per test alone
    // but several times that when the whole suite runs in parallel alongside a
    // production build on a loaded machine. At 5s they failed intermittently
    // with `Test timed out in 5000ms` while passing in isolation — a flake that
    // says nothing about the code. Raising the ceiling changes no expectation.
    testTimeout: 15000,
    include: [
      'src/**/__tests__/**/*.[jt]s?(x)',
      'src/**/?(*.)+(test).[jt]s?(x)',
    ],
    // `__tests__/helpers/` holds shared mock-data factories imported BY tests, not
    // test suites themselves — excluding them keeps Vitest from failing on the
    // "No test suite found" error for a helper-only module.
    exclude: [
      'node_modules/',
      '**/*.spec.[jt]s',
      'src/**/__tests__/helpers/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.stories.{js,jsx,ts,tsx}',
        'src/**/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
