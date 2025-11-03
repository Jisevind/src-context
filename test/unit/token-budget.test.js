/**
 * Unit tests for --token-budget feature functionality
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

// Test data - create files with different token counts
const testDir = 'token-budget-test-dir';
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
});`
};

describe('--token-budget Feature', () => {
  beforeAll(async () => {
    await mkdir(join(__dirname, testDir), { recursive: true });
    for (const [filename, content] of Object.entries(testFiles)) {
      await writeFile(join(__dirname, testDir, filename), content);
    }
  });

  afterAll(async () => {
    try {
      await rm(join(__dirname, testDir), { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should work with small token budget using generateContext API', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    // First, get stats without token budget to see total tokens
    const { files: allFilesStats } = await getFileStats({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    const totalTokens = allFilesStats.reduce((sum, file) => sum + file.tokenCount, 0);
    console.log(`Total tokens without budget: ${totalTokens}`);
    
    // Test with a budget that should include only the smallest file
    const smallBudget = 50; // Very small budget
    const { finalContent: smallBudgetContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      tokenBudget: smallBudget
    });
    
    expect(smallBudgetContent.length).toBeGreaterThan(0);
  });

  it('should include more content with medium budget than small budget', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    // Test with a budget that should include only the smallest file
    const smallBudget = 50; // Very small budget
    const { finalContent: smallBudgetContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      tokenBudget: smallBudget
    });
    
    // Test with a budget that should include multiple files
    const mediumBudget = 200; // Medium budget
    const { finalContent: mediumBudgetContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      tokenBudget: mediumBudget
    });
    
    expect(mediumBudgetContent.length).toBeGreaterThan(smallBudgetContent.length);
  });

  it('should include all files with large token budget', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    // Test with a very large budget (should include all files)
    const largeBudget = 10000; // Large budget
    const { finalContent: largeBudgetContent } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      tokenBudget: largeBudget
    });
    
    // Should contain content from all files
    expect(largeBudgetContent).toContain('small-file.js');
    expect(largeBudgetContent).toContain('medium-file.js');
    expect(largeBudgetContent).toContain('large-file.js');
  });

  it('should work with CLI --token-budget flag with small budget', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    // Test CLI with small token budget
    const { stdout: smallBudgetStdout } = await execAsync(
      `node dist/cli.js ${testPath} --token-budget 100`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(smallBudgetStdout.length).toBeGreaterThan(0);
  });

  it('should include all files with CLI --token-budget flag with large budget', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    // Test CLI with large token budget
    const { stdout: largeBudgetStdout } = await execAsync(
      `node dist/cli.js ${testPath} --token-budget 10000`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(largeBudgetStdout).toContain('small-file.js');
    expect(largeBudgetStdout).toContain('medium-file.js');
    expect(largeBudgetStdout).toContain('large-file.js');
  });

  it('should work with --token-budget and --show-tokens flags', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    const { stdout: statsStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens --token-budget 200`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(statsStdout).toContain('File Statistics');
  });

  it('should work with --token-budget and --keep-whitespace flags', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    // Test with --keep-whitespace
    const { stdout: whitespaceStdout } = await execAsync(
      `node dist/cli.js ${testPath} --token-budget 200 --keep-whitespace`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(whitespaceStdout.length).toBeGreaterThan(0);
  });

  it('should work with --token-budget and --keep-comments flags', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    // Test with --keep-comments
    const { stdout: commentsStdout } = await execAsync(
      `node dist/cli.js ${testPath} --token-budget 200 --keep-comments`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(commentsStdout.length).toBeGreaterThan(0);
  });

  it('should respect token budget limit', async () => {
    const testPath = join('test/unit', testDir); // Use relative path from project root
    
    const budgetLimit = 150;
    const { files: budgetedFiles } = await getFileStats({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      tokenBudget: budgetLimit
    });
    
    const totalBudgetedTokens = budgetedFiles.reduce((sum, file) => sum + file.tokenCount, 0);
    
    expect(totalBudgetedTokens).toBeLessThanOrEqual(budgetLimit);
  });
});