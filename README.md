# 🤖 src-context

A smart, token-aware CLI for aggregating and optimizing codebases for LLM context.

`src-context` intelligently scans your project, grabs all the relevant files, optimizes their content, and combines them into a single, clean output perfect for pasting into any large language model.

## Features

-   **⚡ Clipboard Ready:** Use `--clip` to copy the entire output directly to your clipboard.
    
-   **💸 Token Budgeting:** Set a limit with `--token-budget <number>` to guarantee the output never exceeds your model's context window.
    
-   **🧠 Smart Minification:** Use a `.contextminify` file to include a file's _path_ but not its _content_, saving thousands of tokens on build artifacts or lockfiles.
    
-   **👀 Watch Mode:** Run with `--watch` to automatically rebuild the context every time you save a file.
    
-   **📊 Token Analysis:** Use `--show-tokens` to get a detailed breakdown of which files are the "most expensive" in your project.
    
-   **⚙️ Smart Optimizations:** Automatically removes unnecessary whitespace from code (but intelligently skips files like Python or YAML) to save tokens.
    
-   **🛡️ Robust Ignoring:** Combines default ignores (`node_modules`, `.git`, etc.), a custom `.contextignore` file, and CLI `--ignore` patterns for total control.
    
-   **🧩 Library First:** Can be imported as a Node.js library for use in other projects.
    
-   **✅ Safe & Configurable:** Handles binary files, SVGs, and lets you set a max file size with `--max-file-kb`.
    

## Installation

You don't need to install it. The easiest way to run `src-context` is by using `npx`:

```bash
    npx src-context [options]
``` 

Or, you can install it globally if you prefer:

```bash
    npm install -g .
    src-context [options]
```

## Usage

Here are some common examples:

**1\. Copy the entire current project (minus ignored files) to your clipboard:**

```bash
    npx src-context --clip
```

**2\. Generate a `output.md` file, but stop if the token count exceeds 8000:**

```bash
    npx src-context -o output.md --token-budget 8000
```

**3\. See which files use the most tokens:**

```bash
    npx src-context --show-tokens
```

**4\. Watch your `src` folder and rebuild `output.md` on every change:**

```bash
    npx src-context src -o output.md --watch
```    

**5\. Process a project but ignore all test files:**

```bash
    npx src-context --ignore "**/*.test.ts" --clip
```    

## Commands & Options
```bash
    Usage: src-context [inputPath] [options]
    
    A CLI tool for processing and analyzing code context
    
    Arguments:
      inputPath              Input path to process (default: ".")
    
    Options:
      -V, --version          output the version number
      -o, --output <file>    Output to a file
      --clip                 Copy output to clipboard
      --ignore <pattern>     Collect multiple patterns into an array
      --ignore-file <name>   Specify custom ignore file name (default: ".contextignore")
      --show-tokens          Trigger the getFileStats function
      --keep-whitespace      Disables whitespace removal
      --token-budget <number> Stop processing when total tokens exceed this budget
      --watch                For the watch mode
      --max-file-kb <number> Maximum file size in KB to process (default: 1024)
      -h, --help             display help for command
```    

## Configuration

`src-context` is controlled by two special files in your project's root:

### `.contextignore` (To Exclude)

This file works exactly like a `.gitignore` file. Add any files or glob patterns you want to _completely exclude_ from the output.

**Example `.contextignore`:**
```
    # Exclude all documentation
    docs/
    
    # Exclude all test files
    *.test.ts
    *.spec.js
```    

### `.contextminify` (To "Hide")

This is the most powerful feature for LLMs. Any file matching a pattern here will be included in the output, but _only as a placeholder_. This tells the AI the file exists without wasting tokens on its content.

This is perfect for build artifacts, lockfiles, or large data files.

**Example `.contextminify`:**
```
    # Tell the AI these files exist, but don't paste the content
    package-lock.json
    yarn.lock
    dist/
    build/
    *.min.js
``` 

**Output:**

```markdown
    # package-lock.json
    
    [Content for package-lock.json has been minified and excluded]
```   

## As a Library

You can also import `src-context` into your own Node.js projects.

```bash
    npm install src-context
```   

```typescript
    import { generateContext, getFileStats } from 'src-context';
    
    const options = {
      inputPath: './my-project',
      cliIgnores: [],
      customIgnoreFile: '.contextignore',
      removeWhitespace: true,
      minifyFile: '.contextminify',
      tokenBudget: 8192,
      maxFileKb: 1024,
    };
    
    // 1. Get the full context as a string
    const { finalContent, stats } = await generateContext(options);
    console.log(finalContent);
    console.log(stats);
    
    // 2. Or, get the token/file statistics
    const { files, stats: fileStats } = await getFileStats(options);
    console.log(files); // [{ path: '...', tokenCount: ... }]
```

## License

MIT