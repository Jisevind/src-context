
import { gatherFiles } from '../../src/core.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testDir = 'test/unit/path-normalization-test-dir';

describe('Path Normalization', () => {
  beforeAll(async () => {
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'test-file.js'), 'console.log("hello");');
    await writeFile(join(testDir, 'another-file.txt'), 'hello world');
    process.chdir(originalCwd);
  });

  afterAll(async () => {
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    await rm(testDir, { recursive: true, force: true });
    process.chdir(originalCwd);
  });

  it('should handle Windows-style paths', async () => {
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    const { filesToInclude } = await gatherFiles([testDir.replace(/\//g, '\\')]);
    expect(filesToInclude).toHaveLength(2);
    expect(filesToInclude.some(f => f.includes('test-file.js'))).toBe(true);
    process.chdir(originalCwd);
  });

  it('should handle mixed-separator paths', async () => {
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    const { filesToInclude } = await gatherFiles([testDir + '/test-file.js']);
    expect(filesToInclude).toHaveLength(1);
    expect(filesToInclude[0]).toContain('test-file.js');
    process.chdir(originalCwd);
  });
});
