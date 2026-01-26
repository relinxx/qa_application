import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CustomTool, ToolExecutionResult, TestExecutionResult } from './types';

const execAsync = promisify(exec);
const TESTS_DIR = path.join(__dirname, '..', 'tests');
const MAX_FILE_SIZE = 1024 * 1024; // 1MB max file size
const PLAYWRIGHT_TIMEOUT = 300000; // 5 minutes for test execution

// Ensure tests directory exists
try {
  if (!fs.existsSync(TESTS_DIR)) {
    fs.mkdirSync(TESTS_DIR, { recursive: true });
  }
} catch (error: any) {
  console.error(`Failed to create tests directory: ${error.message}`);
}

/**
 * Sanitize file path to prevent directory traversal attacks
 */
function sanitizePath(filePath: string): string {
  // Remove any path traversal attempts
  const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  // Ensure it stays within tests directory
  const fullPath = path.join(TESTS_DIR, normalized);
  const relativePath = path.relative(TESTS_DIR, fullPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid file path: directory traversal detected');
  }
  return fullPath;
}

/**
 * Save a test file to the tests directory
 */
export async function saveTestFile(filePath: string, content: string): Promise<ToolExecutionResult> {
  // Input validation
  if (!filePath || typeof filePath !== 'string') {
    return {
      success: false,
      error: 'Invalid filePath: must be a non-empty string'
    };
  }

  if (!content || typeof content !== 'string') {
    return {
      success: false,
      error: 'Invalid content: must be a non-empty string'
    };
  }

  if (content.length > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `Content too large: ${content.length} bytes exceeds limit of ${MAX_FILE_SIZE} bytes`
    };
  }

  // Validate file extension
  if (!filePath.endsWith('.spec.ts') && !filePath.endsWith('.spec.js') && !filePath.endsWith('.test.ts') && !filePath.endsWith('.test.js')) {
    return {
      success: false,
      error: 'Invalid file extension: must be .spec.ts, .spec.js, .test.ts, or .test.js'
    };
  }

  try {
    const safePath = sanitizePath(filePath);
    const dir = path.dirname(safePath);
    
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(safePath, content, 'utf-8');
    
    // Verify file was written
    if (!fs.existsSync(safePath)) {
      throw new Error('File was not created');
    }

    const stats = fs.statSync(safePath);
    
    return {
      success: true,
      result: {
        filePath: safePath,
        size: stats.size,
        message: `Test file saved successfully: ${filePath} (${stats.size} bytes)`
      }
    };
  } catch (error: any) {
    const errorMsg = error.code === 'EACCES' 
      ? 'Permission denied - cannot write to tests directory'
      : error.code === 'ENOSPC'
      ? 'No space left on device'
      : error.message;
    
    return {
      success: false,
      error: `Failed to save test file: ${errorMsg}`
    };
  }
}

/**
 * Run Playwright tests with timeout
 */
export async function runPlaywrightTests(testFile?: string): Promise<ToolExecutionResult> {
  // Validate testFile if provided
  if (testFile && typeof testFile === 'string') {
    // Basic path validation - no shell injection
    if (testFile.includes(';') || testFile.includes('&') || testFile.includes('|') || testFile.includes('`')) {
      return {
        success: false,
        error: 'Invalid testFile path: contains forbidden characters'
      };
    }
  }

  try {
    const cmd = testFile
      ? `npx playwright test "${testFile.replace(/"/g, '\\"')}"`
      : 'npx playwright test';

    const { stdout, stderr } = await execAsync(cmd, {
      cwd: path.join(__dirname, '..'),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: PLAYWRIGHT_TIMEOUT
    });
    
    // Parse test results for summary
    const passedMatch = stdout.match(/(\d+) passed/);
    const failedMatch = stdout.match(/(\d+) failed/);
    const skippedMatch = stdout.match(/(\d+) skipped/);
    
    return {
      success: true,
      result: {
        output: stdout,
        stderr: stderr || undefined,
        summary: {
          passed: passedMatch ? parseInt(passedMatch[1]) : 0,
          failed: failedMatch ? parseInt(failedMatch[1]) : 0,
          skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0
        }
      }
    };
  } catch (error: any) {
    const output = error.stdout || '';
    const errorOutput = error.stderr || '';
    
    // Check for specific error types
    let errorMessage = 'Test execution failed';
    
    if (error.killed) {
      errorMessage = `Test execution timed out after ${PLAYWRIGHT_TIMEOUT / 1000}s`;
    } else if (error.code === 'ENOENT') {
      errorMessage = 'Playwright not found. Run: npx playwright install';
    } else if (errorOutput.includes('browserType.launch')) {
      errorMessage = 'Browser launch failed. Try: npx playwright install chromium';
    } else if (error.code) {
      // Playwright test failures return exit code 1
      const failedMatch = output.match(/(\d+) failed/);
      if (failedMatch) {
        errorMessage = `${failedMatch[1]} test(s) failed`;
      }
    }
    
    // Parse any available results even on failure
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    
    return {
      success: false,
      error: errorMessage,
      result: {
        output: output + (errorOutput ? '\n' + errorOutput : ''),
        summary: {
          passed: passedMatch ? parseInt(passedMatch[1]) : 0,
          failed: failedMatch ? parseInt(failedMatch[1]) : 0
        }
      }
    };
  }
}

/**
 * List all test files in the tests directory
 */
export async function listTestFiles(): Promise<ToolExecutionResult> {
  try {
    const entries = fs.readdirSync(TESTS_DIR, { recursive: true });
    const files = entries
      .filter((entry): entry is string => typeof entry === 'string')
      .filter((file) => file.endsWith('.spec.ts') || file.endsWith('.spec.js'))
      .map((file) => path.join(TESTS_DIR, file));
    
    return {
      success: true,
      result: {
        files: files,
        count: files.length
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to list test files: ${error.message}`
    };
  }
}

/**
 * Get custom tools that can be exposed to the LLM
 */
export function getCustomTools(): CustomTool[] {
  return [
    {
      name: 'saveTestFile',
      description: 'Save a Playwright test file to the tests directory. The filePath should be relative to the tests directory (e.g., "login.spec.ts"). The content should be valid TypeScript/JavaScript Playwright test code.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path to the test file (e.g., "login.spec.ts" or "auth/login.spec.ts")'
          },
          content: {
            type: 'string',
            description: 'The complete test file content as a string'
          }
        },
        required: ['filePath', 'content']
      },
      execute: async (args: { filePath: string; content: string }) => {
        return await saveTestFile(args.filePath, args.content);
      }
    },
    {
      name: 'runPlaywrightTests',
      description: 'Execute Playwright tests. Optionally provide a single testFile (relative to server/, e.g. "tests/login.spec.ts") to avoid running unrelated failing suites.',
      inputSchema: {
        type: 'object',
        properties: {
          testFile: {
            type: 'string',
            description: 'Optional single test file path relative to server/ (e.g., "tests/login.spec.ts")'
          }
        },
        required: []
      },
      execute: async (args: { testFile?: string }) => {
        return await runPlaywrightTests(args?.testFile);
      }
    },
    {
      name: 'listTestFiles',
      description: 'List all test files that have been generated in the tests directory.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async () => {
        return await listTestFiles();
      }
    }
  ];
}
