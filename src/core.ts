/**
 * Core file processing logic for the src-context
 */

import { glob } from 'glob';
import { encode } from 'gpt-tokenizer';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { stat } from 'fs/promises';
import { isBinaryFile } from 'isbinaryfile';

// Import ignore with proper typing
import ignore from 'ignore';

// Dynamic import for strip-comments since it might be CommonJS and lacks TypeScript types
let stripComments: any;

// Initialize strip-comments asynchronously
async function initializeStripComments() {
  if (!stripComments) {
    try {
      // @ts-ignore - strip-comments lacks TypeScript declarations
      const module = await import('strip-comments');
      stripComments = module.default || module;
    } catch (error) {
      console.warn('Warning: Could not load strip-comments module');
      stripComments = null;
    }
  }
  return stripComments;
}

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

  ig.add(defaultIgnores);

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
      ig.add(customPatterns);
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

  const defaultIg = ignore.default().add(defaultIgnores);
  const customIg = ignore.default().add(customPatterns);
  const cliIg = ignore.default().add(cliIgnorePatterns);

  for (const file of allFiles) {
    const relativePath = file; // Already relative to CWD

    if (ig.ignores(relativePath)) {
      // Check which rule ignored it (for stats)
      if (defaultIg.ignores(relativePath)) {
        ignoredByDefault++;
      } else if (customIg.ignores(relativePath)) {
        ignoredByCustom++;
      } else if (cliIg.ignores(relativePath)) {
        ignoredByCli++;
      }
      continue; // Skip this file
    }

    if (mg.ignores(relativePath)) {
      filesToMinify.push(file);
    } else {
      filesNotIgnored.push(file);
    }
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
 * Process files and prepare their content for LLM
 * @param files - Object containing filesToInclude and filesToMinify arrays
 * @param removeWhitespace - Whether to remove extra whitespace from non-whitespace-sensitive files
 * @param onBinaryFile - Optional callback for binary file content
 * @param onMinifyFile - Optional callback for minified file content
 * @param inputStats - Stats from gatherFiles function
 * @param maxFileSizeKB - Maximum file size in KB to process (default: 1024KB)
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
      
      // Check file size first
      let fileSizeKB = 0;
      try {
        const fileStats = await stat(filePath);
        fileSizeKB = fileStats.size / 1024;
        
        // Skip files larger than maxFileSizeKB (default to 1024 if not provided)
        const maxSizeKB = maxFileSizeKB ?? 1024;
        if (fileSizeKB > maxSizeKB) {
          stats.skippedLargeFiles = (stats.skippedLargeFiles || 0) + 1;
          console.warn(`Warning: Skipping large file ${filePath} (${fileSizeKB.toFixed(2)}KB > ${maxSizeKB}KB)`);
          continue;
        }
      } catch (error) {
        // If we can't stat the file, continue with processing
      }
      
      // Check if file is binary or SVG
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const isSvg = ext === 'svg';
      const isBinary = await isBinaryFile(filePath);

      if (isBinary || isSvg) {
        stats.binaryAndSvgFiles = (stats.binaryAndSvgFiles || 0) + 1;
        // Use custom callback if provided, otherwise use default placeholder
        if (onBinaryFile) {
          content = onBinaryFile(filePath);
        } else {
          content = isSvg ? `[Content of SVG file: ${filePath}]` : `[Content of binary file: ${filePath}]`;
        }
        tokenCount = encode(content).length;
      } else {
        // Read file content
        const fileContent = await readFile(filePath, 'utf-8');
        
        let processedContent = fileContent; // Start with original content

        // Strip comments if the flag is true (which will be the default)
        // but only for non-whitespace-sensitive files
        if (stripFileComments && !isWhitespaceSensitive(filePath)) {
          try {
            // Initialize strip-comments module
            const stripCommentsModule = await initializeStripComments();
            if (stripCommentsModule) {
              // strip-comments might throw errors on certain syntaxes
              // Include options to strip HTML comments as well
              processedContent = stripCommentsModule(processedContent, {
                stripHtmlComments: true,
                preserveNewlines: true
              });
            } else {
              // If module couldn't be loaded, keep original content
              processedContent = fileContent;
            }
          } catch (stripError) {
            console.warn(`Warning: Could not strip comments from ${filePath}: ${stripError instanceof Error ? stripError.message : String(stripError)}`);
            // Keep original content if stripping fails
            processedContent = fileContent;
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