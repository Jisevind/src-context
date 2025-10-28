/**
 * Context Engine - Main library entry point
 * This file exports the core functionality for the src-context library
 */

import { gatherFiles, processFiles, defaultIgnores } from './core.js';
import { BuildStats } from './types.js';

export interface ContextEngineOptions {
  inputPath: string;
  cliIgnores: string[];
  customIgnoreFile: string;
  removeWhitespace: boolean;
  keepComments?: boolean;
  minifyFile?: string | undefined;
  tokenBudget?: number | undefined;
  onBinaryFile?: (path: string) => string;
  onMinifyFile?: (path: string) => string;
  maxFileKb?: number | undefined;
}

/**
 * Generate context by gathering and processing files
 * @param options - Configuration options for context generation
 * @returns Promise resolving to object with final content and build stats
 */
export async function generateContext(options: ContextEngineOptions): Promise<{ finalContent: string, stats: BuildStats }> {
  // Gather files based on the provided options
  const files = await gatherFiles(
    options.inputPath,
    options.cliIgnores,
    options.customIgnoreFile,
    options.minifyFile || '.contextminify'
  );

  // Process the gathered files
  const { processedFiles, stats } = await processFiles(files, options.removeWhitespace, options.onBinaryFile, options.onMinifyFile, files.stats, options.maxFileKb ?? 1024, !options.keepComments);

  // If token budget is specified, apply budget filtering
  if (options.tokenBudget !== undefined) {
    // Sort files by token count in ascending order (smallest first)
    const sortedFiles = processedFiles.sort((a, b) => a.tokenCount - b.tokenCount);
    
    let totalTokens = 0;
    const budgetFiles = [];
    
    // Iterate through sorted files and add to budget until limit is reached
    for (const file of sortedFiles) {
      if (totalTokens + file.tokenCount <= options.tokenBudget) {
        budgetFiles.push(file);
        totalTokens += file.tokenCount;
      } else {
        // Stop as soon as the next file won't fit
        break;
      }
    }
    
    // Join content from files that fit within the budget
    const combinedContent = budgetFiles.map((file: { content: string }) => file.content).join('\n\n');
    return { finalContent: combinedContent, stats: stats as BuildStats };
  }

  // Join all formatted content strings into one single string
  const combinedContent = processedFiles.map((file: { content: string }) => file.content).join('\n\n');

  return { finalContent: combinedContent, stats: stats as BuildStats };
}

/**
 * Get file statistics by gathering and processing files
 * @param options - Configuration options for file processing
 * @returns Promise resolving to object with file statistics and build stats
 */
export async function getFileStats(options: ContextEngineOptions): Promise<{ files: Array<{ path: string; tokenCount: number }>, stats: BuildStats }> {
  // Gather files based on the provided options
  const files = await gatherFiles(
    options.inputPath,
    options.cliIgnores,
    options.customIgnoreFile,
    options.minifyFile || '.contextminify'
  );

  // Process the gathered files
  const { processedFiles, stats } = await processFiles(files, options.removeWhitespace, options.onBinaryFile, options.onMinifyFile, files.stats, options.maxFileKb ?? 1024, !options.keepComments);

  // Create array of file statistics
  const fileStats = processedFiles.map((file: { path: string; tokenCount: number }) => ({
    path: file.path,
    tokenCount: file.tokenCount
  }));

  // If token budget is specified, apply budget filtering
  if (options.tokenBudget !== undefined) {
    // Sort files by token count in ascending order (smallest first)
    const sortedStats = fileStats.sort((a, b) => a.tokenCount - b.tokenCount);
    
    let totalTokens = 0;
    const budgetStats = [];
    
    // Iterate through sorted files and add to budget until limit is reached
    for (const stat of sortedStats) {
      if (totalTokens + stat.tokenCount <= options.tokenBudget) {
        budgetStats.push(stat);
        totalTokens += stat.tokenCount;
      } else {
        // Stop as soon as the next file won't fit
        break;
      }
    }
    
    // Sort the budgeted stats by token count in descending order for consistency with original behavior
    budgetStats.sort((a, b) => b.tokenCount - a.tokenCount);
    
    return { files: budgetStats, stats: stats as BuildStats };
  }

  // Sort by tokenCount in descending order (most expensive files first)
  fileStats.sort((a: { tokenCount: number }, b: { tokenCount: number }) => b.tokenCount - a.tokenCount);

  return { files: fileStats, stats: stats as BuildStats };
}

// Export main functionality
export { defaultIgnores };
export default {
  generateContext,
  getFileStats
};