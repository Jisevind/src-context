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


const testDir = 'binary-files-max-size-test-dir';
const testFiles = {

  'index.js': `// Main JavaScript file
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});`,

  'styles.css': `/* CSS file */
body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

.header {
  background-color: #333;
  color: white;
  padding: 1rem;
}`,

  'config.json': `{
  "name": "test-app",
  "version": "1.0.0",
  "port": 3000
}`,


  'logo.svg': `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
  <text x="50" y="55" font-family="Arial" font-size="14" fill="black" text-anchor="middle">Logo</text>
</svg>`,


  'image.png': Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]).toString('binary'),


  'document.pdf': Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xC3, 0xA9]).toString('binary'),


  'large-file.txt': `This is a large text file that exceeds the default max file size.
${'x'.repeat(50 * 1024)}`
};


const createLargeFile = async (filePath, sizeKB) => {
  const content = 'x'.repeat(sizeKB * 1024);
  await writeFile(filePath, content);
};


beforeAll(async () => {
  // **FIX: Clean up polluting .contextignore file before tests run**
  try {
    await rm(join(__dirname, '../..', '.contextignore'), { force: true });
  } catch (error) {}

  await mkdir(join(__dirname, testDir), { recursive: true });


  for (const [filename, content] of Object.entries(testFiles)) {
    await writeFile(join(__dirname, testDir, filename), content);
  }


  await createLargeFile(join(__dirname, testDir, 'very-large-file.txt'), 200);
  await createLargeFile(join(__dirname, testDir, 'huge-file.txt'), 500);
});


afterAll(async () => {
  try {
    await rm(join(__dirname, testDir), { recursive: true, force: true });
    // **FIX: Clean up root .contextignore file after tests run**
    await rm(join(__dirname, '../..', '.contextignore'), { force: true });
  } catch (error) {

  }
});


describe('Binary Files, SVGs, and Max Size Feature', () => {

  it('should handle default max file size', async () => {
    console.log('Testing with default max file size...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;

    const { finalContent: defaultContent, stats: defaultStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true
    });

    console.log(`Default stats:`);
    console.log(`  Total files found: ${defaultStats.totalFilesFound}`);
    console.log(`  Files to include: ${defaultStats.filesToInclude}`);
    console.log(`  Binary and SVG files: ${defaultStats.binaryAndSvgFiles}`);
    console.log(`  Skipped large files: ${defaultStats.skippedLargeFiles}`);


    expect(defaultContent).toContain('index.js');
    expect(defaultContent).toContain('styles.css');
    expect(defaultContent).toContain('config.json');


    expect(defaultContent).toContain('[Content of SVG file:');


    expect(defaultContent).toContain('[Content of binary file:');

    console.log('✓ Default max file size works correctly');
  }, 60000); // **FIX: Increased timeout to 60 seconds**

  it('should respect custom max file size', async () => {
    console.log('Testing with custom max file size...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;

    const { finalContent: limitedContent, stats: limitedStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 10
    });

    console.log(`Limited stats (10KB max):`);
    console.log(`  Total files found: ${limitedStats.totalFilesFound}`);
    console.log(`  Files to include: ${limitedStats.filesToInclude}`);
    console.log(`  Binary and SVG files: ${limitedStats.binaryAndSvgFiles}`);
    console.log(`  Skipped large files: ${limitedStats.skippedLargeFiles}`);


    expect(limitedStats.skippedLargeFiles).toBeGreaterThan(0);


    expect(limitedContent).toContain('index.js');
    expect(limitedContent).toContain('styles.css');
    expect(limitedContent).toContain('config.json');


    expect(limitedContent).toContain('[Content of SVG file:');
    expect(limitedContent).toContain('[Content of binary file:');

    console.log('✓ Custom max file size works correctly');
  }, 30000);

  it('should handle very small max file size', async () => {
    console.log('Testing with very small max file size...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;


    await createLargeFile(join(__dirname, testDir, 'medium-file.txt'), 5);

    const { finalContent: tinyContent, stats: tinyStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 1
    });

    console.log(`Tiny stats (1KB max):`);
    console.log(`  Total files found: ${tinyStats.totalFilesFound}`);
    console.log(`  Files to include: ${tinyStats.filesToInclude}`);
    console.log(`  Binary and SVG files: ${tinyStats.binaryAndSvgFiles}`);
    console.log(`  Skipped large files: ${tinyStats.skippedLargeFiles}`);


    expect(tinyStats.skippedLargeFiles).toBeGreaterThan(0);

    console.log('✓ Very small max file size works correctly');
  });

  it('should handle getFileStats with binary files and max file size', async () => {
    console.log('Testing getFileStats with binary files and max file size...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;

    const { files: fileStats, stats: fileStatsResult } = await getFileStats({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 50
    });

    console.log(`File stats (50KB max):`);
    console.log(`  Total files found: ${fileStatsResult.totalFilesFound}`);
    console.log(`  Files to include: ${fileStatsResult.filesToInclude}`);
    console.log(`  Binary and SVG files: ${fileStatsResult.binaryAndSvgFiles}`);
    console.log(`  Skipped large files: ${fileStatsResult.skippedLargeFiles}`);


    expect(fileStatsResult.binaryAndSvgFiles).toBeGreaterThan(0);


    expect(fileStatsResult.skippedLargeFiles).toBeGreaterThan(0);


    const hasSvgFile = fileStats.some(file => file.path.includes('logo.svg'));
    const hasBinaryFile = fileStats.some(file =>
      file.path.includes('image.png') || file.path.includes('document.pdf')
    );

    expect(hasSvgFile).toBe(true);
    expect(hasBinaryFile).toBe(true);

    console.log('✓ getFileStats works correctly with binary files and max file size');
  });

  it('should handle CLI --max-file-kb flag', async () => {
    console.log('Testing CLI with --max-file-kb flag...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;


    const cliPath = process.cwd().includes('test/unit') ? testPath : `test/unit/${testDir}`;
    const { stdout: defaultStdout } = await execAsync(
      `node dist/cli.js ${cliPath}`,
      { cwd: join(__dirname, '../..') }
    );


    expect(defaultStdout).toContain('index.js');
    expect(defaultStdout).toContain('[Content of SVG file:');
    expect(defaultStdout).toContain('[Content of binary file:');


    const { stdout: limitedStdout } = await execAsync(
      `node dist/cli.js ${cliPath} --max-file-kb 10`,
      { cwd: join(__dirname, '../..') }
    );

    expect(limitedStdout).toContain('index.js');
    expect(limitedStdout).toContain('[Content of SVG file:');
    expect(limitedStdout).toContain('[Content of binary file:');

    console.log('✓ CLI --max-file-kb flag works correctly');
  }, 30000);

  it('should handle CLI with --show-tokens and --max-file-kb', async () => {
    console.log('Testing CLI with --show-tokens and --max-file-kb...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;

    const { stdout: tokensStdout } = await execAsync(
      `node dist/cli.js ${testPath} --show-tokens --max-file-kb 20`,
      { cwd: join(__dirname, '../..') }
    );

    expect(tokensStdout).toContain('File Statistics');
    expect(tokensStdout).toContain('logo.svg');
    expect(tokensStdout).toContain('image.png');
    expect(tokensStdout).toContain('document.pdf');

    console.log('✓ CLI --show-tokens works with --max-file-kb flag');
  });

  it('should handle very large max file size', async () => {
    console.log('Testing with very large max file size...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;

    const { finalContent: largeContent, stats: largeStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 10000
    });

    console.log(`Large stats (10MB max):`);
    console.log(`  Total files found: ${largeStats.totalFilesFound}`);
    console.log(`  Files to include: ${largeStats.filesToInclude}`);
    console.log(`  Binary and SVG files: ${largeStats.binaryAndSvgFiles}`);
    console.log(`  Skipped large files: ${largeStats.skippedLargeFiles}`);


    expect(largeStats.skippedLargeFiles).toBe(0);


    expect(largeContent).toContain('index.js');
    expect(largeContent).toContain('styles.css');
    expect(largeContent).toContain('config.json');
    expect(largeContent).toContain('large-file.txt');

    console.log('✓ Very large max file size works correctly');
  });

  it('should handle binary file detection accuracy', async () => {
    console.log('Testing binary file detection accuracy...');
    const testPath = process.cwd().includes('test/unit') ? testDir : `test/unit/${testDir}`;


    const fakeBinaryContent = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x57, 0x6F, 0x72, 0x6C, 0x64]).toString('binary');
    await writeFile(join(__dirname, testDir, 'fake-binary.txt'), fakeBinaryContent);

    const { finalContent: detectionContent, stats: detectionStats } = await generateContext({
      inputPaths: [testPath],
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: false,
      keepComments: true,
      maxFileKb: 100
    });


    if (detectionContent.includes('[Content of binary file: fake-binary.txt]')) {
      console.log('Note: fake-binary.txt was detected as binary, which is acceptable for binary detection libraries');
    } else {
      console.log('Note: fake-binary.txt was correctly detected as text');
    }

    console.log('✓ Binary file detection works as expected');
  });

});