import { describe, it, expect } from 'vitest';
import { readAndProcessTextFile } from '../../src/fileProcessors.js';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';

describe('URL Protection Feature', () => {
    const testFile = 'test_url_protection.dockerfile';
    const testPath = join(process.cwd(), testFile);

    it('should preserve URLs in Dockerfile CMD instructions', async () => {
        const content = 'CMD wget -q --spider http://localhost:3131/api/health || exit 1';
        await writeFile(testPath, content);

        try {
            const result = await readAndProcessTextFile(testPath, {
                removeWhitespace: false,
                stripFileComments: true,
            });

            // The result content will be wrapped in markdown code block
            expect(result.content).toContain('http://localhost:3131/api/health');
            // Ensure it's not truncated (simple check: if it contains the full URL, it's good)
            // The previous check failed because 'http://...' contains 'http:'

            // Let's verify strict equality of the line if possible, or just checks that the full URL is there
            const lines = result.content.split('\n');
            const cmdLine = lines.find(l => l.startsWith('CMD'));
            expect(cmdLine).toBeDefined();
            expect(cmdLine).toContain('http://localhost:3131/api/health');
            expect(cmdLine).not.toMatch(/http:\s*$/); // Should not end with http:
        } finally {
            await unlink(testPath);
        }
    });

    it('should preserve URLs in other contexts', async () => {
        const content = 'const url = "https://example.com/api/v1"; // This is a comment';
        const jsFile = 'test_url.js';
        const jsPath = join(process.cwd(), jsFile);

        await writeFile(jsPath, content);

        try {
            const result = await readAndProcessTextFile(jsPath, {
                removeWhitespace: false,
                stripFileComments: true,
            });

            expect(result.content).toContain('https://example.com/api/v1');
            // Comment should be stripped
            expect(result.content).not.toContain('This is a comment');
        } finally {
            await unlink(jsPath);
        }
    });
});
