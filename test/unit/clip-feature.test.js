import { generateContext } from '../../dist/index.js';
import clipboardy from 'clipboardy';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testDir = 'clip-test-dir';
const testFiles = {
  'file1.js': `// Test file 1
function hello() {
  console.log('Hello from file 1');
  return 'file1-content';
}`,
  'file2.js': `// Test file 2
function world() {
  console.log('Hello from file 2');
  return 'file2-content';
}`
};

// --- Test Setup ---
beforeAll(async () => {
  await mkdir(join(__dirname, testDir), { recursive: true });
  for (const [filename, content] of Object.entries(testFiles)) {
    await writeFile(join(__dirname, testDir, filename), content);
  }
});

// --- Test Cleanup ---
afterAll(async () => {
  try {
    await rm(join(__dirname, testDir), { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// --- Test Suite ---
describe('--clip feature functionality', () => {

  it('should verify clipboard functionality with generateContext', async () => {
    console.log('Testing clipboard functionality with generateContext...');
    const testPath = join('test/unit', testDir);
    const { finalContent: context } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });

    await clipboardy.write(context);
    const clipboardContent = await clipboardy.read();

    expect(clipboardContent).toBe(context);
    console.log('✓ Clipboard write/read functionality works correctly');
  });

  it('should verify CLI --clip flag', async () => {
    console.log('Testing CLI --clip flag...');
    const testPath = join('test/unit', testDir);
    
    const { stdout, stderr } = await execAsync(
      `node dist/cli.js ${testPath} --clip`,
      { cwd: join(__dirname, '../..') }
    );

    expect(stdout).toContain('Context copied to clipboard!');
    
    const cliClipboardContent = await clipboardy.read();
    expect(cliClipboardContent).toContain('file1.js');
    expect(cliClipboardContent).toContain('file2.js');
    
    console.log('✓ CLI --clip flag works correctly');
  });

  it('should confirm --clip takes precedence over --output', async () => {
    console.log('Testing --clip with --output (clipboard should take precedence)...');
    const testPath = join('test/unit', testDir);

    const { stdout } = await execAsync(
      `node dist/cli.js ${testPath} --clip --output test-output.txt`,
      { cwd: join(__dirname, '../..') }
    );

    expect(stdout).toContain('Context copied to clipboard!');
    console.log('✓ --clip takes precedence over --output as expected');
  });

});