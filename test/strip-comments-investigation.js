/**
 * Investigation of strip-comments library behavior
 */

// Test what strip-comments actually does with HTML comments
import strip from 'strip-comments';

const testCases = [
  {
    name: 'HTML comments in HTML',
    input: `<!DOCTYPE html>
<html>
<head>
    <!-- This HTML comment should be stripped -->
    <title>Test</title>
</head>
<body>
    <!-- Another HTML comment -->
    <h1>Hello World</h1>
</body>
</html>`
  },
  {
    name: 'JS comments in JavaScript',
    input: `// This is a JS comment
function test() {
    /* Multi-line comment */
    console.log("Hello");
    // Another JS comment
}`
  },
  {
    name: 'Mixed comments',
    input: `<!-- HTML comment -->
// JS comment
/* JS multi-line */
<!-- Another HTML comment -->`
  }
];

console.log('=== STRIP-COMMENTS LIBRARY INVESTIGATION ===\n');

for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  console.log('Original:');
  console.log(testCase.input);
  console.log('\nWith stripHtmlComments: true');
  const stripped = strip(testCase.input, {
    stripHtmlComments: true,
    preserveNewlines: true,
    safe: true
  });
  console.log(stripped);
  console.log('\nWith stripHtmlComments: false');
  const notStripped = strip(testCase.input, {
    stripHtmlComments: false,
    preserveNewlines: true,
    safe: true
  });
  console.log(notStripped);
  console.log('\n' + '='.repeat(50) + '\n');
}