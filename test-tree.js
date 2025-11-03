import { generateStructureTree } from './src/utils.js';

// Test the generateStructureTree function directly
console.log('Testing generateStructureTree function:');
console.log('=======================================');

const testFiles = [
  'src/index.ts',
  'src/utils.ts',
  'src/core.ts',
  'src/fileProcessors.ts',
  'package.json',
  'README.md',
  'test/subfolder/nested.js',
  'test/another.js'
];

const treeOutput = generateStructureTree(testFiles);
console.log('Tree output:');
console.log(treeOutput);
console.log('\n');

// Now test with the main generateContext function
import { generateContext } from './src/index.js';

async function testGenerateContext() {
  console.log('Testing generateContext with tree output:');
  console.log('==========================================');
  
  // Test without token budget
  console.log('\n1. Without token budget:');
  const result1 = await generateContext({
    inputPaths: ['src'],
    cliIgnores: [],
    customIgnoreFile: '',
    removeWhitespace: false,
    keepComments: true,
    maxFileKb: 1024
  });
  
  const firstLines = result1.finalContent.split('\n').slice(0, 10);
  console.log('First 10 lines of output (should start with tree):');
  firstLines.forEach((line, i) => console.log(`${i + 1}: ${line}`));
  
  // Test with token budget
  console.log('\n\n2. With token budget:');
  const result2 = await generateContext({
    inputPaths: ['src'],
    cliIgnores: [],
    customIgnoreFile: '',
    removeWhitespace: false,
    keepComments: true,
    tokenBudget: 1000,
    maxFileKb: 1024
  });
  
  const firstLines2 = result2.finalContent.split('\n').slice(0, 10);
  console.log('First 10 lines of output (should start with tree):');
  firstLines2.forEach((line, i) => console.log(`${i + 1}: ${line}`));
}

testGenerateContext().catch(console.error);