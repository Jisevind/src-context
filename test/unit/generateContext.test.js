import { describe, it, expect } from 'vitest';
import { generateContext } from '../../src/index.js';

describe('generateContext', () => {
  it('should generate context without token budget', async () => {
    const result = await generateContext({
      inputPaths: ['src'],
      cliIgnores: [],
      customIgnoreFile: '',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 1024
    });

    expect(result).toHaveProperty('finalContent');
    expect(typeof result.finalContent).toBe('string');
    expect(result.finalContent).toContain('src');
    expect(result.finalContent.length).toBeGreaterThan(0);
  });

  it('should generate context with token budget', async () => {
    const result = await generateContext({
      inputPaths: ['src'],
      cliIgnores: [],
      customIgnoreFile: '',
      removeWhitespace: false,
      keepComments: true,
      tokenBudget: 1000,
      maxFileKb: 1024
    });

    expect(result).toHaveProperty('finalContent');
    expect(typeof result.finalContent).toBe('string');
    expect(result.finalContent).toContain('src');
    expect(result.finalContent.length).toBeGreaterThan(0);
  });

  it('should return content that starts with tree structure', async () => {
    const result = await generateContext({
      inputPaths: ['src'],
      cliIgnores: [],
      customIgnoreFile: '',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 1024
    });

    const firstLines = result.finalContent.split('\n').slice(0, 10);
    const firstLine = firstLines[0].toLowerCase();
    
    // The first line should contain the tree structure indicator
    expect(firstLine).toMatch(/src|├──|└──|\./);
  });

  it('should handle empty input paths gracefully', async () => {
    const result = await generateContext({
      inputPaths: [],
      cliIgnores: [],
      customIgnoreFile: '',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 1024
    });

    expect(result).toHaveProperty('finalContent');
    expect(typeof result.finalContent).toBe('string');
  });

  it('should respect maxFileKb parameter', async () => {
    const result = await generateContext({
      inputPaths: ['src'],
      cliIgnores: [],
      customIgnoreFile: '',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 10 // Very small limit
    });

    expect(result).toHaveProperty('finalContent');
    expect(typeof result.finalContent).toBe('string');
  });
});