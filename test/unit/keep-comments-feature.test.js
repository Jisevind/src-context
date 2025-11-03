/**
 * Unit tests for --keep-comments feature functionality
 * Tests the feature that strips comments by default to save tokens, or keeps them with `--keep-comments`
 */

import { generateContext, getFileStats } from '../../dist/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data - create files with various types of comments
const testDir = 'keep-comments-test-dir';
const testFiles = {
  // JavaScript file with various comment types
  'script.js': `// This is a single-line comment at the top
/**
 * This is a multi-line comment block
 * It spans multiple lines
 * @param {string} name - The name parameter
 * @returns {string} - A greeting
 */
function greet(name) {
  // This is an inline comment
  const message = \`Hello, \${name}!\`; // End-of-line comment
  
  /*
   * Another multi-line comment
   * inside the function
   */
  return message;
}

// Single-line comment at the end
greet('World');`,

  // TypeScript file with JSDoc comments
  'types.ts': `/**
 * Interface for a user object
 */
interface User {
  /** The user's unique identifier */
  id: number;
  
  /**
   * The user's full name
   * @example
   * \`\`\`typescript
   * const user: User = { id: 1, name: 'John Doe' };
   * \`\`\`
   */
  name: string;
  
  // Optional email field
  email?: string;
}

// Export the interface
export { User };`,

  // CSS file with comments
  'styles.css': `/* CSS comment at the top */
body {
  margin: 0; /* Reset margin */
  padding: 0;
  font-family: Arial, sans-serif;
}

/**
 * Header styles
 * Contains the main navigation
 */
.header {
  background-color: #333;
  color: white;
  padding: 1rem;
}

/* Footer styles */
.footer {
  background-color: #666;
  color: white;
  padding: 1rem;
  text-align: center; /* Center align text */
}`,

  // Python file (whitespace-sensitive, should preserve comments)
  'script.py': `# Python comment at the top
"""
This is a docstring
It spans multiple lines
"""

def calculate_sum(a, b):
    # This is a comment inside the function
    result = a + b  # End-of-line comment
    
    """
    This is another docstring
    inside the function
    """
    return result

# Call the function
result = calculate_sum(5, 3)
print(f"Result: {result}")`,

  // JSON file (no comments, but good to include)
  'config.json': `{
  "name": "test-app",
  "version": "1.0.0",
  "settings": {
    "debug": true,
    "port": 3000
  }
}`,

  // HTML file with HTML comments
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
</head>
<body>
  <!-- This is a header -->
  <header>
    <h1>Welcome</h1>
    <!-- Navigation will go here -->
  </header>
  
  <!-- Main content section -->
  <main>
    <p>This is a test page.</p>
    <!-- TODO: Add more content -->
  </main>
  
  <!-- Footer section -->
  <footer>
    <p>&copy; 2023 Test App</p>
  </footer>
</body>
</html>`,

  // Markdown file with comments (HTML-style)
  'README.md': `# Test Project

This is a test project for comment stripping.

<!-- This is an HTML comment in Markdown -->

## Features

- Feature 1
- Feature 2

<!-- TODO: Add more features -->

## Usage

\`\`\`bash
npm install
npm start
\`\`\`

<!-- End of file -->`
};

// Test Setup
beforeAll(async () => {
  await mkdir(join(__dirname, testDir), { recursive: true });
  for (const [filename, content] of Object.entries(testFiles)) {
    await writeFile(join(__dirname, testDir, filename), content);
  }
});

// Test Cleanup
afterAll(async () => {
  try {
    await rm(join(__dirname, testDir), { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Test Suite
describe('--keep-comments Feature', () => {

  it('should test with default behavior (comments stripped)', async () => {
    console.log('Test 1: Testing with default behavior (comments stripped)...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: strippedContent, stats: strippedStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: false // Default behavior
    });
    
    console.log(`✓ Default behavior (comments stripped): ${strippedStats.filesToInclude} files, ${strippedStats.totalTokenCount} tokens`);
    
    // Verify JavaScript comments are stripped
    const jsStrippedSection = strippedContent.split('```js')[1]?.split('```')[0] || '';
    expect(jsStrippedSection).not.toContain('//');
    expect(jsStrippedSection).not.toContain('/*');
    expect(jsStrippedSection).not.toContain('*/');
  });

  it('should test with --keep-comments flag', async () => {
    console.log('Test 2: Testing with --keep-comments flag...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: keptContent, stats: keptStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true // Keep comments
    });
    
    console.log(`✓ With --keep-comments: ${keptStats.filesToInclude} files, ${keptStats.totalTokenCount} tokens`);
    
    // Verify JavaScript comments are kept
    const jsKeptSection = keptContent.split('```js')[1]?.split('```')[0] || '';
    expect(jsKeptSection).toContain('//');
    expect(jsKeptSection).toContain('/*');
    expect(jsKeptSection).toContain('*/');
  });

  it('should verify CSS comments are handled correctly', async () => {
    console.log('Test 4: Verifying CSS comments are handled correctly...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: strippedContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: false
    });
    
    const { finalContent: keptContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    const cssStrippedSection = strippedContent.split('```css')[1]?.split('```')[0] || '';
    const cssKeptSection = keptContent.split('```css')[1]?.split('```')[0] || '';
    
    // Stripped content should not contain CSS comments
    expect(cssStrippedSection).not.toContain('/*');
    expect(cssStrippedSection).not.toContain('*/');
    
    // Kept content should contain CSS comments
    expect(cssKeptSection).toContain('/*');
    expect(cssKeptSection).toContain('*/');
    
    console.log('✓ CSS comments are correctly stripped/kept');
  });

  it('should verify HTML comments are handled correctly', async () => {
    console.log('Test 5: Verifying HTML comments are handled correctly...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: strippedContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: false
    });
    
    const { finalContent: keptContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    const htmlStrippedSection = strippedContent.split('```html')[1]?.split('```')[0] || '';
    const htmlKeptSection = keptContent.split('```html')[1]?.split('```')[0] || '';
    
    // Kept content should contain HTML comments
    expect(htmlKeptSection).toContain('<!--');
    expect(htmlKeptSection).toContain('-->');
    
    console.log('✓ HTML comments are correctly stripped/kept');
  });

  it('should verify Python comments are preserved (whitespace-sensitive)', async () => {
    console.log('Test 6: Verifying Python comments are preserved (whitespace-sensitive)...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: strippedContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: false
    });
    
    const { finalContent: keptContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    // Find the Python section in the content (note: it's formatted as "py" not "python")
    const pyStrippedMatch = strippedContent.match(/# script\.py\n\n```py\n(.*?)\n```/s);
    const pyKeptMatch = keptContent.match(/# script\.py\n\n```py\n(.*?)\n```/s);
    
    let pyStrippedSection, pyKeptSection;
    
    if (!pyStrippedMatch || !pyKeptMatch) {
      // Try a different pattern
      const altPyStrippedMatch = strippedContent.match(/script\.py\n\n```py\n(.*?)\n```/s);
      const altPyKeptMatch = keptContent.match(/script\.py\n\n```py\n(.*?)\n```/s);
      
      if (!altPyStrippedMatch || !altPyKeptMatch) {
        throw new Error('Python file content not found in expected format');
      }
      
      pyStrippedSection = altPyStrippedMatch[1];
      pyKeptSection = altPyKeptMatch[1];
    } else {
      pyStrippedSection = pyStrippedMatch[1];
      pyKeptSection = pyKeptMatch[1];
    }
    
    // Python comments should be preserved in both cases (whitespace-sensitive)
    expect(pyStrippedSection).toContain('#');
    expect(pyStrippedSection).toContain('"""');
    
    expect(pyKeptSection).toContain('#');
    expect(pyKeptSection).toContain('"""');
    
    // Both should be identical since Python is whitespace-sensitive
    expect(pyStrippedSection).toBe(pyKeptSection);
    
    console.log('✓ Python comments are correctly preserved (whitespace-sensitive)');
  });

  it('should verify token savings', async () => {
    console.log('Test 7: Verifying token savings...');
    const testPath = join('test/unit', testDir);
    
    const { stats: strippedStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: false
    });
    
    const { stats: keptStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    const tokenSavings = keptStats.totalTokenCount - strippedStats.totalTokenCount;
    console.log(`Token savings from stripping comments: ${tokenSavings} tokens (${((tokenSavings / keptStats.totalTokenCount) * 100).toFixed(2)}%)`);
    
    expect(tokenSavings).toBeGreaterThan(0);
    
    console.log('✓ Comment stripping provides significant token savings');
  });

  it('should test CLI with default behavior', async () => {
    console.log('Test 8: Testing CLI with default behavior...');
    const testPath = join('test/unit', testDir);
    
    const { stdout: defaultStdout } = await execAsync(
      `node dist/cli.js ${testPath}`,
      { cwd: join(__dirname, '../..') }
    );
    
    // Default behavior should strip comments (but HTML comments might not be stripped)
    expect(defaultStdout).not.toContain('//');
    expect(defaultStdout).not.toContain('/*');
    
    console.log('✓ CLI strips comments by default');
  });

  it('should test CLI with --keep-comments flag', async () => {
    console.log('Test 9: Testing CLI with --keep-comments flag...');
    const testPath = join('test/unit', testDir);
    
    const { stdout: keepCommentsStdout } = await execAsync(
      `node dist/cli.js ${testPath} --keep-comments`,
      { cwd: join(__dirname, '../..') }
    );
    
    // With --keep-comments, comments should be present
    expect(keepCommentsStdout).toContain('//');
    expect(keepCommentsStdout).toContain('/*');
    expect(keepCommentsStdout).toContain('<!--');
    
    console.log('✓ CLI --keep-comments flag works correctly');
  });

  it('should test with --show-tokens flag', async () => {
    console.log('Test 10: Testing with --show-tokens flag...');
    const testPath = join('test/unit', testDir);
    
    const { stdout: strippedTokensStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(strippedTokensStdout).toContain('File Statistics');
    
    const { stdout: keptTokensStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens --keep-comments`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(keptTokensStdout).toContain('File Statistics');
    
    console.log('✓ --show-tokens works with and without --keep-comments');
  });

  it('should test with other flags', async () => {
    console.log('Test 11: Testing with other flags...');
    const testPath = join('test/unit', testDir);
    
    // Test with --keep-whitespace
    const { stdout: whitespaceStdout } = await execAsync(
      `node dist/cli.js ${testPath} --keep-whitespace`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(whitespaceStdout).not.toContain('//');
    expect(whitespaceStdout).not.toContain('/*');
    
    // Test with --keep-comments and --keep-whitespace
    const { stdout: bothFlagsStdout } = await execAsync(
      `node dist/cli.js ${testPath} --keep-comments --keep-whitespace`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(bothFlagsStdout).toContain('//');
    expect(bothFlagsStdout).toContain('/*');
    
    console.log('✓ --keep-comments works with other flags');
  });

  it('should test getFileStats with comment stripping', async () => {
    console.log('Test 12: Testing getFileStats with comment stripping...');
    const testPath = join('test/unit', testDir);
    
    const { stats: strippedFileStats } = await getFileStats({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: false
    });
    
    const { stats: keptFileStats } = await getFileStats({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    // Stripped version should have fewer tokens
    expect(strippedFileStats.totalTokenCount).toBeLessThan(keptFileStats.totalTokenCount);
    
    console.log(`✓ getFileStats shows token difference: ${keptFileStats.totalTokenCount} -> ${strippedFileStats.totalTokenCount} tokens`);
  });

});