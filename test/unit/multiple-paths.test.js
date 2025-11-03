/**
 * Unit tests for multiple input paths functionality
 */

import { gatherFiles } from '../../dist/core.js';
import { generateContext, getFileStats } from '../../dist/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data
const testDirs = ['test-dir-a', 'test-dir-b'];
const testFiles = {
  'test-dir-a': ['app.js', 'utils.js'],
  'test-dir-b': ['styles.css', 'config.json']
};

// Test Setup
beforeAll(async () => {
  for (const dir of testDirs) {
    await mkdir(join('test/unit', dir), { recursive: true });
    for (const file of testFiles[dir]) {
      const content = `// Test content for ${file}\nconsole.log('Hello from ${file}');`;
      await writeFile(join('test/unit', dir, file), content);
    }
  }
});

// Test Cleanup
afterAll(async () => {
  for (const dir of testDirs) {
    try {
      await rm(join('test/unit', dir), { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
});

// Test Suite
describe('Multiple Input Paths Core Logic', () => {

  it('should gather files from multiple paths correctly', async () => {
    console.log('Testing multiple input paths functionality...');
    
    // Test gatherFiles with multiple paths
    const testPaths = testDirs.map(dir => join('test/unit', dir));
    const result = await gatherFiles(testPaths);
    
    console.log(`✓ gatherFiles found ${result.filesToInclude.length} files from ${testPaths.length} directories`);
    
    // Verify files from all directories are included
    const hasFilesFromAllDirs = testDirs.every(dir => 
      result.filesToInclude.some(file => file.includes(dir))
    );
    
    expect(hasFilesFromAllDirs).toBe(true);
    
    // Test generateContext with multiple paths
    const contextResult = await generateContext({
      inputPaths: testPaths,
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    console.log(`✓ generateContext processed ${contextResult.stats.filesToInclude} files`);
    
    // Test getFileStats with multiple paths
    const statsResult = await getFileStats({
      inputPaths: testPaths,
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    console.log(`✓ getFileStats returned ${statsResult.files.length} file statistics`);
    
    console.log('✅ All multiple paths tests passed!');
  });

});