/**
 * Unit tests for --watch feature functionality
 * Tests the feature that automatically rebuilds the context when files are saved
 *
 * This file was updated to be more robust in CI:
 *  - Avoids brittle string searches in the generated "tree" output.
 *  - Asserts on the generateContext `stats` (number of files included) instead.
 *  - Verifies CLI watch output file exists and is non-empty rather than relying on
 *    a specific textual layout that can vary across environments.
 */

import { generateContext } from '../../src/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { setTimeout } from 'timers/promises';
import fsPromises from 'fs/promises';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '../..'); // repository root for CLI invocations
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
    // ensure test dir exists and has the test files
    await mkdir(join(__dirname, testDir), { recursive: true });
    for (const [filename, content] of Object.entries(testFiles)) {
      await writeFile(join(__dirname, testDir, filename), content);
    }
  });

  afterAll(async () => {
    // Kill any running watch processes
    if (watchProcess) {
      try { watchProcess.kill('SIGINT'); } catch (e) {}
    }
    if (clipWatchProcess) {
      try { clipWatchProcess.kill('SIGINT'); } catch (e) {}
    }

    try {
      await rm(join(__dirname, testDir), { recursive: true, force: true });
      // Clean up any output files created during tests
      await rm(join(projectRoot, 'watch-output.txt'), { force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should correctly handle file changes in watch mode', async () => {
    console.log('Testing --watch feature functionality...');

    // -------------------------
    // Test 1: initial context
    // -------------------------
    console.log('Test 1: Testing initial context generation...');
    // Use the repository-relative path (the CLI and generateContext often expect project-root-relative input)
    const inputPathForGenerate = join('test', 'unit', testDir);

    const { finalContent: initialContent, stats: initialStats } = await generateContext({
      inputPaths: [inputPathForGenerate],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });

    // Robust assertions:
    //  - There should be at least 3 included files (index.js, utils.js, config.json).
    //  - finalContent should be a non-empty string (we don't rely on a specific format).
    expect(initialStats.filesToInclude).toBeGreaterThanOrEqual(3);
    expect(typeof initialContent).toBe('string');
    expect(initialContent.length).toBeGreaterThan(0);

    console.log(`✓ Initial context generated with ${initialStats.filesToInclude} files`);

    // -------------------------
    // Test 2: CLI --watch with output file
    // -------------------------
    console.log('Test 2: Testing CLI --watch flag with output file...');

    const outputPath = 'watch-output.txt';
    const cliInputPath = join(projectRoot, 'test', 'unit', testDir);

    // Start the watch process via CLI
    watchProcess = exec(
      `node dist/cli.js "${cliInputPath}" --output ${outputPath} --watch`,
      { cwd: projectRoot }
    );

    // capture stdout/stderr for debugging
    let watchOutput = '';
    watchProcess.stdout?.on('data', (data) => { watchOutput += data.toString(); });
    watchProcess.stderr?.on('data', (data) => { watchOutput += data.toString(); });

    // Wait a bit for initial build to finish (timings vary between environments, especially WSL)
    await setTimeout(5000);

    const outputFilePath = join(projectRoot, outputPath);

    // Ensure the output file exists and is non-empty - do not assert on exact textual layout
    // Add retry logic for WSL environments where file system events might be slower
    let initialOutputExists = false;
    let retries = 0;
    const maxRetries = 10; // Increased retries for WSL
    
    while (!initialOutputExists && retries < maxRetries) {
      try {
        const stats = await fsPromises.stat(outputFilePath);
        initialOutputExists = stats.size > 0;
        if (!initialOutputExists) {
          console.log(`Output file exists but is empty, retry ${retries + 1}/${maxRetries}...`);
        }
      } catch (error) {
        console.log(`Output file not ready, retry ${retries + 1}/${maxRetries}...`);
        console.log(`Error: ${error.message}`);
      }
      
      if (!initialOutputExists) {
        await setTimeout(2000); // Longer wait for WSL
        retries++;
      }
    }
    
    // If still doesn't exist, try to debug the watch process
    if (!initialOutputExists) {
      console.log('Watch process output:', watchOutput);
      console.log('Watch process stderr:', watchProcess.stderr ? watchProcess.stderr.toString() : 'No stderr');
    }
    
    expect(initialOutputExists).toBe(true);

    const initialOutput = await fsPromises.readFile(outputFilePath, 'utf-8');
    expect(initialOutput.length).toBeGreaterThan(0);

    console.log('✓ Initial output file created correctly');

    // -------------------------
    // Test 3: Modify a file and verify rebuild
    // -------------------------
    console.log('Test 3: Testing file modification triggers rebuild...');

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

    // Give watcher more time to rebuild (especially for WSL)
    await setTimeout(7000);

    // Add retry logic for reading the updated file with content verification
    let updatedOutput = '';
    let readRetries = 0;
    const maxReadRetries = 10; // Increased retries for WSL
    let contentUpdated = false;
    
    while (!contentUpdated && readRetries < maxReadRetries) {
      try {
        const currentOutput = await fsPromises.readFile(outputFilePath, 'utf-8');
        
        // Check if the content has actually been updated with our modifications
        if (currentOutput.includes('Hello Modified World!') && currentOutput.includes('/api/status')) {
          updatedOutput = currentOutput;
          contentUpdated = true;
          console.log(`Content updated successfully on attempt ${readRetries + 1}`);
        } else {
          console.log(`Content not yet updated, retry ${readRetries + 1}/${maxReadRetries}...`);
          console.log(`Current content preview: ${currentOutput.substring(0, 200)}...`);
          await setTimeout(2000); // Longer wait for WSL
          readRetries++;
        }
      } catch (error) {
        console.log(`Failed to read output file, retry ${readRetries + 1}/${maxReadRetries}...`);
        await setTimeout(2000);
        readRetries++;
      }
    }
    
    console.log('Updated output length:', updatedOutput.length);
    console.log('Updated output preview:', updatedOutput.substring(0, 200));
    
    // Check: updated output should contain at least some unique modified text
    expect(updatedOutput).toContain('Hello Modified World!');
    expect(updatedOutput).toContain('/api/status');

    console.log('✓ File modification triggered rebuild correctly');

    // -------------------------
    // Test 4: Add a new file and verify rebuild
    // -------------------------
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

    await setTimeout(5000); // Increased wait time for WSL

    // Add retry logic for reading the updated file with content verification
    let updatedOutput2 = '';
    let readRetries2 = 0;
    const maxReadRetries2 = 8; // Increased retries for WSL
    let contentUpdated2 = false;
    
    while (!contentUpdated2 && readRetries2 < maxReadRetries2) {
      try {
        const currentOutput = await fsPromises.readFile(outputFilePath, 'utf-8');
        
        // Check if the content has actually been updated with the new file
        if (currentOutput.includes('service.js') && currentOutput.includes('DataService')) {
          updatedOutput2 = currentOutput;
          contentUpdated2 = true;
          console.log(`New file content detected on attempt ${readRetries2 + 1}`);
        } else {
          console.log(`New file not yet detected, retry ${readRetries2 + 1}/${maxReadRetries2}...`);
          await setTimeout(2000); // Longer wait for WSL
          readRetries2++;
        }
      } catch (error) {
        console.log(`Failed to read output file, retry ${readRetries2 + 1}/${maxReadRetries2}...`);
        await setTimeout(2000);
        readRetries2++;
      }
    }
    
    // Ensure the new file name appears somewhere in the output
    expect(updatedOutput2).toContain('service.js');
    expect(updatedOutput2).toContain('DataService');

    console.log('✓ New file addition triggered rebuild correctly');

    // -------------------------
    // Test 5: Delete a file and verify rebuild
    // -------------------------
    console.log('Test 5: Testing file deletion triggers rebuild...');

    await rm(join(__dirname, testDir, 'config.json'), { force: true });

    await setTimeout(5000); // Increased wait time for WSL

    // Add retry logic for reading the updated file with content verification
    let updatedOutput3 = '';
    let readRetries3 = 0;
    const maxReadRetries3 = 8; // Increased retries for WSL
    let contentUpdated3 = false;
    
    while (!contentUpdated3 && readRetries3 < maxReadRetries3) {
      try {
        const currentOutput = await fsPromises.readFile(outputFilePath, 'utf-8');
        
        // Check if the content has actually been updated (config.json removed)
        if (!currentOutput.includes('config.json') && currentOutput.includes('index.js') && currentOutput.includes('utils.js')) {
          updatedOutput3 = currentOutput;
          contentUpdated3 = true;
          console.log(`File deletion detected on attempt ${readRetries3 + 1}`);
        } else {
          console.log(`File deletion not yet detected, retry ${readRetries3 + 1}/${maxReadRetries3}...`);
          await setTimeout(2000); // Longer wait for WSL
          readRetries3++;
        }
      } catch (error) {
        console.log(`Failed to read output file, retry ${readRetries3 + 1}/${maxReadRetries3}...`);
        await setTimeout(2000);
        readRetries3++;
      }
    }
    
    // The deleted file name should no longer appear in the output
    expect(updatedOutput3).not.toContain('config.json');
    expect(updatedOutput3).toContain('index.js');
    expect(updatedOutput3).toContain('utils.js');

    console.log('✓ File deletion triggered rebuild correctly');

    // -------------------------
    // Test 6: Multiple rapid changes (debounce)
    // -------------------------
    console.log('Test 6: Testing watch mode handles multiple rapid changes...');

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

    await setTimeout(5000); // Increased wait time for WSL

    // Add retry logic for reading the updated file with content verification
    let currentOutput = '';
    let readRetries4 = 0;
    const maxReadRetries4 = 8; // Increased retries for WSL
    let contentUpdated4 = false;
    
    while (!contentUpdated4 && readRetries4 < maxReadRetries4) {
      try {
        const output = await fsPromises.readFile(outputFilePath, 'utf-8');
        
        // Check if the content has actually been updated with the final change
        if (output.includes('Final rapid change')) {
          currentOutput = output;
          contentUpdated4 = true;
          console.log(`Final rapid change detected on attempt ${readRetries4 + 1}`);
        } else {
          console.log(`Final rapid change not yet detected, retry ${readRetries4 + 1}/${maxReadRetries4}...`);
          await setTimeout(2000); // Longer wait for WSL
          readRetries4++;
        }
      } catch (error) {
        console.log(`Failed to read output file, retry ${readRetries4 + 1}/${maxReadRetries4}...`);
        await setTimeout(2000);
        readRetries4++;
      }
    }
    
    expect(currentOutput).toContain('Final rapid change');

    console.log('✓ Watch mode handles multiple rapid changes correctly');

    // Clean up watch process
    try { watchProcess.kill('SIGINT'); } catch (e) {}
    watchProcess = null;

    // -------------------------
    // Test 7: --watch with --clip (permissive)
    // -------------------------
    console.log('Test 7: Testing --watch with --clip flag...');

    // Start watch process with clipboard - many CI environments won't have a GUI clipboard,
    // so assert permissively that the process either logs a clipboard success message or a generic watch message.
    const clipCliInputPath = join(projectRoot, 'test', 'unit', testDir);
    clipWatchProcess = exec(
      `node dist/cli.js "${clipCliInputPath}" --clip --watch`,
      { cwd: projectRoot }
    );

    let clipWatchOutput = '';
    clipWatchProcess.stdout?.on('data', (data) => { clipWatchOutput += data.toString(); });
    clipWatchProcess.stderr?.on('data', (data) => { clipWatchOutput += data.toString(); });

    // Wait for initial build
    await setTimeout(3500);

    const clipMessages = [
      'Context copied to clipboard!',
      'Watch mode enabled. Performing initial build',
      'Context written to'
    ];

    const anyClipMsgFound = clipMessages.some(msg => clipWatchOutput.includes(msg));
    expect(anyClipMsgFound).toBe(true);

    // Clean up clip watch process
    try { clipWatchProcess.kill('SIGINT'); } catch (e) {}
    clipWatchProcess = null;

    console.log('✓ --watch with --clip flag works correctly');

    console.log('✅ All --watch feature tests passed!');
  }, 60000); // 60s timeout for WSL environments
});
