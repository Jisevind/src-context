# src-context

A smart, token-aware CLI for aggregating and optimizing codebases for LLM context.

`src-context` intelligently scans your project, grabs all the relevant files, optimizes their content, and combines them into a single, clean output perfect for pasting into any large language model.

## Features

-   **Clipboard Ready:** Use `--clip` to copy the entire output directly to your clipboard.
    
-   **Token Budgeting:** Set a limit with `--token-budget <number>` to guarantee the output never exceeds your model's context window.
    
-   **Smart Minification:** Use a `.contextminify` file to include a file's _path_ but not its _content_, saving thousands of tokens on build artifacts or lockfiles.
    
-   **Watch Mode:** Run with `--watch` to automatically rebuild the context every time you save a file.
    
-   **Token Analysis:** Use `--show-tokens` to get a detailed breakdown of which files are the "most expensive" in your project.
    
-   **Smart Optimizations:** Intelligently removes unnecessary whitespace from code while preserving whitespace-sensitive files (Python, YAML, Haskell, etc.) and using specialized processing for Python that strips `#` comments while keeping valuable `"""docstrings"""`.
    
-   **Robust Ignoring:** Combines default ignores (which can be disabled with `--no-default-ignores`), a custom `.contextignore` file, and CLI `--ignore` patterns for total control.
    
-   **Safe & Configurable:** Handles binary files, SVGs, and lets you set a max file size with `--max-file-kb`.
    
-   **Multiple Paths:** Process multiple files and directories in a single command.
    
-   **Smart Comment Control:** Strip comments by default, but _intelligently_:
    -   **Keeps Docstrings:** In Python, it removes `#` comments but preserves high-value `"""docstrings"""`.
    -   **Preserves Metadata:** It keeps HTML comments (`<!-- -->`) in Markdown files but strips them from `.html` and `.jsx` files.
    -   **Protects Licenses:** It automatically keeps "protected" comments like `/*! ... */` and `//!` in all files.
    -   Use `--keep-comments` to preserve all comments.
    
-   **Library First:** Can be imported as a Node.js library for use in other projects.

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

**6\. Process multiple specific directories:**

```bash
    npx src-context src tests --clip
```

**7\. Keep comments in the output (comments are stripped by default):**

```bash
    npx src-context --keep-comments --clip
```

## Commands & Options
```bash
    Usage: src-context [paths...] [options]
    
    A CLI tool for processing and analyzing code context
    
    Arguments:
      paths...               Input paths (files or directories) to process (default: ".")
    
    Options:
      -V, --version          output the version number
      -o, --output <file>    Output to a file
      --clip                 Copy output to clipboard
      --ignore <pattern>     Collect multiple patterns into an array
      --ignore-file <name>   Specify custom ignore file name (default: ".contextignore")
      --priority-file <name> Specify priority file name (default: ".contextpriority")
      --show-tokens          Trigger the getFileStats function
      --keep-whitespace      Disables whitespace removal
      --keep-comments        Keep comments in the output (comments are stripped by default)
      --token-budget <number> Stop processing when total tokens exceed this budget
      --watch                For the watch mode
      --no-default-ignores   Disables the default ignore patterns (node_modules, .git, etc.)
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

### `.contextpriority` (To Prioritize)

This file solves a problem with the `--token-budget` feature. By default, the tool fits as many small files as possible, which can cause large, important files (like your main `index.js`) to be dropped.

Any file or glob pattern in `.contextpriority` is **guaranteed** to be included in the budget *first*. The tool will then fill the remaining space with other files.

**Example `.contextpriority`:**
```
    # Always include my main entry points and core logic
    src/index.ts
    src/core.ts
    
    # Always include the main package file
    package.json
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
      keepComments: false,
      priorityFile: '.contextpriority',
      noDefaultIgnores: false
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