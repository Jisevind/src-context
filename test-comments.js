// This is a single-line comment
const hello = "world"; // Another single-line comment

/*
 * This is a multi-line comment
 * that spans multiple lines
 */
function testFunction() {
  /* This is an inline block comment */
  return hello;
}

/**
 * JSDoc comment
 * @param {string} name - The name parameter
 * @returns {string} - The greeting
 */
function greet(name) {
  return `Hello, ${name}!`;
}