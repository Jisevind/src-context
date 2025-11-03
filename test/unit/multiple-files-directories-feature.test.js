/**
 * Unit tests for "Process multiple files and directories in a single command" feature functionality
 * Tests the feature that allows processing multiple files and directories simultaneously in a single command
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

// Test data - create multiple directories and files
const testDirs = ['multi-test-dir-1', 'multi-test-dir-2', 'multi-test-dir-3'];
const testFiles = {
  // Files in first directory
  'multi-test-dir-1': {
    'app.js': `// Main application file
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello from app.js!' });
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
  "name": "test-app-1",
  "version": "1.0.0",
  "port": 3000
}`
  },
  
  // Files in second directory
  'multi-test-dir-2': {
    'server.js': `// Server file
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from server.js!' }));
});

server.listen(8080, () => {
  console.log('HTTP server running on port 8080');
});`,
    'database.js': `// Database connection
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/testdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log('Connected to MongoDB');
});`,
    'styles.css': `/* Styles for the application */
body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  background-color: #333;
  color: white;
  padding: 1rem;
  text-align: center;
}`
  },
  
  // Files in third directory
  'multi-test-dir-3': {
    'api.js': `// API routes
const express = require('express');
const router = express.Router();

router.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

router.post('/users', (req, res) => {
  const { name } = req.body;
  res.json({ id: 3, name });
});

module.exports = router;`,
    'middleware.js': `// Express middleware
function logger(req, res, next) {
  console.log(req.method + ' ' + req.path + ' - ' + new Date().toISOString());
  next();
}

function auth(req, res, next) {
  if (req.headers.authorization) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { logger, auth };`,
    'README.md': `# Test Project

This is a test project for multiple files and directories processing.

## Features

- Express server
- Database connectivity
- API routes
- Middleware`
  },
  
  // Individual files in the test directory root
  'root-files': {
    'project.json': `{
  "name": "multi-test-project",
  "version": "1.0.0",
  "description": "Test project for multiple files and directories",
  "main": "multi-test-dir-1/app.js",
  "scripts": {
    "start": "node multi-test-dir-1/app.js",
    "dev": "nodemon multi-test-dir-1/app.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "mongoose": "^6.0.0"
  }
}`,
    'config.env': `NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/testdb
JWT_SECRET=your-secret-key`
  }
};

// Test Setup
beforeAll(async () => {
  // Create test directories
  for (const dir of testDirs) {
    await mkdir(join(__dirname, dir), { recursive: true });
    
    // Create files in each directory
    for (const [filename, content] of Object.entries(testFiles[dir])) {
      await writeFile(join(__dirname, dir, filename), content);
    }
  }
  
  // Create root files
  for (const [filename, content] of Object.entries(testFiles['root-files'])) {
    await writeFile(join(__dirname, filename), content);
  }
  
  console.log('Test setup completed. Files created:');
  for (const dir of testDirs) {
    console.log(`  ${dir}/: ${Object.keys(testFiles[dir]).join(', ')}`);
  }
  console.log(`  Root: ${Object.keys(testFiles['root-files']).join(', ')}`);
});

// Test Cleanup
afterAll(async () => {
  try {
    // Clean up test directories
    for (const dir of testDirs) {
      await rm(join(__dirname, dir), { recursive: true, force: true });
    }
    
    // Clean up root files
    for (const filename of Object.keys(testFiles['root-files'])) {
      await rm(join(__dirname, filename), { force: true });
    }
    
    // Clean up additional test directories
    await rm(join(__dirname, 'multi-test-nested'), { recursive: true, force: true });
    await rm(join(__dirname, 'multi-test-overlap'), { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Test Suite
describe('Multiple File/Directory Feature', () => {

  it('should test with multiple directories', async () => {
    console.log('Test 1: Testing with multiple directories...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    const testPaths = testDirs.map(dir => join('test/unit', dir));
    
    const { finalContent: multiDirContent, stats: multiDirStats } = await generateContext({
      inputPaths: testPaths,
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    console.log(`✓ Multiple directories processed: ${multiDirStats.filesToInclude} files, ${multiDirStats.totalTokenCount} tokens`);
    
    // Verify files from all directories are included
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(multiDirContent).toContain(filename);
      }
    }
    
    console.log('✓ All files from multiple directories are included');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test with multiple directories and subdirectories', async () => {
    console.log('Test 2: Testing with multiple directories and subdirectories...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    // Create a nested directory structure
    const nestedDir = 'multi-test-nested';
    await mkdir(join(__dirname, nestedDir, 'subdir1', 'subdir2'), { recursive: true });
    await writeFile(join(__dirname, nestedDir, 'subdir1', 'nested1.js'), '// Nested file 1\nconsole.log("nested1");');
    await writeFile(join(__dirname, nestedDir, 'subdir1', 'subdir2', 'nested2.js'), '// Nested file 2\nconsole.log("nested2");');
    
    const nestedPaths = [
      ...testDirs.map(dir => join('test/unit', dir)),
      join('test/unit', nestedDir)
    ];
    
    const { finalContent: nestedContent, stats: nestedStats } = await generateContext({
      inputPaths: nestedPaths,
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    console.log(`✓ Nested directories processed: ${nestedStats.filesToInclude} files, ${nestedStats.totalTokenCount} tokens`);
    
    // Verify files from all directories are included
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(nestedContent).toContain(filename);
      }
    }
    
    // Verify nested files are included
    expect(nestedContent).toContain('nested1.js');
    expect(nestedContent).toContain('nested2.js');
    
    console.log('✓ All files from nested directories are included');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test with overlapping directories', async () => {
    console.log('Test 3: Testing with overlapping directories...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    // Create an overlapping directory structure
    const overlapDir = 'multi-test-overlap';
    await mkdir(join(__dirname, overlapDir), { recursive: true });
    await writeFile(join(__dirname, overlapDir, 'overlap.js'), '// Overlap file\nconsole.log("overlap");');
    
    const overlapPaths = [
      ...testDirs.map(dir => join('test/unit', dir)),
      join('test/unit', overlapDir)
    ];
    
    const { finalContent: overlapContent, stats: overlapStats } = await generateContext({
      inputPaths: overlapPaths,
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    console.log(`✓ Overlapping directories processed: ${overlapStats.filesToInclude} files, ${overlapStats.totalTokenCount} tokens`);
    
    // Verify files from all directories are included
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(overlapContent).toContain(filename);
      }
    }
    
    // Verify overlap file is included
    expect(overlapContent).toContain('overlap.js');
    
    console.log('✓ All files from overlapping directories are included');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test getFileStats with multiple paths', async () => {
    console.log('Test 4: Testing getFileStats with multiple paths...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    const testPaths = testDirs.map(dir => join('test/unit', dir));
    
    const { files: multiPathFiles, stats: multiPathStats } = await getFileStats({
      inputPaths: testPaths,
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });
    
    console.log(`✓ getFileStats returned ${multiPathFiles.length} file statistics from multiple paths`);
    
    // Verify files from all directories are in the stats
    const allExpectedFiles = [];
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        allExpectedFiles.push(filename);
      }
    }
    
    for (const expectedFile of allExpectedFiles) {
      expect(multiPathFiles.some(file => file.path.includes(expectedFile))).toBe(true);
    }
    
    console.log('✓ All files from multiple paths are in file statistics');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test CLI with multiple directories', async () => {
    console.log('Test 5: Testing CLI with multiple directories...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    const testPaths = testDirs.map(dir => join('test/unit', dir));
    
    const { stdout: multiDirStdout } = await execAsync(
      `node dist/cli.js ${testPaths.join(' ')}`,
      { cwd: join(__dirname, '../..') }
    );
    
    // Verify all files are in the CLI output
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(multiDirStdout).toContain(filename);
      }
    }
    
    console.log('✓ CLI processes multiple directories correctly');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test CLI with overlapping directories', async () => {
    console.log('Test 6: Testing CLI with overlapping directories...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    const overlapPaths = [
      ...testDirs.map(dir => join('test/unit', dir)),
      join('test/unit', 'multi-test-overlap')
    ];
    
    const { stdout: overlapStdout } = await execAsync(
      `node dist/cli.js ${overlapPaths.join(' ')}`,
      { cwd: join(__dirname, '../..') }
    );
    
    // Verify all files are in the CLI output
    expect(overlapStdout).toContain('overlap.js');
    
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(overlapStdout).toContain(filename);
      }
    }
    
    console.log('✓ CLI processes overlapping directories correctly');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test with --show-tokens flag and multiple paths', async () => {
    console.log('Test 7: Testing with --show-tokens flag and multiple paths...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    const testPaths = testDirs.map(dir => join('test/unit', dir));
    
    const { stdout: tokensStdout } = await execAsync(
      `node dist/cli.js ${testPaths.join(' ')} --show-tokens`,
      { cwd: join(__dirname, '../..') }
    );
    
    expect(tokensStdout).toContain('File Statistics');
    
    // Verify all files are in the statistics
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(tokensStdout).toContain(filename);
      }
    }
    
    console.log('✓ --show-tokens works with multiple paths');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test with other flags and multiple paths', async () => {
    console.log('Test 8: Testing with other flags and multiple paths...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    const testPaths = testDirs.map(dir => join('test/unit', dir));
    
    // Test with --keep-whitespace
    const { stdout: whitespaceStdout } = await execAsync(
      `node dist/cli.js ${testPaths.join(' ')} --keep-whitespace`,
      { cwd: join(__dirname, '../..') }
    );
    
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(whitespaceStdout).toContain(filename);
      }
    }
    
    // Test with --keep-comments
    const { stdout: commentsStdout } = await execAsync(
      `node dist/cli.js ${testPaths.join(' ')} --keep-comments`,
      { cwd: join(__dirname, '../..') }
    );
    
    for (const dir of testDirs) {
      for (const filename of Object.keys(testFiles[dir])) {
        expect(commentsStdout).toContain(filename);
      }
    }
    
    console.log('✓ Other flags work with multiple paths');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should test with ignore patterns and multiple paths', async () => {
    console.log('Test 9: Testing with ignore patterns and multiple paths...');
    
    // Change to project root directory for the test
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    const testPaths = testDirs.map(dir => join('test/unit', dir));
    
    const { stdout: ignoreStdout } = await execAsync(
      `node dist/cli.js ${testPaths.join(' ')} --ignore "*.json"`,
      { cwd: join(__dirname, '../..') }
    );
    
    // Verify JSON files are ignored
    expect(ignoreStdout).not.toContain('config.json');
    
    // Verify other files are still included
    expect(ignoreStdout).toContain('app.js');
    expect(ignoreStdout).toContain('server.js');
    expect(ignoreStdout).toContain('api.js');
    
    console.log('✓ Ignore patterns work with multiple paths');
    
    // Restore original working directory
    process.chdir(originalCwd);
  });

});