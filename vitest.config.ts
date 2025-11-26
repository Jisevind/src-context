import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Look for test files in the test/unit/ directory
    include: ['test/unit/**/*.test.js'],
    
    // Use globals like describe, it, expect
    globals: true,
    
    // Set a default timeout (increased for WSL/CI environments)
    testTimeout: 60000,
    
    // Point to a global setup file to run *once* before all tests
    globalSetup: './test/globalSetup.js',

    setupFiles: ['./test/setup-clipboard-mock.js'],
  },
});