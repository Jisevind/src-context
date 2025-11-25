// test/setup-clipboard-mock.js
// Simple clipboard mock for CI (Vitest)
// This mock provides both a default export and named exports so tests that import
// clipboardy in either way will work.

import { vi } from 'vitest';

const _store = { value: '' };

async function read() {
  return _store.value;
}

async function write(text) {
  _store.value = String(text ?? '');
  return;
}

const mock = { read, write };

// Provide both a default export and named exports to satisfy different import styles.
vi.mock('clipboardy', () => ({
  default: mock,
  read,
  write,
}));

// Expose an internal store so tests (or debug helpers) can assert directly if needed.
global.__TEST_CLIPBOARD__ = _store;
