# Test Suite Documentation

This directory contains the testing infrastructure for the First Line is Title plugin.

## 📁 Structure

```
src/test/
├── README.md           # This file
├── mockObsidian.ts     # Mock implementation of Obsidian API
├── setup.ts            # Test environment setup
└── testUtils.ts        # Helper functions for tests

src/**/*.test.ts        # Test files (co-located with source files)
```

## 🚀 Running Tests

### Locally

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### GitHub Actions

Tests run automatically on every push and pull request via GitHub Actions.
- Tests run on Node.js 18 and 20
- View results: https://github.com/greetclammy/first-line-is-title/actions

## 🧪 Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { functionToTest } from './module';
import { createTestSettings } from '../test/testUtils';

describe('module-name', () => {
  let settings: PluginSettings;

  beforeEach(() => {
    settings = createTestSettings();
  });

  describe('functionToTest', () => {
    it('should do something', () => {
      const result = functionToTest('input', settings);
      expect(result).toBe('expected output');
    });
  });
});
```

### Using Mock Obsidian API

```typescript
import { TFile, App } from '../test/mockObsidian';
import { createMockFile, createMockApp } from '../test/testUtils';

// Create mock file
const file = createMockFile('test.md');

// Create mock app
const app = createMockApp();

// Mock vault methods
app.vault.read = vi.fn().mockResolvedValue('file content');
app.vault.rename = vi.fn().mockResolvedValue(undefined);

// Mock metadata cache
app.metadataCache.getFileCache = vi.fn().mockReturnValue({
  frontmatter: { tags: ['test'] }
});
```

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  app.vault.read = vi.fn().mockResolvedValue('content');

  const result = await readFileContent(plugin, file);

  expect(result).toBe('content');
  expect(app.vault.read).toHaveBeenCalledWith(file);
});
```

### Testing Error Handling

```typescript
it('should handle errors gracefully', async () => {
  app.vault.read = vi.fn().mockRejectedValue(new Error('Read failed'));

  await expect(readFileContent(plugin, file)).rejects.toThrow('Read failed');
});
```

### Mocking Console Output

```typescript
it('should log debug message', () => {
  const consoleSpy = vi.spyOn(console, 'debug');

  someFunction();

  expect(consoleSpy).toHaveBeenCalledWith('expected message');
});
```

## 🔧 Test Utilities

### Available Helpers

#### `createTestSettings(overrides?)`
Creates a test settings object with optional overrides.

```typescript
const settings = createTestSettings({
  core: { renameNotes: 'manually' }
});
```

#### `createMockFile(path)`
Creates a mock TFile instance.

```typescript
const file = createMockFile('folder/note.md');
// file.path = 'folder/note.md'
// file.basename = 'note'
// file.extension = 'md'
```

#### `createMockApp()`
Creates a mock Obsidian App instance.

```typescript
const app = createMockApp();
// Includes vault, metadataCache, workspace, fileManager
```

#### `createMockFolder(path)`
Creates a mock TFolder instance.

```typescript
const folder = createMockFolder('Notes');
```

## 📊 Current Test Coverage

### Modules with Tests (490+ tests total) 🎉

#### Core Modules
- ✅ **Rename Engine** (60+ tests)
  - Rate limiting, frontmatter stripping
  - Title extraction, cache management
  - Editor change processing, file workflow

- ✅ **Cache Manager** (52 tests)
  - LRU cache implementation
  - Path reservation & conflict detection
  - File operation locks, file existence cache

- ✅ **Rate Limiter** (60+ tests)
  - Per-key and global rate limiting
  - Time window management, performance tests

- ✅ **Debug Utilities** (41 tests)
  - Setting logs, file content output
  - Verbose logging controls

- ✅ **i18n** (80+ tests)
  - Locale switching, translations
  - English/Russian plural forms with all edge cases

#### Utility Modules
- ✅ **String Processing** (45 tests)
  - Forbidden character handling
  - Safe link generation
  - Character replacement logic

- ✅ **File Exclusions** (85 tests)
  - Folder exclusions & subfolders
  - Tag exclusions (frontmatter & inline)
  - Property exclusions
  - shouldProcessFile logic with strategies

- ✅ **Tag Utils** (63 tests)
  - Tag normalization
  - YAML parsing
  - Target tag detection
  - Child tag matching

- ✅ **Content Reader** (40+ tests)
  - Multiple read strategies
  - Workspace editor search
  - Popover handling
  - File read preferences

- ✅ **Core Utils** (40+ tests)
  - Verbose logging
  - Heading validation
  - OS detection
  - Safeword checking
  - Disable property detection

### Modules Needing Tests

- ⏳ Rename Engine
- ⏳ Alias Manager
- ⏳ Property Manager
- ⏳ File Operations
- ⏳ Title Insertion
- ⏳ Link Manager

## 🐛 Debugging Tests

### Run specific test file

```bash
npm test -- string-processing.test.ts
```

### Run tests matching pattern

```bash
npm test -- -t "should handle forbidden chars"
```

### View detailed error output

```bash
npm test -- --reporter=verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Vitest Current File",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal"
}
```

## 📝 Best Practices

1. **Test file naming**: Use `.test.ts` suffix (e.g., `utils.test.ts`)
2. **Co-location**: Place test files next to source files
3. **Descriptive names**: Use clear `describe` and `it` descriptions
4. **Arrange-Act-Assert**: Organize tests with setup, execution, verification
5. **One assertion per test**: Keep tests focused (when possible)
6. **Mock external dependencies**: Use mocks for Obsidian API
7. **Test edge cases**: Empty strings, null, undefined, errors
8. **Clean up**: Use `beforeEach` for consistent test state

## 🔍 What Makes a Good Test?

### ✅ Good Test

```typescript
it('should replace slash with dash when enabled', () => {
  settings.replaceCharacters.charReplacements.slash.enabled = true;
  settings.replaceCharacters.charReplacements.slash.replacement = '-';

  const result = processForbiddenChars('hello/world', settings);

  expect(result).toBe('hello-world');
});
```

### ❌ Bad Test

```typescript
it('should work', () => {
  const result = processForbiddenChars('hello/world', settings);
  expect(result).toBeTruthy(); // Too vague!
});
```

## 🚨 Common Pitfalls

1. **Forgetting to await async functions**
   ```typescript
   // ❌ Wrong
   const result = readFileContent(plugin, file);

   // ✅ Correct
   const result = await readFileContent(plugin, file);
   ```

2. **Not mocking Obsidian API calls**
   ```typescript
   // ❌ Will fail - no mock
   const cache = app.metadataCache.getFileCache(file);

   // ✅ Correct - mocked
   app.metadataCache.getFileCache = vi.fn().mockReturnValue({...});
   ```

3. **Sharing state between tests**
   ```typescript
   // ❌ Wrong - mutates shared object
   let settings = createTestSettings();
   it('test 1', () => { settings.core.renameNotes = 'manually'; });
   it('test 2', () => { /* settings is now mutated! */ });

   // ✅ Correct - fresh state each time
   let settings: PluginSettings;
   beforeEach(() => { settings = createTestSettings(); });
   ```

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Obsidian API Documentation](https://github.com/obsidianmd/obsidian-api)
- [Obsidian Developer Docs](https://github.com/obsidianmd/obsidian-developer-docs)
