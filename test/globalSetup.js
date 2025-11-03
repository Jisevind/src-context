import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// This function is run by vitest *once* before all test suites
export async function setup() {
  console.log('Running global setup: npm run build...');
  
  // Define the project root directory (which is one level up from this file's dir)
  const projectRoot = join(__dirname, '..');
  
  try {
    // Run npm run build from the project root
    await execAsync('npm run build', { cwd: projectRoot });
    console.log('Build complete. Starting tests...');
  } catch (err) {
    console.error('Global setup failed:', err);
    process.exit(1);
  }
}

// This function is run *once* after all tests
export async function teardown() {
  // We don't need any global teardown right now
  // but it's good to have.
}