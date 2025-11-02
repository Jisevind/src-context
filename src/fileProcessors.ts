/**
 * Helper functions for file processing
 * Extracted from the monolithic processFiles function for better maintainability
 */

import { encode } from 'gpt-tokenizer';
import { readFile } from 'fs/promises';
import { stat } from 'fs/promises';
import { isBinaryFile } from 'isbinaryfile';
import { open } from 'fs/promises';
import { BuildStats } from './types.js';
import { basename } from 'path';

// Constants for binary file detection
const DEFAULT_SAMPLE_SIZE = 8192;
const NULL_BYTE_THRESHOLD_RATIO = 0.1;
const NON_PRINTABLE_THRESHOLD_RATIO = 0.3;

// Types
export interface FileStats {
  sizeKB: number;
  shouldSkip: boolean;
}

export interface ProcessedFileResult {
  path: string;
  content: string;
  tokenCount: number;
}

export interface FileProcessingOptions {
  removeWhitespace: boolean;
  stripFileComments: boolean;
  maxFileSizeKB?: number | undefined;
}

/**
 * Get file statistics and determine if it should be skipped based on size
 * @param filePath - Path to the file
 * @param maxFileSizeKB - Maximum file size in KB (default: 1024)
 * @returns Promise resolving to file stats with skip decision
 */
export async function getFileStats(filePath: string, maxFileSizeKB?: number): Promise<FileStats> {
  let fileSizeKB = 0;
  let shouldSkipDueToSize = false;
  
  try {
    const fileStats = await stat(filePath);
    fileSizeKB = fileStats.size / 1024;
    
    // Skip files larger than maxFileSizeKB (default to 1024 if not provided)
    const maxSizeKB = maxFileSizeKB ?? 1024;
    if (fileSizeKB > maxSizeKB) {
      console.warn(`Warning: Skipping large file ${filePath} (${fileSizeKB.toFixed(2)}KB > ${maxSizeKB}KB)`);
      shouldSkipDueToSize = true;
    }
  } catch (error) {
    // If we can't stat the file, continue with processing (don't skip)
  }
  
  return {
    sizeKB: fileSizeKB,
    shouldSkip: shouldSkipDueToSize
  };
}

/**
 * Check if a file is binary or SVG
 * @param filePath - Path to the file
 * @param fileSizeKB - File size in KB
 * @returns Promise resolving to object with binary and SVG flags
 */
export async function isBinaryOrSvgFile(filePath: string, fileSizeKB: number): Promise<{ isBinary: boolean; isSvg: boolean }> {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const isSvg = ext === 'svg';
  
  // Use optimized binary detection for large files, regular detection for small files
  let isBinary = false;
  if (fileSizeKB > 100) {
    // For files larger than 100KB, use optimized detection that only reads first 8KB
    isBinary = await isBinaryFileOptimized(filePath);
  } else {
    // For smaller files, use regular detection for better accuracy
    isBinary = await isBinaryFile(filePath);
  }
  
  return { isBinary, isSvg };
}

/**
 * Optimized binary file detection that only reads the first few KB
 * This is much faster than isBinaryFile for large files
 * @param filePath - Path to the file
 * @param sampleSize - Number of bytes to sample (default: DEFAULT_SAMPLE_SIZE)
 * @returns Promise resolving to boolean indicating if file is binary
 */
async function isBinaryFileOptimized(filePath: string, sampleSize: number = DEFAULT_SAMPLE_SIZE): Promise<boolean> {
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
      const nullThreshold = sample.length * NULL_BYTE_THRESHOLD_RATIO;
      const nonPrintableThreshold = sample.length * NON_PRINTABLE_THRESHOLD_RATIO;
      
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
 * Handle binary or SVG files by generating appropriate placeholders
 * @param filePath - Path to the file
 * @param isSvg - Whether the file is an SVG
 * @param onBinaryFile - Optional callback for binary file content
 * @returns Promise resolving to processed file result
 */
export async function handleBinaryOrSvgFile(
  filePath: string, 
  isSvg: boolean, 
  onBinaryFile?: (path: string) => string
): Promise<ProcessedFileResult> {
  // Use custom callback if provided, otherwise use default placeholder
  let content: string;
  if (onBinaryFile) {
    content = onBinaryFile(filePath);
  } else {
    content = isSvg ? `[Content of SVG file: ${filePath}]` : `[Content of binary file: ${filePath}]`;
  }
  
  const tokenCount = encode(content).length;
  const formattedContent = formatFileContent(filePath, content);
  
  return {
    path: filePath,
    content: formattedContent,
    tokenCount
  };
}

/**
 * Check if a file path is a Python file
 * @param filePath - Path to the file
 * @returns true if the file is a Python file
 */
function isPythonFilePath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return ext === 'py';
}

/**
 * Specialized processing for Python files
 * Strips single-line # comments while preserving docstrings and original indentation
 * @param content - The Python file content
 * @returns Content with single-line comments removed, but docstrings and indentation preserved
 */
function processPythonContent(content: string): string {
  const lines = content.split('\n');
  const processedLines: string[] = [];
  let inTripleQuotes = false;
  let tripleQuoteType: '"""' | "'''" | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedLine = line.trim();
    
    // Track triple-quoted strings (docstrings)
    if (!inTripleQuotes) {
      // Check for start of triple-quoted string
      if (trimmedLine.includes('"""')) {
        // Handle cases where both start and end are on same line
        const firstTripleQuote = trimmedLine.indexOf('"""');
        const secondTripleQuote = trimmedLine.indexOf('"""', firstTripleQuote + 3);
        
        if (secondTripleQuote !== -1 && firstTripleQuote !== secondTripleQuote) {
          // Both start and end on same line, keep entire line
          processedLines.push(line);
          continue;
        } else {
          // Start of multi-line docstring
          inTripleQuotes = true;
          tripleQuoteType = '"""';
          processedLines.push(line);
          continue;
        }
      } else if (trimmedLine.includes("'''")) {
        // Handle cases where both start and end are on same line
        const firstTripleQuote = trimmedLine.indexOf("'''");
        const secondTripleQuote = trimmedLine.indexOf("'''", firstTripleQuote + 3);
        
        if (secondTripleQuote !== -1 && firstTripleQuote !== secondTripleQuote) {
          // Both start and end on same line, keep entire line
          processedLines.push(line);
          continue;
        } else {
          // Start of multi-line docstring
          inTripleQuotes = true;
          tripleQuoteType = "'''";
          processedLines.push(line);
          continue;
        }
      }
    } else {
      // We're inside a triple-quoted string
      if (tripleQuoteType && trimmedLine.includes(tripleQuoteType)) {
        // End of triple-quoted string
        inTripleQuotes = false;
        tripleQuoteType = null;
      }
      processedLines.push(line);
      continue;
    }
    
    // Process non-string lines (strip single-line comments)
    if (!inTripleQuotes) {
      // Remove single-line comments that are not inside strings
      // Look for # that is not inside quotes
      let commentIndex = -1;
      let inSingleQuotes = false;
      let inDoubleQuotes = false;
      let escaped = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j]!;
        
        if (escaped) {
          escaped = false;
          continue;
        }
        
        if (char === '\\') {
          escaped = true;
          continue;
        }
        
        if (char === '"' && !inSingleQuotes) {
          inDoubleQuotes = !inDoubleQuotes;
          continue;
        }
        
        if (char === "'" && !inDoubleQuotes) {
          inSingleQuotes = !inSingleQuotes;
          continue;
        }
        
        if (char === '#' && !inSingleQuotes && !inDoubleQuotes) {
          commentIndex = j;
          break;
        }
      }
      
      if (commentIndex !== -1) {
        // Remove everything from # onwards, but preserve the line for indentation
        const beforeComment = line.substring(0, commentIndex);
        processedLines.push(beforeComment.trimEnd());
      } else {
        // No comment found, keep the line as-is
        processedLines.push(line);
      }
    }
  }
  
  return processedLines.join('\n');
}

/**
 * Read and process a text file (strip comments, remove whitespace, truncate if necessary)
 * @param filePath - Path to the file
 * @param options - Processing options
 * @returns Promise resolving to processed file result
 */
export async function readAndProcessTextFile(
  filePath: string, 
  options: FileProcessingOptions
): Promise<ProcessedFileResult> {
  const { removeWhitespace, stripFileComments, maxFileSizeKB } = options;
  
  // Get file stats to determine processing approach
  const { sizeKB: fileSizeKB } = await getFileStats(filePath, maxFileSizeKB);
  
  let content: string;
  
  // For very large text files (>100KB), use a more efficient approach
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
      const tokenCount = Math.round(sampleTokenCount * (fileSizeKB / (bytesRead/1024)));
      
      const formattedContent = formatFileContent(filePath, content);
      
      return {
        path: filePath,
        content: formattedContent,
        tokenCount
      };
    } finally {
      await fileHandle.close();
    }
  } else {
    // Read file content for smaller files
    const fileContent = await readFile(filePath, 'utf-8');
    
    let processedContent = fileContent; // Start with original content

    // Check if this is a Python file for specialized processing
    const isPythonFile = isPythonFilePath(filePath);
    
    // Strip comments if the flag is true (which will be the default)
    // but only for non-whitespace-sensitive files
    if (stripFileComments && !isWhitespaceSensitive(filePath)) {
      if (isPythonFile) {
        // Use specialized Python processing
        processedContent = processPythonContent(processedContent);
      } else {
        // Use generic comment stripping for non-Python files
        try {
          // Use dynamic import directly
          // @ts-ignore - strip-comments lacks TypeScript declarations
          const { default: strip } = await import('strip-comments');
          processedContent = strip(processedContent, {
            stripHtmlComments: true, // This option also strips HTML comments
            preserveNewlines: true,  // Keep blank lines from removed block comments
            safe: true               // Preserve "protected" comments (/*! ... */ and //! ...)
          });
        } catch (stripError) {
          console.warn(`Warning: Could not load or run strip-comments on ${filePath}. Comments will be kept. Error: ${stripError instanceof Error ? stripError.message : String(stripError)}`);
          processedContent = fileContent; // Fallback to original content
        }
      }
    }

    // Now, process whitespace on the (potentially) comment-stripped content
    // Python files preserve their original whitespace (indentation matters!)
    if (removeWhitespace && !isWhitespaceSensitive(filePath) && !isPythonFile) {
      content = removeExtraWhitespace(processedContent); // Use processedContent here
    } else {
      content = processedContent; // Use processedContent here
    }
    
    // Count tokens based on the final content
    const tokenCount = encode(content).length; // Use final 'content' variable
    const formattedContent = formatFileContent(filePath, content);
    
    return {
      path: filePath,
      content: formattedContent,
      tokenCount
    };
  }
}

/**
 * Process a minified file by creating a placeholder
 * @param filePath - Path to the file
 * @param onMinifyFile - Optional callback for minified file content
 * @returns Promise resolving to processed file result
 */
export async function processMinifiedFile(
  filePath: string, 
  onMinifyFile?: (path: string) => string
): Promise<ProcessedFileResult> {
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
  
  return {
    path: filePath,
    content: formattedPlaceholder,
    tokenCount
  };
}

/**
 * Update statistics based on file processing result
 * @param stats - Current statistics object
 * @param result - Processed file result
 * @param isBinary - Whether the file was binary
 * @param isMinified - Whether the file was minified
 */
export function updateStats(
  stats: Partial<BuildStats>,
  result: ProcessedFileResult,
  isBinary: boolean
): void {
  // Update total token count and file size
  stats.totalTokenCount = (stats.totalTokenCount || 0) + result.tokenCount;
  stats.totalFileSizeKB = (stats.totalFileSizeKB || 0) + (result.content.length / 1024);
  
  // Update specific counters
  if (isBinary) {
    stats.binaryAndSvgFiles = (stats.binaryAndSvgFiles || 0) + 1;
  }
}

/**
 * Handle file processing errors by creating an error placeholder
 * @param filePath - Path to the file that failed to process
 * @param error - The error that occurred
 * @returns Promise resolving to processed file result with error content
 */
export async function handleFileError(filePath: string, error: unknown): Promise<ProcessedFileResult> {
  // Handle file reading errors gracefully
  console.warn(`Warning: Could not process file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  
  // Use placeholder for files that couldn't be read
  const errorContent = `[Error: Could not read file ${filePath}. ${error instanceof Error ? error.message : String(error)}]`;
  const tokenCount = encode(errorContent).length;
  const formattedContent = formatFileContent(filePath, errorContent);
  
  return {
    path: filePath,
    content: formattedContent,
    tokenCount
  };
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
 * Check if a file is whitespace-sensitive
 * @param path - The file path
 * @returns true if file is known to be whitespace-sensitive
 */
function isWhitespaceSensitive(path: string): boolean {
  const whitespaceSensitiveExtensions = [
    'yaml',   // YAML
    'yml',    // YAML
    'haml',   // HAML
    'pug',    // Pug
    'sass',   // Sass
    'styl',   // Stylus
    'hs',     // Haskell
    'fs',     // F#
    'coffee', // CoffeeScript
    'ws'      // Whitespace (the fun one!)
  ];

  const filename = basename(path).toLowerCase();
  if (filename === 'makefile' || filename.endsWith('.mk')) {
    return true;
  }
  
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