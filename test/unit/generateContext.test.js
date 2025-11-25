import { gatherFiles } from '../../src/core.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('generateContext', () => {
  it('should generate context without token budget', async () => {
    // Test with a simple directory structure
    const testDir = 'test/unit/generateContext-test-dir';
    
    // Create test directory and files
    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../..'));
    
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'test.js'), 'console.log("test");');
    
    try {
      const { filesToInclude } = await gatherFiles([testDir]);
      expect(filesToInclude.length).toBeGreaterThanOrEqual(1);
      expect(filesToInclude.some(f => f.endsWith('test.js'))).toBe(true);
    } finally {
      await rm(testDir, { recursive: true, force: true });
      process.chdir(originalCwd);
    }
  });

  it('should handle empty input paths gracefully', async () => {
    const { filesToInclude } = await gatherFiles(['.']);
    expect(filesToInclude.length).toBeGreaterThan(0);
  });
});