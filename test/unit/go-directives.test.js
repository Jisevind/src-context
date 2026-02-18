/**
 * Unit tests for Go directive preservation
 * Tests that //go: directives effectively act like code rather than comments
 */

import { generateContext } from '../../dist/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testDir = 'go-directives-test-dir';
const testFiles = {
    'main.go': `package main

// This is a comment
//go:embed static
var static embed.FS

// Another comment
func main() {}`
};

// Test Setup
beforeAll(async () => {
    await mkdir(join(__dirname, testDir), { recursive: true });
    for (const [filename, content] of Object.entries(testFiles)) {
        await writeFile(join(__dirname, testDir, filename), content);
    }
});

// Test Cleanup
afterAll(async () => {
    try {
        await rm(join(__dirname, testDir), { recursive: true, force: true });
    } catch (error) {
        // Ignore cleanup errors
    }
});

describe('Go Directives Preservation', () => {

    it('should preserve //go: directives even when comments are stripped', async () => {
        console.log('Test: Verifying //go: directives are preserved...');
        const testPath = join('test/unit', testDir);

        // Process with default options (strip comments enabled)
        const { finalContent } = await generateContext({
            inputPaths: [testPath],
            cliIgnores: [],
            customIgnoreFile: '.contextignore',
            removeWhitespace: false, // Keep whitespace to check formatting
            keepComments: false      // Strip comments (default)
        });

        // Verify //go:embed is present
        expect(finalContent).toContain('//go:embed static');

        // Verify normal comments are stripped
        expect(finalContent).not.toContain('// This is a comment');
        expect(finalContent).not.toContain('// Another comment');

        console.log('✓ //go:embed directive was preserved while other comments were stripped');
    });

    it('should preserve //go: directives when whitespace is removed too', async () => {
        console.log('Test: Verifying //go: directives with whitespace removal...');
        const testPath = join('test/unit', testDir);

        // Process with whitespace removal enabled too
        const { finalContent } = await generateContext({
            inputPaths: [testPath],
            cliIgnores: [],
            customIgnoreFile: '.contextignore',
            removeWhitespace: true,  // Remove whitespace
            keepComments: false      // Strip comments
        });

        // Verify //go:embed is present
        expect(finalContent).toContain('//go:embed static');

        console.log('✓ //go:embed directive preserved with whitespace removal');
    });

});
