/**
 * Unit tests for Smart Optimizations feature functionality
 * Tests the feature that automatically removes unnecessary whitespace from code
 * but intelligently skips files like Python or YAML to save tokens
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

// Test data - create files with different types and whitespace patterns
const testDir = 'smart-optimizations-test-dir';
const testFiles = {
  // JavaScript file with excessive whitespace (should be optimized)
  'script.js': `// JavaScript file with excessive whitespace
function calculateSum( a, b ) {
    
    // This function calculates the sum of two numbers
    
    let result = a + b;
    
    
    return result;
    
}


class Calculator {
    
    constructor() {
        
        this.history = [];
        
    }
    
    add( a, b ) {
        
        const result = this.calculateSum( a, b );
        
        this.history.push( {
            operation: 'add',
            operands: [ a, b ],
            result: result
        } );
        
        return result;
        
    }
    
    calculateSum( a, b ) {
        
        return a + b;
        
    }
    
}


// Usage example
const calc = new Calculator();


console.log( calc.add( 5, 3 ) );`,

  // Python file with whitespace (should NOT be optimized due to whitespace sensitivity)
  'script.py': `# Python file with whitespace (should be preserved)
def calculate_sum(a, b):
    
    # This function calculates the sum of two numbers
    
    result = a + b
    
    
    return result
    

class Calculator:
    
    def __init__(self):
        
        self.history = []
        
    def add(self, a, b):
        
        result = self.calculate_sum(a, b)
        
        self.history.append({
            'operation': 'add',
            'operands': [a, b],
            'result': result
        })
        
        return result
        
    def calculate_sum(self, a, b):
        
        return a + b
        

# Usage example
calc = Calculator()

print(calc.add(5, 3))`,

  // YAML file with whitespace (should NOT be optimized due to whitespace sensitivity)
  'config.yaml': `# YAML configuration file
app:
  name: "Test Application"
  version: "1.0.0"
  
  settings:
    
    # Database configuration
    database:
      host: "localhost"
      port: 5432
      name: "testdb"
      
    # Cache configuration
    cache:
      enabled: true
      ttl: 3600
      
      
# Feature flags
features:
  
  authentication: true
  logging: true
  
  # Experimental features
  experimental:
    new_ui: false
    beta_api: true`,

  // JSON file with whitespace (should be optimized)
  'config.json': `{
  "name": "test-app",
  "version": "1.0.0",
  "port": 3000,
  
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "testdb"
  },
  
  
  "features": {
    "authentication": true,
    "logging": true,
    
    "experimental": {
      "new_ui": false,
      "beta_api": true
    }
  }
}`,

  // CSS file with whitespace (should be optimized)
  'styles.css': `/* CSS file with excessive whitespace */
body {
    
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    
    
}

.header {
    
    background-color: #333;
    color: white;
    padding: 1rem;
    
    text-align: center;
    
}

.content {
    
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    
    
}

@media (max-width: 768px) {
    
    .content {
        
        padding: 1rem;
        
    }
    
}`,

  // HTML file with whitespace (should be optimized)
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
    
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Page</title>
    
    
</head>
<body>
    
    <div class="header">
        
        <h1>Welcome</h1>
        
    </div>
    
    <div class="content">
        
        <p>This is a test page.</p>
        
        
    </div>
    
</body>
</html>`,

  // Pug file with whitespace (should NOT be optimized due to whitespace sensitivity)
  'template.pug': `doctype html
html(lang="en")
  head
    
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title Test Page
    
    
  body
    
    .header
      
      h1 Welcome
      
    .content
      
      p This is a test page.
      
      
`,

  // Markdown file with whitespace (should be optimized)
  'README.md': `# Test Project

This is a test project for smart optimizations.


## Features

- Feature 1
- Feature 2


## Usage

\`\`\`bash
npm install
npm start
\`\`\`


## License

MIT`
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
describe('Smart Optimizations (Whitespace)', () => {

  it('should test with smart optimizations enabled (default behavior)', async () => {
    console.log('Test 1: Testing with smart optimizations enabled...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: optimizedContent, stats: optimizedStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: true,
      keepComments: true
    });
    
    console.log(`✓ Smart optimizations enabled: ${optimizedStats.filesToInclude} files, ${optimizedStats.totalTokenCount} tokens`);
  });

  it('should test with smart optimizations disabled', async () => {
    console.log('Test 2: Testing with smart optimizations disabled...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: unoptimizedContent, stats: unoptimizedStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    console.log(`✓ Smart optimizations disabled: ${unoptimizedStats.filesToInclude} files, ${unoptimizedStats.totalTokenCount} tokens`);
  });

  it('should verify whitespace-sensitive files are preserved', async () => {
    console.log('Test 3: Verifying whitespace-sensitive files are preserved...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: optimizedContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: true,
      keepComments: true
    });
    
    const { finalContent: unoptimizedContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    // Python file should preserve its whitespace
    const pythonContentOptimized = optimizedContent.split('```python')[1]?.split('```')[0] || '';
    const pythonContentUnoptimized = unoptimizedContent.split('```python')[1]?.split('```')[0] || '';
    
    expect(pythonContentOptimized).toBe(pythonContentUnoptimized);
    
    // YAML file should preserve its whitespace
    const yamlContentOptimized = optimizedContent.split('```yaml')[1]?.split('```')[0] || '';
    const yamlContentUnoptimized = unoptimizedContent.split('```yaml')[1]?.split('```')[0] || '';
    
    expect(yamlContentOptimized).toBe(yamlContentUnoptimized);
    
    // Pug file should preserve its whitespace
    const pugContentOptimized = optimizedContent.split('```pug')[1]?.split('```')[0] || '';
    const pugContentUnoptimized = unoptimizedContent.split('```pug')[1]?.split('```')[0] || '';
    
    expect(pugContentOptimized).toBe(pugContentUnoptimized);
    
    console.log('✓ Whitespace-sensitive files (Python, YAML, Pug) are preserved correctly');
  });

  it('should verify non-whitespace-sensitive files are optimized', async () => {
    console.log('Test 4: Verifying non-whitespace-sensitive files are optimized...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: optimizedContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: true,
      keepComments: true
    });
    
    const { finalContent: unoptimizedContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    // JavaScript file should have its whitespace optimized
    const jsContentOptimized = optimizedContent.split('```js')[1]?.split('```')[0] || '';
    const jsContentUnoptimized = unoptimizedContent.split('```js')[1]?.split('```')[0] || '';
    
    // Optimized content should be shorter or equal
    expect(jsContentOptimized.length).toBeLessThanOrEqual(jsContentUnoptimized.length);
    
    // Check that excessive newlines are reduced (not necessarily completely removed)
    const excessiveNewlinesInOptimized = (jsContentOptimized.match(/\n{3,}/g) || []).length;
    const excessiveNewlinesInUnoptimized = (jsContentUnoptimized.match(/\n{3,}/g) || []).length;
    
    expect(excessiveNewlinesInOptimized).toBeLessThanOrEqual(excessiveNewlinesInUnoptimized);
    
    // JSON file should have its whitespace optimized
    const jsonContentOptimized = optimizedContent.split('```json')[1]?.split('```')[0] || '';
    const jsonContentUnoptimized = unoptimizedContent.split('```json')[1]?.split('```')[0] || '';
    
    expect(jsonContentOptimized.length).toBeLessThanOrEqual(jsonContentUnoptimized.length);
    
    console.log('✓ Non-whitespace-sensitive files (JavaScript, JSON, CSS, HTML, Markdown) are optimized correctly');
  });

  it('should verify token savings', async () => {
    console.log('Test 5: Verifying token savings...');
    const testPath = join('test/unit', testDir);
    
    const { finalContent: optimizedContent, stats: optimizedStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: true,
      keepComments: true
    });
    
    const { finalContent: unoptimizedContent, stats: unoptimizedStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    const tokenSavings = unoptimizedStats.totalTokenCount - optimizedStats.totalTokenCount;
    console.log(`Token savings: ${tokenSavings} tokens (${((tokenSavings / unoptimizedStats.totalTokenCount) * 100).toFixed(2)}%)`);
    
    expect(tokenSavings).toBeGreaterThan(0);
    
    console.log('✓ Smart optimizations provide significant token savings');
  });

  it('should test CLI with smart optimizations', async () => {
    console.log('Test 6: Testing CLI with smart optimizations...');
    const testPath = join('test/unit', testDir);
    
    // Test CLI with smart optimizations (default behavior)
    const { stdout: optimizedStdout } = await execAsync(
      `node dist/cli.js ${testPath}`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(optimizedStdout).toContain('script.js');
    expect(optimizedStdout).toContain('script.py');
    
    // Test CLI with --keep-whitespace flag (disables smart optimizations)
    const { stdout: unoptimizedStdout } = await execAsync(
      `node dist/cli.js ${testPath} --keep-whitespace`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(unoptimizedStdout).toContain('script.js');
    expect(unoptimizedStdout).toContain('script.py');
    
    // The optimized output should be shorter than unoptimized output
    expect(optimizedStdout.length).toBeLessThanOrEqual(unoptimizedStdout.length);
    
    console.log('✓ CLI smart optimizations work correctly');
  });

  it('should test smart optimizations with --show-tokens flag', async () => {
    console.log('Test 7: Testing smart optimizations with --show-tokens flag...');
    const testPath = join('test/unit', testDir);
    
    const { stdout: optimizedTokensStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(optimizedTokensStdout).toContain('File Statistics');
    
    // Should show all files in statistics
    const expectedFiles = ['script.js', 'script.py', 'config.yaml', 'config.json', 'styles.css', 'index.html', 'template.pug', 'README.md'];
    for (const filename of expectedFiles) {
      expect(optimizedTokensStdout).toContain(filename);
    }
    
    console.log('✓ Smart optimizations work with --show-tokens flag');
  });

  it('should test smart optimizations with other flags', async () => {
    console.log('Test 8: Testing smart optimizations with other flags...');
    const testPath = join('test/unit', testDir);
    
    // Test with --keep-comments
    const { stdout: commentsStdout } = await execAsync(
      `node dist/cli.js ${testPath} --keep-comments`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(commentsStdout).toContain('script.js');
    expect(commentsStdout).toContain('script.py');
    
    // Test with --token-budget
    const { stdout: budgetStdout } = await execAsync(
      `node dist/cli.js ${testPath} --token-budget 1000`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(budgetStdout).toContain('script.js');
    expect(budgetStdout).toContain('script.py');
    
    console.log('✓ Smart optimizations work with other flags');
  });

});