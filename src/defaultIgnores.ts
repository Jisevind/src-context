/**
 * Default ignore patterns for src-context
 * These patterns are applied to filter out common files and directories
 * that typically shouldn't be included in context extraction
 */

export const defaultIgnores = [
  'node_modules/**',
  '.git/**',
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.env.local',
  '.env.*.local',
  'dist/**',
  'build/**',
  'coverage/**',
  '**/*.log',
  '**/*.tmp',
  '**/*.temp',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.swp',
  '**/*.swo',
  '*~',
  '.DS_Store/**',
  'Thumbs.db',
  'desktop.ini'
];