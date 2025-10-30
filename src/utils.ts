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