import { describe, it, expect } from 'vitest';
import { generateStructureTree } from '../../dist/utils.js';

describe('generateStructureTree', () => {
  it('should generate a tree structure from an array of file paths', () => {
    const testFiles = [
      'src/index.ts',
      'src/utils.ts',
      'src/core.ts',
      'src/fileProcessors.ts',
      'package.json',
      'README.md',
      'test/subfolder/nested.js',
      'test/another.js'
    ];

    const result = generateStructureTree(testFiles);
    
    expect(typeof result).toBe('string');
    expect(result).toContain('src');
    expect(result).toContain('test');
    expect(result).toContain('package.json');
    expect(result).toContain('README.md');
  });

  it('should handle empty file array', () => {
    const result = generateStructureTree([]);
    expect(typeof result).toBe('string');
  });

  it('should handle single file', () => {
    const result = generateStructureTree(['index.js']);
    expect(typeof result).toBe('string');
    expect(result).toContain('index.js');
  });

  it('should handle deeply nested files', () => {
    const testFiles = [
      'src/components/Button/index.tsx',
      'src/components/Button/styles.css',
      'src/pages/Home/index.tsx'
    ];

    const result = generateStructureTree(testFiles);
    expect(result).toContain('src');
    expect(result).toContain('components');
    expect(result).toContain('pages');
    expect(result).toContain('Button');
  });
});