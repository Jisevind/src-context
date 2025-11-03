/**
 * Context Engine - Main library entry point
 * This file exports the core functionality for the src-context library
 */

import { gatherFiles, processFiles } from './core.js';
import { defaultIgnores } from './defaultIgnores.js';
import { BuildStats } from './types.js';
import { generateStructureTree, loadPatternsFromFile } from './utils.js';
import { default as ignore } from 'ignore';

export interface ContextEngineOptions {
  inputPaths: string[];
  cliIgnores: string[];
  customIgnoreFile: string;
  removeWhitespace: boolean;
  keepComments?: boolean;
  minifyFile?: string | undefined;
  tokenBudget?: number | undefined;
  priorityFile?: string;
  onBinaryFile?: (path: string) => string;
  onMinifyFile?: (path: string) => string;
  maxFileKb?: number | undefined;
  noDefaultIgnores?: boolean;
}

/**
 * Generate context by gathering and processing files
 * @param options - Configuration options for context generation
 * @returns Promise resolving to object with final content and build stats
 */
export async function generateContext(options: ContextEngineOptions): Promise<{ finalContent: string, stats: BuildStats }> {
  // Use inputPaths from options, default to current directory if empty
  const inputPaths = options.inputPaths.length > 0 ? options.inputPaths : ['.'];
  
  // Gather files based on the provided options
  const files = await gatherFiles(
    inputPaths,
    options.cliIgnores,
    options.customIgnoreFile,
    options.minifyFile || '.contextminify',
    options.noDefaultIgnores
  );

  // Process the gathered files
  const { processedFiles, stats } = await processFiles(files, options.removeWhitespace, options.onBinaryFile, options.onMinifyFile, files.stats, options.maxFileKb ?? 1024, !options.keepComments);

  // If token budget is specified, apply budget filtering
  if (options.tokenBudget !== undefined) {
    // Load priority patterns from file
    const priorityPatterns = await loadPatternsFromFile(options.priorityFile || '.contextpriority');
    
    // Create a matcher for priority files
    const priorityMatcher = (ignore as any)().add(priorityPatterns);
    
    // Partition files into priority and remaining files
    const priorityFiles = [];
    const remainingFiles = [];
    
    for (const file of processedFiles) {
      if (priorityMatcher.ignores(file.path)) {
        priorityFiles.push(file);
      } else {
        remainingFiles.push(file);
      }
    }
    
    // Sort priority files by size (smallest first) for efficiency
    priorityFiles.sort((a, b) => a.tokenCount - b.tokenCount);
    
    let totalTokens = 0;
    const budgetFiles = [];
    
    // Process priority files first
    for (const file of priorityFiles) {
      if (totalTokens + file.tokenCount <= options.tokenBudget) {
        budgetFiles.push(file);
        totalTokens += file.tokenCount;
      } else {
        console.warn(`Priority file "${file.path}" skipped due to token budget constraints`);
      }
    }
    
    // Sort remaining files by token count in ascending order (smallest first)
    const sortedRemainingFiles = remainingFiles.sort((a, b) => a.tokenCount - b.tokenCount);
    
    // Process remaining files to fill the rest of the budget
    for (const file of sortedRemainingFiles) {
      if (totalTokens + file.tokenCount <= options.tokenBudget) {
        budgetFiles.push(file);
        totalTokens += file.tokenCount;
      } else {
        // Stop as soon as the next file won't fit
        break;
      }
    }
    
    // Update stats to reflect only budgeted files
    const updatedStats = { ...stats };
    updatedStats.filesToInclude = budgetFiles.length;
    updatedStats.totalTokenCount = totalTokens;
    updatedStats.totalFileSizeKB = budgetFiles.reduce((sum, file) => sum + (file.content.length / 1024), 0);
    updatedStats.topTokenConsumers = budgetFiles
      .sort((a, b) => b.tokenCount - a.tokenCount)
      .slice(0, 3)
      .map(file => ({ path: file.path, tokenCount: file.tokenCount }));
    
    // Get file paths and generate structure tree
    const budgetFilePaths = budgetFiles.map(file => file.path);
    const treeString = generateStructureTree(budgetFilePaths);
    
    // Join content from files that fit within the budget
    const combinedContent = treeString + '\n\n' + budgetFiles.map((file: { content: string }) => file.content).join('\n\n');
    return { finalContent: combinedContent, stats: updatedStats as BuildStats };
  }

  // Get file paths and generate structure tree
  const allFilePaths = processedFiles.map(file => file.path);
  const treeString = generateStructureTree(allFilePaths);

  // Join all formatted content strings into one single string
  const combinedContent = treeString + '\n\n' + processedFiles.map((file: { content: string }) => file.content).join('\n\n');

  return { finalContent: combinedContent, stats: stats as BuildStats };
}

/**
 * Get file statistics by gathering and processing files
 * @param options - Configuration options for file processing
 * @returns Promise resolving to object with file statistics and build stats
 */
export async function getFileStats(options: ContextEngineOptions): Promise<{ files: Array<{ path: string; tokenCount: number }>, stats: BuildStats }> {
  // Use inputPaths from options, default to current directory if empty
  const inputPaths = options.inputPaths.length > 0 ? options.inputPaths : ['.'];
  
  // Gather files based on the provided options
  const files = await gatherFiles(
    inputPaths,
    options.cliIgnores,
    options.customIgnoreFile,
    options.minifyFile || '.contextminify',
    options.noDefaultIgnores
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
    // Load priority patterns from file
    const priorityPatterns = await loadPatternsFromFile(options.priorityFile || '.contextpriority');
    
    // Create a matcher for priority files
    const priorityMatcher = (ignore as any)().add(priorityPatterns);
    
    // Partition files into priority and remaining files
    const priorityStats = [];
    const remainingStats = [];
    
    for (const stat of fileStats) {
      if (priorityMatcher.ignores(stat.path)) {
        priorityStats.push(stat);
      } else {
        remainingStats.push(stat);
      }
    }
    
    // Sort priority files by size (smallest first) for efficiency
    priorityStats.sort((a, b) => a.tokenCount - b.tokenCount);
    
    let totalTokens = 0;
    const budgetStats = [];
    
    // Process priority files first
    for (const stat of priorityStats) {
      if (totalTokens + stat.tokenCount <= options.tokenBudget) {
        budgetStats.push(stat);
        totalTokens += stat.tokenCount;
      } else {
        console.warn(`Priority file "${stat.path}" skipped due to token budget constraints`);
      }
    }
    
    // Sort remaining files by token count in ascending order (smallest first)
    const sortedRemainingStats = remainingStats.sort((a, b) => a.tokenCount - b.tokenCount);
    
    // Process remaining files to fill the rest of the budget
    for (const stat of sortedRemainingStats) {
      if (totalTokens + stat.tokenCount <= options.tokenBudget) {
        budgetStats.push(stat);
        totalTokens += stat.tokenCount;
      } else {
        // Stop as soon as the next file won't fit
        break;
      }
    }
    
    // Update stats to reflect only budgeted files
    const updatedStats = { ...stats };
    updatedStats.filesToInclude = budgetStats.length;
    updatedStats.totalTokenCount = totalTokens;
    
    // Sort the budgeted stats by token count in descending order for consistency with original behavior
    budgetStats.sort((a, b) => b.tokenCount - a.tokenCount);
    
    return { files: budgetStats, stats: updatedStats as BuildStats };
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