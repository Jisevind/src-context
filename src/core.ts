/**
 * Core file processing logic for the src-context
 */

import { glob } from 'glob';
import { encode } from 'gpt-tokenizer';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { stat } from 'fs/promises';
import { isBinaryFile } from 'isbinaryfile';
import { open } from 'fs/promises';

// Import ignore with proper typing
import ignore from 'ignore';

// Import types
import { BuildStats } from './types.js';


/**
 * Gather files from input path with ignore pattern filtering
 * @param inputPath - The root directory to search for files
 * @param cliIgnorePatterns - Ignore patterns from CLI arguments
 * @param customIgnoreFileName - Name of custom ignore file (e.g., '.contextignore')
 * @param minifyFileName - Name of minify file (e.g., '.contextminify')
 * @returns Promise resolving to object with filesToInclude, filesToMinify arrays and stats
 */
export const defaultIgnores = [
  'node_modules/**',
  '.git/**',
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.env.local',
  '.env.*.local',
  'dist/**',
  'build/**',
  'coverage/**',
  '*.log',
  '*.tmp',
  '*.temp',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '*.swp',
  '*.swo',
  '*~',
  '.DS_Store/**',
  'Thumbs.db',
  'desktop.ini'
];

export async function gatherFiles(
  inputPaths: string[],
  cliIgnorePatterns: string[] = [],
  customIgnoreFileName: string = '.contextignore',
  minifyFileName: string = '.contextminify'
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

  const ig = ignore.default();
  const mg = ignore.default();

  // Create separate ignore instances for different precedence levels
  const defaultIg = ignore.default();
  const customIg = ignore.default();
  const cliIg = ignore.default();

  defaultIg.add(defaultIgnores);

  if (inputPaths.length === 0) {
    inputPaths.push('.');
  }

  // --- Ignore File Loading (from CWD) ---
  let customPatterns: string[] = [];
  try {
    const customIgnorePath = join(process.cwd(), customIgnoreFileName);
    const customIgnoreContent = await readFile(customIgnorePath, 'utf-8');
    customPatterns = customIgnoreContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    if (customPatterns.length > 0) {
      customIg.add(customPatterns);
    }
  } catch (error) {
    // No custom ignore file found, which is fine
  }

  try {
    const minifyPath = join(process.cwd(), minifyFileName);
    const minifyContent = await readFile(minifyPath, 'utf-8');
    const minifyPatterns = minifyContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    if (minifyPatterns.length > 0) {
      mg.add(minifyPatterns);
    }
  } catch (error) {
    // No minify file found, which is fine
  }

  if (cliIgnorePatterns.length > 0) {
    cliIg.add(cliIgnorePatterns);
  }

  // Build the combined ignore instance in order of precedence: CLI > Custom > Default
  // Add patterns in reverse order of precedence so CLI patterns (added last) have highest precedence
  ig.add(defaultIgnores);
  if (customPatterns.length > 0) {
    ig.add(customPatterns);
  }
  if (cliIgnorePatterns.length > 0) {
    ig.add(cliIgnorePatterns);
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
    if (mg.ignores(relativePathForIgnore)) {
      filesToMinify.push(file);
      continue; // File is minified, no need to check ignore rules
    }

    // Use the combined ignore instance which properly handles precedence and negation
    if (ig.ignores(relativePathForIgnore)) {
      // Determine which pattern type caused the ignore by checking individual instances
      // Check in order of precedence: CLI > Custom > Default
      if (cliIgnorePatterns.length > 0 && cliIg.ignores(relativePathForIgnore)) {
        ignoredByCli++;
      } else if (customPatterns.length > 0 && customIg.ignores(relativePathForIgnore)) {
        ignoredByCustom++;
      } else if (defaultIg.ignores(relativePathForIgnore)) {
        ignoredByDefault++;
      } else {
        // Fallback: if none of the individual instances match but the combined one does,
        // it might be due to complex interactions. Attribute to the highest precedence.
        if (cliIgnorePatterns.length > 0) {
          ignoredByCli++;
        } else if (customPatterns.length > 0) {
          ignoredByCustom++;
        } else {
          ignoredByDefault++;
        }
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
  if (content.startsWith('[Content of binary file:')) {
    return `# ${path}\n\n${content}`;
  }
  
  // Format as Markdown code block with language hint
  return `# ${path}\n\n\`\`\`${ext}\n${content}\n\`\`\``;
}


/**
 * Check if a file is whitespace-sensitive
 * @param path - The file path
 * @returns true if file is known to be whitespace-sensitive
 */
function isWhitespaceSensitive(path: string): boolean {
  const whitespaceSensitiveExtensions = [
    'py',   // Python
    'yaml', // YAML
    'yml',  // YAML
    'haml', // HAML
    'pug'   // Pug
  ];
  
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return whitespaceSensitiveExtensions.includes(ext);
}

/**
 * Remove extra whitespace from content
 * @param content - The file content
 * @returns Content with extra whitespace removed
 */
function removeExtraWhitespace(content: string): string {
  // Remove multiple newlines (keep max 2 consecutive newlines)
  content = content.replace(/\n{3,}/g, '\n\n');
  
  // Remove leading/trailing whitespace from each line
  content = content.split('\n').map(line => line.trimEnd()).join('\n');
  
  // Remove leading/trailing whitespace from the entire content
  return content.trim();
}

/**
 * Optimized binary file detection that only reads the first few KB
 * This is much faster than isBinaryFile for large files
 * @param filePath - Path to the file
 * @param sampleSize - Number of bytes to sample (default: 8192)
 * @returns Promise resolving to boolean indicating if file is binary
 */
async function isBinaryFileOptimized(filePath: string, sampleSize: number = 8192): Promise<boolean> {
  try {
    const fileHandle = await open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(sampleSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, sampleSize, 0);
      
      // Check if we read any data
      if (bytesRead === 0) {
        return false;
      }
      
      // Only check the bytes we actually read
      const sample = buffer.slice(0, bytesRead);
      
      // Simple heuristic: check for null bytes or high percentage of non-printable characters
      let nullBytes = 0;
      let nonPrintable = 0;
      
      for (let i = 0; i < sample.length; i++) {
        const byte = sample[i]!;
        if (byte === 0) {
          nullBytes++;
        } else if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          // Non-printable characters (excluding tab, LF, CR)
          nonPrintable++;
        }
      }
      
      // Consider binary if more than 10% null bytes or more than 30% non-printable characters
      const nullThreshold = sample.length * 0.1;
      const nonPrintableThreshold = sample.length * 0.3;
      
      return nullBytes > nullThreshold || nonPrintable > nonPrintableThreshold;
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    // If we can't read the file, assume it's not binary (let the main logic handle errors)
    return false;
  }
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
      let content: string;
      let tokenCount: number;
      
      // Check file size first - this is the critical optimization
      let fileSizeKB = 0;
      let shouldSkipDueToSize = false;
      try {
        const fileStats = await stat(filePath);
        fileSizeKB = fileStats.size / 1024;
        
        // Skip files larger than maxFileSizeKB (default to 1024 if not provided)
        const maxSizeKB = maxFileSizeKB ?? 1024;
        if (fileSizeKB > maxSizeKB) {
          stats.skippedLargeFiles = (stats.skippedLargeFiles || 0) + 1;
          console.warn(`Warning: Skipping large file ${filePath} (${fileSizeKB.toFixed(2)}KB > ${maxSizeKB}KB)`);
          shouldSkipDueToSize = true;
        }
      } catch (error) {
        // If we can't stat the file, continue with processing
      }
      
      // Check if file is binary or SVG
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const isSvg = ext === 'svg';
      
      // Use optimized binary detection for large files, regular detection for small files
      let isBinary = false;
      if (!shouldSkipDueToSize) {
        // For files larger than 100KB, use optimized detection that only reads first 8KB
        // For smaller files, use regular detection for better accuracy
        if (fileSizeKB > 100) {
          isBinary = await isBinaryFileOptimized(filePath);
        } else {
          isBinary = await isBinaryFile(filePath);
        }
      }

      if (shouldSkipDueToSize) {
        // Skip this file entirely - don't process it further
        continue;
      } else if (isBinary || isSvg) {
        stats.binaryAndSvgFiles = (stats.binaryAndSvgFiles || 0) + 1;
        // Use custom callback if provided, otherwise use default placeholder
        if (onBinaryFile) {
          content = onBinaryFile(filePath);
        } else {
          content = isSvg ? `[Content of SVG file: ${filePath}]` : `[Content of binary file: ${filePath}]`;
        }
        tokenCount = encode(content).length;
      } else {
        // For very large text files (>100KB), use a more efficient approach
        // Sample the first portion and add a note about the file size
        if (fileSizeKB > 100) {
          // Read only first 50KB for large text files to avoid tokenization bottleneck
          const sampleSize = 50 * 1024;
          const fileHandle = await open(filePath, 'r');
          try {
            const buffer = Buffer.alloc(sampleSize);
            const { bytesRead } = await fileHandle.read(buffer, 0, sampleSize, 0);
            const sampleContent = buffer.slice(0, bytesRead).toString('utf-8');
            
            // Create content with sample and size note
            content = `${sampleContent}\n\n[Note: Large file (${fileSizeKB.toFixed(1)}KB) - showing first ${(bytesRead/1024).toFixed(1)}KB]`;
            
            // Estimate token count based on sample (much faster than tokenizing full content)
            const sampleTokenCount = encode(sampleContent).length;
            tokenCount = Math.round(sampleTokenCount * (fileSizeKB / (bytesRead/1024)));
          } finally {
            await fileHandle.close();
          }
        } else {
          // Read file content for smaller files
          const fileContent = await readFile(filePath, 'utf-8');
          
          let processedContent = fileContent; // Start with original content

          // Strip comments if the flag is true (which will be the default)
          // but only for non-whitespace-sensitive files
          if (stripFileComments && !isWhitespaceSensitive(filePath)) {
            try {
              // Use dynamic import directly
              // @ts-ignore - strip-comments lacks TypeScript declarations
              const { default: strip } = await import('strip-comments');
              processedContent = strip(processedContent, {
                stripHtmlComments: true, // This option also strips HTML comments
                preserveNewlines: true  // Keep blank lines from removed block comments
              });
            } catch (stripError) {
              console.warn(`Warning: Could not load or run strip-comments on ${filePath}. Comments will be kept. Error: ${stripError instanceof Error ? stripError.message : String(stripError)}`);
              processedContent = fileContent; // Fallback to original content
            }
          }

          // Now, process whitespace on the (potentially) comment-stripped content
          if (removeWhitespace && !isWhitespaceSensitive(filePath)) {
            content = removeExtraWhitespace(processedContent); // Use processedContent here
          } else {
            content = processedContent; // Use processedContent here
          }
          
          // Count tokens based on the final content
          tokenCount = encode(content).length; // Use final 'content' variable
        }
      }
      
      // Format content
      const formattedContent = formatFileContent(filePath, content);
      
      results.push({
        path: filePath,
        content: formattedContent,
        tokenCount
      });
      
      // Update total token count and file size
      stats.totalTokenCount = (stats.totalTokenCount || 0) + tokenCount;
      stats.totalFileSizeKB = (stats.totalFileSizeKB || 0) + (content.length / 1024);
      
    } catch (error) {
      // Handle file reading errors gracefully
      console.warn(`Warning: Could not process file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      
      // Use placeholder for files that couldn't be read
      const errorContent = `[Error: Could not read file ${filePath}. ${error instanceof Error ? error.message : String(error)}]`;
      const tokenCount = encode(errorContent).length;
      const formattedContent = formatFileContent(filePath, errorContent);
      
      results.push({
        path: filePath,
        content: formattedContent,
        tokenCount
      });
      
      // Update total token count and file size
      stats.totalTokenCount = (stats.totalTokenCount || 0) + tokenCount;
      stats.totalFileSizeKB = (stats.totalFileSizeKB || 0) + (errorContent.length / 1024);
    }
  }
  
  // Process files to minify (create placeholders)
  for (const filePath of files.filesToMinify) {
    try {
      // Create placeholder string for minified content
      let placeholderContent: string;
      
      // Use custom callback if provided, otherwise use default placeholder
      if (onMinifyFile) {
        placeholderContent = onMinifyFile(filePath);
      } else {
        placeholderContent = `[Content for ${filePath} has been minified and excluded]`;
      }
      
      // Format the placeholder content
      const formattedPlaceholder = formatFileContent(filePath, placeholderContent);
      
      // Calculate token count for the placeholder
      const tokenCount = encode(formattedPlaceholder).length;
      
      // Add to results
      results.push({
        path: filePath,
        content: formattedPlaceholder,
        tokenCount
      });
      
      // Update total token count and file size
      stats.totalTokenCount = (stats.totalTokenCount || 0) + tokenCount;
      stats.totalFileSizeKB = (stats.totalFileSizeKB || 0) + (placeholderContent.length / 1024);
      
    } catch (error) {
      // Handle any errors gracefully
      console.warn(`Warning: Could not process minified file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      
      // Use error placeholder
      let errorContent: string;
      
      // Use custom callback if provided, otherwise use default placeholder
      if (onMinifyFile) {
        errorContent = onMinifyFile(filePath);
      } else {
        errorContent = `[Content for ${filePath} has been minified and excluded]`;
      }
      
      const tokenCount = encode(errorContent).length;
      const formattedContent = formatFileContent(filePath, errorContent);
      
      results.push({
        path: filePath,
        content: formattedContent,
        tokenCount
      });
      
      // Update total token count and file size
      stats.totalTokenCount = (stats.totalTokenCount || 0) + tokenCount;
      stats.totalFileSizeKB = (stats.totalFileSizeKB || 0) + (errorContent.length / 1024);
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