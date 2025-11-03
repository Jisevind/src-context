/**
 * Unit tests for --watch feature functionality
 * Tests the feature that automatically rebuilds the context when files are saved
 */

import { generateContext } from '../../dist/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { setTimeout } from 'timers/promises';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data
const testDir = 'watch-test-dir';
const testFiles = {
  'index.js': `// Main entry point
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});`,
  
  'utils.js': `// Utility functions
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US').format(date);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { formatDate, capitalize };`,
  
  'config.json': `{
  "name": "test-app",
  "version": "1.0.0",
  "port": 3000,
  "database": {
    "host": "localhost",
    "port": 5432
  }
}`
};

describe('--watch Feature', () => {
  let watchProcess;
  let clipWatchProcess;

  beforeAll(async () => {
    await mkdir(join(__dirname, testDir), { recursive: true });
    for (const [filename, content] of Object.entries(testFiles)) {
      await writeFile(join(__dirname, testDir, filename), content);
    }
  });

  afterAll(async () => {
    // Kill any running watch processes
    if (watchProcess) {
      watchProcess.kill('SIGINT');
    }
    if (clipWatchProcess) {
      clipWatchProcess.kill('SIGINT');
    }
    
    try {
      await rm(join(__dirname, testDir), { recursive: true, force: true });
      // Clean up any output files created during tests
      await rm(join(__dirname, '../..', 'watch-output.txt'), { force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should correctly handle file changes in watch mode', async () => {
    console.log('Testing --watch feature functionality...');
    
    // Test 1: Verify initial context generation without watch
    console.log('Test 1: Testing initial context generation...');
    // Use relative path that works from both test/unit and project root
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;
    
    const { finalContent: initialContent, stats: initialStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    // Verify initial content includes all test files
    expect(initialContent).toContain('index.js');
    expect(initialContent).toContain('utils.js');
    expect(initialContent).toContain('config.json');
    
    console.log(`✓ Initial context generated with ${initialStats.filesToInclude} files`);
    
    // Test 2: Test CLI --watch flag with output file
    console.log('Test 2: Testing CLI --watch flag with output file...');
    
    // Start the watch process in the background
    const outputPath = 'watch-output.txt';
    // When running from project root, we need to use the full path
    const cliPath = process.cwd().includes('test/unit') ? testPath : testPath;
    
    watchProcess = exec(
      `node dist/cli.js ${cliPath} --output ${outputPath} --watch`,
      { cwd: join(__dirname, '../..') }
    );
    
    let watchOutput = '';
    watchProcess.stdout?.on('data', (data) => {
      watchOutput += data.toString();
    });
    
    watchProcess.stderr?.on('data', (data) => {
      watchOutput += data.toString();
    });
    
    // Wait for initial build to complete
    await setTimeout(3000);
    
    // Check if initial output file was created
    const fs = await import('fs/promises');
    const outputFilePath = join(__dirname, '../..', outputPath);
    
    const initialOutput = await fs.readFile(outputFilePath, 'utf-8');
    
    expect(initialOutput).toContain('index.js');
    expect(initialOutput).toContain('utils.js');
    expect(initialOutput).toContain('config.json');
    
    console.log('✓ Initial output file created correctly');
    
    // Test 3: Modify a file and verify rebuild
    console.log('Test 3: Testing file modification triggers rebuild...');
    
    // Modify the index.js file
    const modifiedContent = `// Modified main entry point
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello Modified World!' });
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'running', version: '2.0.0' });
});

app.listen(3000, () => {
  console.log('Modified server running on port 3000');
});`;
    
    await writeFile(join(__dirname, testDir, 'index.js'), modifiedContent);
    
    // Wait for the watcher to detect the change and rebuild
    await setTimeout(2000);
    
    // Check if the output file was updated with the modified content
    const updatedOutput = await fs.readFile(join(__dirname, '../..', outputPath), 'utf-8');
    
    expect(updatedOutput).toContain('Hello Modified World!');
    expect(updatedOutput).toContain('/api/status');
    
    console.log('✓ File modification triggered rebuild correctly');
    
    // Test 4: Add a new file and verify rebuild
    console.log('Test 4: Testing new file addition triggers rebuild...');
    
    const newFileContent = `// New service file
class DataService {
  constructor() {
    this.data = [];
  }
  
  addData(item) {
    this.data.push(item);
    return this.data.length;
  }
  
  getData() {
    return this.data;
  }
  
  clearData() {
    this.data = [];
    return true;
  }
}

module.exports = DataService;`;
    
    await writeFile(join(__dirname, testDir, 'service.js'), newFileContent);
    
    // Wait for the watcher to detect the new file and rebuild
    await setTimeout(2000);
    
    // Check if the output file was updated with the new file
    const updatedOutput2 = await fs.readFile(join(__dirname, '../..', outputPath), 'utf-8');
    
    expect(updatedOutput2).toContain('service.js');
    expect(updatedOutput2).toContain('DataService');
    
    console.log('✓ New file addition triggered rebuild correctly');
    
    // Test 5: Delete a file and verify rebuild
    console.log('Test 5: Testing file deletion triggers rebuild...');
    
    await rm(join(__dirname, testDir, 'config.json'), { force: true });
    
    // Wait for the watcher to detect the deletion and rebuild
    await setTimeout(2000);
    
    // Check if the output file was updated without the deleted file
    const updatedOutput3 = await fs.readFile(join(__dirname, '../..', outputPath), 'utf-8');
    
    expect(updatedOutput3).not.toContain('config.json');
    expect(updatedOutput3).toContain('index.js');
    expect(updatedOutput3).toContain('utils.js');
    
    console.log('✓ File deletion triggered rebuild correctly');
    
    // Test 6: Verify watch mode handles multiple rapid changes
    console.log('Test 6: Testing watch mode handles multiple rapid changes...');
    
    // Make multiple rapid changes to test debouncing
    await writeFile(join(__dirname, testDir, 'index.js'), `// Rapid change 1
const express = require('express');
const app = express();
app.get('/', (req, res) => {
  res.json({ message: 'Rapid change 1' });
});`);
    
    await writeFile(join(__dirname, testDir, 'index.js'), `// Rapid change 2
const express = require('express');
const app = express();
app.get('/', (req, res) => {
  res.json({ message: 'Rapid change 2' });
});`);
    
    await writeFile(join(__dirname, testDir, 'index.js'), `// Final rapid change
const express = require('express');
const app = express();
app.get('/', (req, res) => {
  res.json({ message: 'Final rapid change' });
});`);
    
    // Wait for debounced rebuild
    await setTimeout(2000);
    
    // Check if the output file was updated with the final content
    const currentOutput = await fs.readFile(join(__dirname, '../..', outputPath), 'utf-8');
    
    expect(currentOutput).toContain('Final rapid change');
    
    console.log('✓ Watch mode handles multiple rapid changes correctly');
    
    // Clean up the watch process
    watchProcess.kill('SIGINT');
    watchProcess = null;
    
    // Test 7: Test --watch with --clip flag
    console.log('Test 7: Testing --watch with --clip flag...');
    
    // Start watch process with clipboard
    const clipCliPath = process.cwd().includes('test/unit') ? testPath : testPath;
    clipWatchProcess = exec(
      `node dist/cli.js ${clipCliPath} --clip --watch`,
      { cwd: join(__dirname, '../..') }
    );
    
    let clipWatchOutput = '';
    clipWatchProcess.stdout?.on('data', (data) => {
      clipWatchOutput += data.toString();
    });
    
    // Wait for initial build
    await setTimeout(2000);
    
    expect(clipWatchOutput).toContain('Context copied to clipboard!');
    
    // Clean up the clip watch process
    clipWatchProcess.kill('SIGINT');
    clipWatchProcess = null;
    
    console.log('✓ --watch with --clip flag works correctly');
    
    console.log('✅ All --watch feature tests passed!');
  }, 30000); // 30 second timeout for watch mode tests
});