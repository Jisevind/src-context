import { gatherFiles } from '../../src/core.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testDirRelative = 'test/unit/path-normalization-test-dir';

describe('Path Normalization', () => {
  beforeAll(async () => {
    // create test dir relative to project root
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));

    await mkdir(testDirRelative, { recursive: true });
    await writeFile(join(testDirRelative, 'test-file.js'), 'console.log("hello");');
    await writeFile(join(testDirRelative, 'another-file.txt'), 'hello world');

    process.chdir(originalCwd);
  });

  afterAll(async () => {
    // remove test dir (keep everything deterministic)
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    await rm(testDirRelative, { recursive: true, force: true });
    process.chdir(originalCwd);
  });

  it('should handle Windows-style paths', async () => {
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));

    // simulate a Windows-style input (backslashes) and normalize it to the current platform separator
    const windowsStyle = testDirRelative.replace(/\//g, '\\');
    const normalized = windowsStyle.split(/\\+/).join(path.sep);

    const { filesToInclude } = await gatherFiles([normalized]);

    // Expect both files present
    expect(filesToInclude.length).toBeGreaterThanOrEqual(2);
    expect(filesToInclude.some(f => f.endsWith(`test-file.js`))).toBe(true);
    expect(filesToInclude.some(f => f.endsWith(`another-file.txt`))).toBe(true);

    process.chdir(originalCwd);
  });

  it('should handle mixed-separator paths', async () => {
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));

    const mixed = `${testDirRelative.replace(/\\/g, '/')}/test-file.js`;
    const { filesToInclude } = await gatherFiles([mixed]);

    expect(filesToInclude).toHaveLength(1);
    expect(filesToInclude[0]).toContain('test-file.js');

    process.chdir(originalCwd);
  });
});
