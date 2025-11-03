/**
 * Unit tests for --show-tokens feature functionality
 * Tests the feature that provides a detailed breakdown of which files are the "most expensive" in your project
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

// Test data - create files with different token counts to test sorting
const testDir = 'show-tokens-test-dir';
const testFiles = {
  'small-file.js': `// Small file with few tokens
const x = 1;
console.log(x);`,
  
  'medium-file.js': `// Medium file with moderate token count
function processData(data) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 0) {
      result.push(data[i] * 2);
    }
  }
  return result;
}

const input = [1, -2, 3, -4, 5];
const output = processData(input);
console.log(output);`,
  
  'large-file.js': `// Large file with many tokens
class DataProcessor {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.stats = {
      processed: 0,
      errors: 0,
      warnings: 0
    };
  }

  async processLargeDataset(dataset) {
    const results = [];
    
    for (const item of dataset) {
      try {
        const processed = await this.processItem(item);
        results.push(processed);
        this.stats.processed++;
        
        if (this.stats.processed % 100 === 0) {
          console.log(\`Processed \${this.stats.processed} items\`);
        }
      } catch (error) {
        console.error(\`Error processing item: \${error.message}\`);
        this.stats.errors++;
      }
    }
    
    return {
      results,
      stats: { ...this.stats }
    };
  }

  async processItem(item) {
    if (this.cache.has(item.id)) {
      return this.cache.get(item.id);
    }
    
    const processed = {
      id: item.id,
      data: item.data,
      timestamp: Date.now(),
      metadata: {
        source: 'processor',
        version: '1.0.0',
        quality: this.calculateQuality(item)
      }
    };
    
    this.cache.set(item.id, processed);
    return processed;
  }

  calculateQuality(item) {
    const factors = [
      item.completeness || 0,
      item.accuracy || 0,
      item.consistency || 0
    ];
    
    return factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      uptime: Date.now() - this.startTime
    };
  }
}

// Usage example
const processor = new DataProcessor({
  maxCacheSize: 1000,
  enableLogging: true,
  retryOnError: true
});

const sampleData = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  data: \`Sample data item \${i + 1}\`,
  completeness: Math.random(),
  accuracy: Math.random(),
  consistency: Math.random()
}));

processor.processLargeDataset(sampleData).then(result => {
  console.log('Processing complete:', result.stats);
});`,

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
    "caching": false
  }
}`,

  'styles.css': `/* CSS file with moderate content */
body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
  line-height: 1.6;
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

.footer {
  background-color: #666;
  color: white;
  padding: 1rem;
  text-align: center;
  position: fixed;
  bottom: 0;
  width: 100%;
}

@media (max-width: 768px) {
  .content {
    padding: 1rem;
  }
}`
};

// Test Setup
beforeAll(async () => {
  // Create test directory in project root
  await mkdir(join(__dirname, '../..', testDir), { recursive: true });
  for (const [filename, content] of Object.entries(testFiles)) {
    await writeFile(join(__dirname, '../..', testDir, filename), content);
  }
});

// Test Cleanup
afterAll(async () => {
  try {
    await rm(join(__dirname, '../..', testDir), { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Test Suite
describe('--show-tokens Feature', () => {

  it('should verify getFileStats API returns files sorted by token count (descending)', async () => {
    console.log('Test 1: Testing getFileStats API sorting...');
    // Use relative path from project root
    const testPath = testDir;
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    try {
      const { files: fileStats, stats } = await getFileStats({
        inputPaths: [testPath],
        cliIgnores: [],
        customIgnoreFile: '.contextignore',
        removeWhitespace: false,
        keepComments: true
      });
    
      // Check if we have any files
      expect(fileStats.length).toBeGreaterThan(0);
      
      // Verify files are sorted by token count in descending order
      for (let i = 1; i < fileStats.length; i++) {
        expect(fileStats[i-1].tokenCount).toBeGreaterThanOrEqual(fileStats[i].tokenCount);
      }
      
      // Verify the largest file is at the top
      expect(fileStats[0].path).toContain('large-file.js');
      
      console.log(`✓ Files correctly sorted by token count (descending)`);
      console.log(`  Top file: ${fileStats[0].path} with ${fileStats[0].tokenCount} tokens`);
      console.log(`  Total files: ${fileStats.length}, Total tokens: ${stats.totalTokenCount}`);
    } finally {
      // Restore original working directory
      process.chdir(originalCwd);
    }
  });

  it('should test CLI --show-tokens flag', async () => {
    console.log('Test 2: Testing CLI --show-tokens flag...');
    const testPath = testDir;
    
    const { stdout: showTokensStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens`,
      { cwd: join(__dirname, '../..') }
    );
    
    // Verify the output contains the expected headers and formatting
    expect(showTokensStdout).toContain('File Statistics');
    expect(showTokensStdout).toContain('Token Count');
    
    // Verify all test files are mentioned in the output
    const expectedFiles = ['small-file.js', 'medium-file.js', 'large-file.js', 'config.json', 'styles.css'];
    for (const filename of expectedFiles) {
      expect(showTokensStdout).toContain(filename);
    }
    
    // Verify the files are listed in descending order of token count
    const lines = showTokensStdout.split('\n');
    const fileLines = lines.filter(line => line.includes('.js') || line.includes('.json') || line.includes('.css'));
    
    // Extract token counts from the output (they should be at the end of each line)
    const tokenCounts = fileLines.map(line => {
      const match = line.match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });
    
    // Verify descending order
    for (let i = 1; i < tokenCounts.length; i++) {
      expect(tokenCounts[i-1]).toBeGreaterThanOrEqual(tokenCounts[i]);
    }
    
    console.log('✓ CLI --show-tokens flag works correctly');
  });

  it('should test --show-tokens with --token-budget', async () => {
    console.log('Test 3: Testing --show-tokens with --token-budget...');
    const testPath = testDir;
    
    // First get the file lines from previous test for comparison
    const { stdout: showTokensStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens`,
      { cwd: join(__dirname, '../..') }
    );
    
    const lines = showTokensStdout.split('\n');
    const fileLines = lines.filter(line => 
      line.includes('.js') || line.includes('.json') || line.includes('.css')
    );
    
    const { stdout: budgetStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens --token-budget 200`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(budgetStdout).toContain('File Statistics');
    
    // With a small budget, we should see fewer files
    const budgetLines = budgetStdout.split('\n').filter(line => 
      line.includes('.js') || line.includes('.json') || line.includes('.css')
    );
    
    expect(budgetLines.length).toBeLessThan(fileLines.length);
    
    console.log(`✓ --show-tokens works with --token-budget (showing ${budgetLines.length} files instead of ${fileLines.length})`);
  });

  it('should test --show-tokens with other flags', async () => {
    console.log('Test 4: Testing --show-tokens with other flags...');
    const testPath = testDir;
    
    // Test with --keep-whitespace
    const { stdout: whitespaceStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens --keep-whitespace`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(whitespaceStdout).toContain('File Statistics');
    
    // Test with --keep-comments
    const { stdout: commentsStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens --keep-comments`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(commentsStdout).toContain('File Statistics');
    
    console.log('✓ --show-tokens works with other flags');
  });

  it('should test --show-tokens with multiple paths', async () => {
    console.log('Test 5: Testing --show-tokens with multiple paths...');
    const testPath = testDir;
    
    // Create a second test directory
    const testDir2 = 'show-tokens-test-dir-2';
    await mkdir(join(__dirname, testDir2), { recursive: true });
    await writeFile(join(__dirname, testDir2, 'extra.js'), `// Extra file
function extra() {
  return 'extra content';
}`);
    
    try {
      const { stdout: multiPathStdout } = await execAsync(
        `node dist/cli.js ${testPath} test/unit/${testDir2} --show-tokens`,
        { cwd: join(__dirname, '../..') }
      );
      
      expect(multiPathStdout).toContain('File Statistics');
      expect(multiPathStdout).toContain('extra.js');
      
      console.log('✓ --show-tokens works with multiple paths');
    } finally {
      // Clean up the second test directory
      await rm(join(__dirname, testDir2), { recursive: true, force: true });
    }
  });

  it('should verify top token consumers in stats', async () => {
    console.log('Test 6: Testing top token consumers in stats...');
    const testPath = testDir;
    
    // We need to get fresh stats since the previous ones are out of scope
    // Make sure we're in the right directory
    const testCwd = join(__dirname, '../..');
    process.chdir(testCwd);
    
    const { stats: freshStats } = await getFileStats({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    expect(freshStats.topTokenConsumers).toBeDefined();
    expect(freshStats.topTokenConsumers.length).toBeGreaterThan(0);
    
    // The top token consumer should be the large file
    expect(freshStats.topTokenConsumers[0].path).toContain('large-file.js');
    
    console.log(`✓ Top token consumer correctly identified: ${freshStats.topTokenConsumers[0].path} with ${freshStats.topTokenConsumers[0].tokenCount} tokens`);
  });

  it('should test --show-tokens with ignore patterns', async () => {
    console.log('Test 7: Testing --show-tokens with ignore patterns...');
    const testPath = testDir;
    
    const { stdout: ignoreStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens --ignore "*.json"`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(ignoreStdout).toContain('File Statistics');
    expect(ignoreStdout).not.toContain('config.json');
    
    console.log('✓ --show-tokens respects ignore patterns');
  });

});