/**
 * Core file processing logic for the src-context
 */

import { glob } from 'glob';
import { join } from 'path';
import { stat } from 'fs/promises';

// Import ignore with proper typing
import ignore from 'ignore';

// Import types
import { BuildStats } from './types.js';
import { loadPatternsFromFile } from './utils.js';
import { defaultIgnores } from './defaultIgnores.js';

// Import helper functions from fileProcessors
import {
  getFileStats,
  isBinaryOrSvgFile,
  handleBinaryOrSvgFile,
  readAndProcessTextFile,
  processMinifiedFile,
  updateStats,
  handleFileError
} from './fileProcessors.js';

/**
 * Gather files from input path with ignore pattern filtering
 * @param inputPath - The root directory to search for files
 * @param cliIgnorePatterns - Ignore patterns from CLI arguments
 * @param customIgnoreFileName - Name of custom ignore file (e.g., '.contextignore')
 * @param minifyFileName - Name of minify file (e.g., '.contextminify')
 * @param noDefaultIgnores - Whether to disable default ignore patterns
 * @returns Promise resolving to object with filesToInclude, filesToMinify arrays and stats
 */
export async function gatherFiles(
  inputPaths: string[],
  cliIgnorePatterns: string[] = [],
  customIgnoreFileName: string = '.contextignore',
  minifyFileName: string = '.contextminify',
  noDefaultIgnores: boolean = false
): Promise<{ filesToInclude: string[], filesToMinify: string[], stats: Partial<BuildStats> }> {

  const stats: Partial<BuildStats> = {
    totalFilesFound: 0,
    filesToInclude: 0,
    filesToMinify: 0,
    filesIgnored: 0,
    filesIgnoredByDefault: 0,
    filesIgnoredByCustom: 0,
    filesIgnoredByCli: 0,
    binaryAndSvgFiles: 0,
    skippedLargeFiles: 0,
    totalTokenCount: 0,
    totalFileSizeKB: 0,
    topTokenConsumers: []
  };

  const combinedIgnore = ignore.default();
  const minifyIgnore = ignore.default();

  // Create separate ignore instances for different precedence levels
  const defaultIgnore = ignore.default();
  const customIgnore = ignore.default();
  const cliIgnore = ignore.default();

  if (!noDefaultIgnores) {
    defaultIgnore.add(defaultIgnores);
  }

  if (inputPaths.length === 0) {
    inputPaths.push('.');
  }

  // --- Ignore File Loading (from CWD) ---
  const customIgnorePath = join(process.cwd(), customIgnoreFileName);
  const customPatterns = await loadPatternsFromFile(customIgnorePath);
  if (customPatterns.length > 0) {
    customIgnore.add(customPatterns);
  }

  const minifyPath = join(process.cwd(), minifyFileName);
  const minifyPatterns = await loadPatternsFromFile(minifyPath);
  if (minifyPatterns.length > 0) {
    minifyIgnore.add(minifyPatterns);
  }

  if (cliIgnorePatterns.length > 0) {
    cliIgnore.add(cliIgnorePatterns);
  }

  // Build the combined ignore instance in order of precedence: CLI > Custom > Default
  // Add patterns in reverse order of precedence so CLI patterns (added last) have highest precedence
  if (!noDefaultIgnores) {
    combinedIgnore.add(defaultIgnores);
  }
  if (customPatterns.length > 0) {
    combinedIgnore.add(customPatterns);
  }
  if (cliIgnorePatterns.length > 0) {
    combinedIgnore.add(cliIgnorePatterns);
  }

  // --- File/Directory Processing ---
  const allFilesSet = new Set<string>();
  const cwd = process.cwd();

  for (const inputPath of inputPaths) {
    try {
      const absolutePath = join(cwd, inputPath);
      const pathStats = await stat(absolutePath);

      if (pathStats.isDirectory()) {
        const files = await glob('**/*', {
          cwd: absolutePath,
          dot: true,
          nodir: true,
          absolute: false, // Get relative paths from the directory
        });
        // Add files relative to the input path
        files.forEach(file => allFilesSet.add(join(inputPath, file)));
      } else if (pathStats.isFile()) {
        // Add the file path as-is (it should already be relative to CWD or absolute)
        allFilesSet.add(inputPath);
      }
    } catch (error) {
      console.warn(`Warning: Could not process path ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const allFiles = Array.from(allFilesSet);
  stats.totalFilesFound = allFiles.length;

  // --- Filtering Logic (using paths relative to CWD) ---
  const filesNotIgnored: string[] = [];
  const filesToMinify: string[] = [];

  // Track ignore counts
  let ignoredByDefault = 0;
  let ignoredByCustom = 0;
  let ignoredByCli = 0;

  for (const file of allFiles) {
    // SAFETY CHECK: Always filter out .git files regardless of ignore patterns
    const normalizedFilePath = file.replace(/\\/g, '/');
    if (normalizedFilePath.includes('.git/') || normalizedFilePath.endsWith('.git')) {
      ignoredByDefault++; // Count as ignored by default
      continue;
    }

    // Extract the relative path from the input path for ignore matching
    let relativePathForIgnore = file;
    for (const inputPath of inputPaths) {
      if (file.startsWith(inputPath)) {
        relativePathForIgnore = file.slice(inputPath.length).replace(/^[\/\\]/, '');
        break;
      }
    }
    
    // Ensure we don't pass empty paths to the ignore library
    if (!relativePathForIgnore) {
      relativePathForIgnore = file;
    }
    
    // Normalize path to use POSIX-style forward slashes for ignore library
    relativePathForIgnore = relativePathForIgnore.replace(/\\/g, '/');

    // Check minification first - minification rules take precedence over ignore rules
    if (minifyIgnore.ignores(relativePathForIgnore)) {
      filesToMinify.push(file);
      continue; // File is minified, no need to check ignore rules
    }

    // Use the combined ignore instance which properly handles precedence and negation
    if (combinedIgnore.ignores(relativePathForIgnore)) {
      // Determine which pattern type caused the ignore by checking individual instances
      // Check in order of precedence: CLI > Custom > Default
      let ignoredByType = 'default';
      
      if (cliIgnorePatterns.length > 0 && cliIgnore.ignores(relativePathForIgnore)) {
        ignoredByType = 'cli';
      } else if (customPatterns.length > 0 && customIgnore.ignores(relativePathForIgnore)) {
        ignoredByType = 'custom';
      } else if (defaultIgnore.ignores(relativePathForIgnore)) {
        ignoredByType = 'default';
      }
      
      // Increment the appropriate counter
      if (ignoredByType === 'cli') {
        ignoredByCli++;
      } else if (ignoredByType === 'custom') {
        ignoredByCustom++;
      } else {
        ignoredByDefault++;
      }
      continue;
    }

    // File is not minified and not ignored, include it normally
    filesNotIgnored.push(file);
  }

  // Update stats
  stats.filesIgnoredByDefault = ignoredByDefault;
  stats.filesIgnoredByCustom = ignoredByCustom;
  stats.filesIgnoredByCli = ignoredByCli;
  stats.filesIgnored = ignoredByDefault + ignoredByCustom + ignoredByCli;
  stats.filesToInclude = filesNotIgnored.length;
  stats.filesToMinify = filesToMinify.length;

  return { filesToInclude: filesNotIgnored, filesToMinify, stats };
}

/**
 * Helper function to format file content in Markdown
 * @param path - The file path
 * @param content - The file content
 * @returns Formatted Markdown string
 */
export function formatFileContent(path: string, content: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  
  // If content is a placeholder for binary/SVG files
  if (content.startsWith('[Content of binary file:') || content.startsWith('[Content of SVG file:')) {
    return `# ${path}\n\n${content}`;
  }
  
  // Format as Markdown code block with language hint
  return `# ${path}\n\n\`\`\`${ext}\n${content}\n\`\`\``;
}

/**
 * Process files and prepare their content for LLM
 * @param files - Object containing filesToInclude and filesToMinify arrays
 * @param removeWhitespace - Whether to remove extra whitespace from non-whitespace-sensitive files
 * @param onBinaryFile - Optional callback for binary file content
 * @param onMinifyFile - Optional callback for minified file content
 * @param inputStats - Stats from gatherFiles function
 * @param maxFileSizeKB - Maximum file size in KB to process (default: 1024KB)
 * @param stripFileComments - Whether to strip comments from files
 * @returns Promise resolving to object with processed files and merged stats
 */
export async function processFiles(
  files: { filesToInclude: string[], filesToMinify: string[] },
  removeWhitespace: boolean,
  onBinaryFile?: (path: string) => string,
  onMinifyFile?: (path: string) => string,
  inputStats?: Partial<BuildStats>,
  maxFileSizeKB?: number,
  stripFileComments: boolean = true
): Promise<{ processedFiles: Array<{ path: string, content: string, tokenCount: number }>, stats: Partial<BuildStats> }> {
  const results: Array<{ path: string, content: string, tokenCount: number }> = [];
  
  // Initialize stats with input stats or create new ones
  const stats: Partial<BuildStats> = inputStats ? { ...inputStats } : {
    totalFilesFound: 0,
    filesToInclude: 0,
    filesToMinify: 0,
    filesIgnored: 0,
    filesIgnoredByDefault: 0,
    filesIgnoredByCustom: 0,
    filesIgnoredByCli: 0,
    binaryAndSvgFiles: 0,
    skippedLargeFiles: 0,
    totalTokenCount: 0,
    totalFileSizeKB: 0,
    topTokenConsumers: []
  };
  
  // Process files to include (normal processing)
  for (const filePath of files.filesToInclude) {
    try {
      const fileStats = await getFileStats(filePath, maxFileSizeKB);
      
      if (fileStats.shouldSkip) {
        stats.skippedLargeFiles = (stats.skippedLargeFiles || 0) + 1;
        continue;
      }
      
      const { isBinary, isSvg } = await isBinaryOrSvgFile(filePath, fileStats.sizeKB);
      
      let result;
      if (isBinary || isSvg) {
        result = await handleBinaryOrSvgFile(filePath, isSvg, onBinaryFile);
        updateStats(stats, result, true);
      } else {
        result = await readAndProcessTextFile(filePath, {
          removeWhitespace,
          stripFileComments,
          maxFileSizeKB
        });
        updateStats(stats, result, false);
      }
      
      results.push(result);
    } catch (error) {
      const errorResult = await handleFileError(filePath, error);
      results.push(errorResult);
      updateStats(stats, errorResult, false);
    }
  }
  
  // Process files to minify (create placeholders)
  for (const filePath of files.filesToMinify) {
    try {
      const result = await processMinifiedFile(filePath, onMinifyFile);
      results.push(result);
      updateStats(stats, result, false);
    } catch (error) {
      const errorResult = await handleFileError(filePath, error);
      results.push(errorResult);
      updateStats(stats, errorResult, false);
    }
  }
  
  // Find top 3 token consumers
  const sortedResults = results.sort((a, b) => b.tokenCount - a.tokenCount);
  stats.topTokenConsumers = sortedResults.slice(0, 3).map(result => ({
    path: result.path,
    tokenCount: result.tokenCount
  }));
  
  return { processedFiles: results, stats };
}