#!/usr/bin/env node

/**
 * Context Engine CLI
 * Command-line interface for the src-context tool
 */

import { program } from 'commander';
import { generateContext, getFileStats } from './index.js';
import { defaultIgnores } from './defaultIgnores.js';
import { generateSummaryReport } from './summary.js';
import { BuildStats } from './types.js';
import clipboardy from 'clipboardy';
import chokidar from 'chokidar';
import { asyncDebounce, loadPatternsFromFile } from './utils.js';
import { join, isAbsolute, relative } from 'path';

// Define all CLI options
program
  .name('src-context')
  .description('A CLI tool for processing and analyzing code context')
  .version('0.2.0')
  .argument('[paths...]', 'Input paths (files or directories) to process')
  .option('-o, --output <file>', 'Output to a file')
  .option('--clip', 'Copy output to clipboard')
  .option('--ignore <pattern>', 'Collect multiple patterns into an array', (value, previous: string[]) => {
    return previous ? [...previous, value] : [value];
  }, [])
  .option('--ignore-file <name>', 'Specify custom ignore file name', '.contextignore')
  .option('--priority-file <name>', 'Specify priority file name', '.contextpriority')
  .option('--show-tokens', 'Trigger the getFileStats function')
  .option('--keep-whitespace', 'Disables whitespace removal')
  .option('--keep-comments', 'Keep comments in the output (comments are stripped by default)')
  .option('--token-budget <number>', 'Stop processing when total tokens exceed this budget')
  .option('--no-default-ignores', 'Disable default ignore patterns')
  .option('--watch', 'For the watch mode')
  .option('--max-file-kb <number>', 'Maximum file size in KB to process (default: 1024)');

// Implement the main action
program.action(async (paths: string[], options: any) => {
  try {
    // Prepare options for the library functions
    // Normalize paths to be relative to current working directory for watch mode
    const normalizedInputPaths = paths && paths.length > 0 ? paths.map(p => {
      // If the path is absolute, make it relative to cwd
      if (isAbsolute(p)) {
        const relativePath = relative(process.cwd(), p);
        return relativePath || '.';
      }
      return p;
    }) : ['.'];
    
    const contextOptions = {
      inputPaths: normalizedInputPaths, // Use normalized paths
      cliIgnores: options.ignore || [],
      customIgnoreFile: options.ignoreFile || '.contextignore',
      removeWhitespace: !options.keepWhitespace,
      keepComments: options.keepComments || false,
      tokenBudget: options.tokenBudget ? parseInt(options.tokenBudget, 10) : undefined,
      maxFileKb: options.maxFileKb ? parseInt(options.maxFileKb, 10) : undefined,
      noDefaultIgnores: options.noDefaultIgnores || false,
      priorityFile: options.priorityFile || '.contextpriority'
    };

    // Create the runBuild function that contains all the build logic
    async function runBuild(): Promise<void> {
      let stats: BuildStats;
      
      // If --show-tokens is used
      if (options.showTokens) {
        const { files: fileStats, stats: fileStatsStats } = await getFileStats(contextOptions);
        stats = fileStatsStats;
        
        // Log a formatted table to the console showing "File" and "Token Count"
        console.log('\nFile Statistics (sorted by token count - descending):\n');
        console.log('File'.padEnd(60) + 'Token Count');
        console.log('-'.repeat(70));
        
        fileStats.forEach((stat) => {
          console.log(stat.path.padEnd(60) + stat.tokenCount.toString());
        });
        
        console.log('\nTotal files:', fileStats.length);
      } else {
        // If --show-tokens is NOT used, generate context
        const { finalContent: context, stats: contextStats } = await generateContext(contextOptions);
        stats = contextStats;

        // Handle output based on options
        if (options.clip) {
          // Copy to clipboard
          await clipboardy.write(context);
          console.log('Context copied to clipboard!');
        } else if (options.output) {
          // Write to file
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, context, 'utf8');
          console.log(`Context written to file: ${options.output}`);
        } else {
          // Print to console
          console.log(context);
        }
      }
      
      // Generate and print summary report at the very end
      const summaryReport = generateSummaryReport(stats);
      console.log(summaryReport);
    }

    // Create a debounced version of runBuild to prevent excessive rebuilds
    const debouncedRunBuild = asyncDebounce(runBuild, 300);

    // Helper function to get ignore patterns for chokidar
    async function getIgnorePatterns(basePath: string): Promise<string[]> {
      const patterns: string[] = [...defaultIgnores];

      // Add CLI ignore patterns
      if (options.ignore && options.ignore.length > 0) {
        patterns.push(...options.ignore);
      }

      // Add output file to ignore patterns to prevent infinite loops
      if (options.output) {
        patterns.push(options.output);
      }

      // Try to load custom ignore file
      const customIgnorePath = join(basePath, options.ignoreFile || '.contextignore');
      const customPatterns = await loadPatternsFromFile(customIgnorePath);
      
      if (customPatterns.length > 0) {
        patterns.push(...customPatterns);
      }

      return patterns;
    }

    // Handle watch mode if enabled
    if (options.watch) {
      console.log('Watch mode enabled. Performing initial build...');
      
      // Normalize paths to be relative to current working directory for watch mode
      const normalizedWatchPaths = paths && paths.length > 0 ? paths.map(p => {
        // If the path is absolute, make it relative to cwd
        if (isAbsolute(p)) {
          const relativePath = relative(process.cwd(), p);
          return relativePath || '.';
        }
        return p;
      }) : ['.'];
      
      // Run initial build
      await runBuild();
      
      console.log('\nWatching for file changes...');
      
      // Get ignore patterns for chokidar
      const firstInputPath = (normalizedWatchPaths && normalizedWatchPaths.length > 0 ? normalizedWatchPaths[0] : '.') || '.';
      const ignorePatterns = await getIgnorePatterns(firstInputPath);
      
      // Set up chokidar watcher with proper ignore patterns
      const watcher = chokidar.watch(normalizedWatchPaths, {
        ignored: ignorePatterns,
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100
        }
      });

      // Listen for file system events
      watcher.on('add', async (path) => {
        console.log(`\nFile added: ${path}, rebuilding...`);
        try {
          await debouncedRunBuild();
        } catch (error) {
          console.error('Watch build failed:', error);
        }
      });

      watcher.on('change', async (path) => {
        console.log(`\nFile changed: ${path}, rebuilding...`);
        try {
          await debouncedRunBuild();
        } catch (error) {
          console.error('Watch build failed:', error);
        }
      });

      watcher.on('unlink', async (path) => {
        console.log(`\nFile removed: ${path}, rebuilding...`);
        try {
          await debouncedRunBuild();
        } catch (error) {
          console.error('Watch build failed:', error);
        }
      });

      // Handle watcher errors
      watcher.on('error', (error) => {
        console.error('Watcher error:', error);
      });

      // Keep the process running
      process.on('SIGINT', () => {
        console.log('\nStopping watch mode...');
        watcher.close();
        process.exit(0);
      });
    } else {
      // If watch mode is not enabled, just run the build once
      await runBuild();
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
});

// Parse command line arguments
program.parse(process.argv);