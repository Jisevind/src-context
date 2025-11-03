/**
 * Utility functions for the src-context
 */

/**
 * Debounce function to prevent excessive calls
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null;
  
  return function (...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  } as T;
}

/**
 * Async debounce function to prevent excessive calls for async functions
 * @param func - The async function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns The debounced async function
 */
export function asyncDebounce<T extends (...args: any[]) => Promise<any>>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null;
  let latestResolve: ((value: any) => void) | null = null;
  let latestReject: ((reason: any) => void) | null = null;
  
  return function (...args: Parameters<T>): Promise<ReturnType<T>> {
    return new Promise((resolve, reject) => {
      // Cancel previous timeout if exists
      if (timeout) {
        clearTimeout(timeout);
      }
      
      // Reject previous promise if still pending
      if (latestReject) {
        latestReject(new Error('Debounced'));
        latestReject = null;
        latestResolve = null;
      }
      
      // Store new resolve/reject functions
      latestResolve = resolve;
      latestReject = reject;
      
      timeout = setTimeout(async () => {
        try {
          const result = await func(...args);
          if (latestResolve) {
            latestResolve(result);
          }
        } catch (error) {
          if (latestReject) {
            latestReject(error);
          }
        } finally {
          timeout = null;
          latestResolve = null;
          latestReject = null;
        }
      }, wait);
    });
  } as T;
}

/**
 * Load patterns from a file, parsing each line and filtering out comments and empty lines
 * @param filePath - Path to the file containing patterns
 * @returns Promise resolving to array of pattern strings
 */
export async function loadPatternsFromFile(filePath: string): Promise<string[]> {
  try {
    const { readFile } = await import('fs/promises');
    const fileContent = await readFile(filePath, 'utf-8');
    const patterns = fileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    return patterns;
  } catch (error) {
    // Check if the error is a file-not-found error (expected behavior)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // File not found, return empty array
      return [];
    } else {
      // For any other error (permissions, etc.), log a warning and return empty array
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not read patterns file ${filePath}: ${errorMessage}`);
      return [];
    }
  }
}

/**
 * Generate an ASCII tree structure from an array of file paths
 * @param filePaths - Array of file paths to create tree structure from
 * @returns Formatted ASCII tree string
 */
export function generateStructureTree(filePaths: string[]): string {
  // Filter out .git folders and any paths containing .git (handle both / and \)
  const filteredPaths = filePaths.filter(path => {
    const normalizedPath = path.replace(/\\/g, '/');
    return !normalizedPath.includes('.git/') && !normalizedPath.endsWith('.git');
  });
  
  // Build hierarchical tree structure
  const tree: any = {};
  
  // Parse paths and build tree object
  for (const path of filteredPaths) {
    const parts = path.replace(/\\/g, '/').split('/'); // Normalize paths
    let current = tree;
    
    for (let i = 0; i < parts.length; i++) {
      const part = String(parts[i]).trim();
      
      if (part === '') continue; // Skip empty parts
      
      // Skip .git directories if somehow included
      if (part === '.git') continue;
      
      const isLast = i === parts.length - 1;
      
      if (isLast) {
        // It's a file, set to null to indicate leaf node
        current[part] = null;
      } else {
        // It's a directory, create if doesn't exist
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }

  // Convert tree object to ASCII string
  function treeToString(node: any, prefix: string = '', isLast: boolean = true): string {
    let result = '';
    const keys = Object.keys(node).sort(); // Sort keys for consistent output
    
    keys.forEach((key, index) => {
      const isLastKey = index === keys.length - 1;
      const currentPrefix = prefix + (isLast ? '    ' : '│   ');
      const child = node[key];
      
      if (child === null) {
        // It's a file
        result += prefix + (isLast ? '└── ' : '├── ') + key + '\n';
      } else {
        // It's a directory
        result += prefix + (isLast ? '└── ' : '├── ') + key + '/\n';
        result += treeToString(child, currentPrefix, isLastKey);
      }
    });
    
    return result;
  }

  // Start with root indicator and build the tree
  const treeString = './\n' + treeToString(tree);
  return treeString;
}