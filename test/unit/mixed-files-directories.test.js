/**
 * Unit test to verify that gatherFiles correctly handles mixed file and directory paths
 * This test specifically addresses the bug where file paths were incorrectly passed to glob's cwd option
 */

import { gatherFiles } from '../../dist/core.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test Setup
beforeAll(async () => {
  // Create test directory
  await mkdir(join(__dirname, 'mixed-test'), { recursive: true });
  
  // Create some test files
  await writeFile(join(__dirname, 'mixed-test', 'file1.js'), 'console.log("file1");');
  await writeFile(join(__dirname, 'mixed-test', 'file2.js'), 'console.log("file2");');
  
  // Create a subdirectory with files
  await mkdir(join(__dirname, 'mixed-test', 'subdir'), { recursive: true });
  await writeFile(join(__dirname, 'mixed-test', 'subdir', 'file3.js'), 'console.log("file3");');
  
  // Create individual test files in the test directory root
  await writeFile(join(__dirname, 'single-file-1.js'), 'console.log("single file 1");');
  await writeFile(join(__dirname, 'single-file-2.js'), 'console.log("single file 2");');
});

// Test Cleanup
afterAll(async () => {
  try {
    await rm(join(__dirname, 'mixed-test'), { recursive: true, force: true });
    await rm(join(__dirname, 'single-file-1.js'), { force: true });
    await rm(join(__dirname, 'single-file-2.js'), { force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Test Suite
describe('Mixed File and Directory Paths', () => {

  it('should handle a mix of file and directory inputs', async () => {
    console.log('Testing mixed file and directory paths handling...');
    
    // Test with mixed file and directory paths
    const inputPaths = [
      'test/unit/mixed-test',           // Directory
      'test/unit/single-file-1.js',     // Single file
      'test/unit/mixed-test/subdir',    // Subdirectory
      'test/unit/single-file-2.js'      // Another single file
    ];
    
    const { filesToInclude, filesToMinify, stats } = await gatherFiles(inputPaths);
    
    console.log(`✓ Mixed paths processed: ${filesToInclude.length} files to include, ${filesToMinify.length} files to minify`);
    console.log(`✓ Total files found: ${stats.totalFilesFound}`);
    
    // Verify expected files are included
    const expectedFiles = [
      'file1.js',
      'file2.js', 
      'file3.js',
      'single-file-1.js',
      'single-file-2.js'
    ];
    
    for (const expectedFile of expectedFiles) {
      expect(filesToInclude.some(file => file.includes(expectedFile))).toBe(true);
    }
    
    // Verify we have the right number of files
    expect(filesToInclude).toHaveLength(5);
    
    console.log('✅ Mixed file and directory paths test passed!');
  });

});