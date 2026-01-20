import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import OpenAI from 'openai';
import { getCustomTools } from './tools';
import { LogMessage } from './types';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || '50', 10);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;

/**
 * Initialize MCP client connection to Playwright MCP server
 */
export async function initializeMCPClient(): Promise<void> {
  if (mcpClient) {
    return; // Already initialized
  }

  try {
    const isWindows = os.platform() === 'win32';
    let npxCommand = 'npx';
    let npxArgs = ['-y', '@playwright/mcp@latest'];
    
    if (isWindows) {
      // On Windows, we need to handle npm/npx differently
      // First, try to find npx.cmd in node_modules/.bin
      const localNpxPath = path.join(__dirname, '..', 'node_modules', '.bin', 'npx.cmd');
      
      if (fs.existsSync(localNpxPath)) {
        npxCommand = localNpxPath;
        console.log(`✅ Found local npx at: ${localNpxPath}`);
      } else {
        // Try to find npm in the system
        let npmFound = false;
        
        // Method 1: Try to find npm relative to node executable (most reliable)
        try {
          const nodeDir = path.dirname(process.execPath);
          const npmPath = path.join(nodeDir, 'npm.cmd');
          if (fs.existsSync(npmPath)) {
            npxCommand = 'cmd.exe';
            npxArgs = ['/c', npmPath, 'exec', '-y', '@playwright/mcp@latest'];
            console.log(`✅ Using npm from node directory: ${npmPath}`);
            npmFound = true;
          }
        } catch (e) {
          // Continue to next method
        }
        
        // Method 2: Try to find npm using where command
        if (!npmFound) {
          try {
            const npmPath = execSync('where npm.cmd', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
              .trim()
              .split('\n')[0]
              .trim();
            if (npmPath && fs.existsSync(npmPath)) {
              npxCommand = 'cmd.exe';
              npxArgs = ['/c', 'npm.cmd', 'exec', '-y', '@playwright/mcp@latest'];
              console.log(`✅ Found npm via where command: ${npmPath}`);
              npmFound = true;
            }
          } catch (e) {
            // Continue to fallback
          }
        }
        
        // Method 3: Fallback - use cmd.exe with npm.cmd (assumes it's in PATH)
        if (!npmFound) {
          npxCommand = 'cmd.exe';
          npxArgs = ['/c', 'npm.cmd', 'exec', '-y', '@playwright/mcp@latest'];
          console.log(`⚠️  Using npm.cmd via cmd.exe (assuming it's in PATH)`);
        }
      }
    }

    console.log(`🔧 Initializing MCP client with: ${npxCommand} ${npxArgs.join(' ')}`);

    mcpTransport = new StdioClientTransport({
      command: npxCommand,
      args: npxArgs
    });

    mcpClient = new Client({
      name: 'qa-app-host',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await mcpClient.connect(mcpTransport);
    console.log('MCP client connected successfully');
  } catch (error: any) {
    console.error('Failed to initialize MCP client:', error);
    throw new Error(`MCP initialization failed: ${error.message}`);
  }
}

/**
 * Get all available tools (MCP + custom)
 */
async function getAllTools() {
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }

  const mcpTools = await mcpClient.listTools();
  const customTools = getCustomTools();

  // Combine MCP tools with custom tools
  const allTools = [
    ...mcpTools.tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    })),
    ...customTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))
  ];

  return { allTools, customTools };
}

/**
 * Execute a tool call (either MCP or custom)
 */
async function executeTool(
  toolName: string,
  args: any,
  customTools: ReturnType<typeof getCustomTools>
): Promise<any> {
  // Check if it's a custom tool
  const customTool = customTools.find(t => t.name === toolName);
  if (customTool) {
    return await customTool.execute(args);
  }

  // Otherwise, execute via MCP
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }

  return await mcpClient.callTool({
    name: toolName,
    arguments: args
  });
}

/**
 * Run the agent loop to explore a website and generate tests
 */
export async function runAgent(
  targetUrl: string,
  schema: string | undefined,
  onLog: (log: LogMessage) => void
): Promise<{ success: boolean; message?: string; testFiles?: string[]; error?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // Initialize MCP client if not already done
  await initializeMCPClient();

  const { allTools, customTools } = await getAllTools();

  const isSauceDemo = /saucedemo\.com/i.test(targetUrl);

  // Build system prompt
  const systemPrompt = `You are an expert QA Engineer AI agent with full autonomy. Your task is to AUTOMATICALLY discover, analyze, and test websites without manual test step input.

PHASE 1: AUTONOMOUS SITE DISCOVERY
1. Navigate to the provided URL using Playwright MCP tools (browser_navigate, Maps, etc.)
2. Systematically explore the site structure:
   - Map all pages/routes you can access (home, login, product pages, checkout, etc.)
   - Identify all interactive elements (buttons, forms, links, inputs, dropdowns)
   - Document the site's "schema" - what features exist, what flows are possible
   - Use Maps tool to get page structure, click tool to navigate, screenshot tool to understand UI
3. Analyze user flows automatically:
   - What are the critical user journeys? (e.g., login → browse → add to cart → checkout)
   - What are the error scenarios? (e.g., invalid login, empty forms, locked accounts)
   - What are the edge cases? (e.g., slow loading, broken images, network issues)

PHASE 2: AUTONOMOUS TEST GENERATION
4. Based on your discovery, automatically derive comprehensive test scenarios:
   - For each critical user flow, create a test case
   - Include positive paths (happy flows), negative paths (errors), and edge cases
   - No manual test steps needed - YOU figure out what to test based on what you discovered
5. Write Playwright test suites that cover these automatically-discovered flows
6. Save the test files using the saveTestFile tool (use unique filenames with timestamps)
7. Run the tests using runPlaywrightTests tool (prefer running only the file you just created to avoid unrelated failing suites)

${schema ? `\nAdditional context: The user provided a Swagger/OpenAPI schema:\n${schema}\n` : ''}

${isSauceDemo ? `
SauceDemo requirements (must-do):
- Create an end-to-end purchase flow test that covers: login (standard_user/secret_sauce) → add any item to cart → cart → checkout → fill checkout info (random values ok) → continue → finish.
- Also create a negative login test for locked_out_user that asserts the locked-out error.
- Use SauceDemo selectors (prefer data-test selectors like [data-test="username"], [data-test="password"], [data-test="login-button"], [data-test="checkout"], etc.).
- Save tests with a UNIQUE filename per run (include a timestamp), e.g. "saucedemo-e2e-YYYYMMDD-HHMMSS.spec.ts", to avoid overwriting prior runs.
- After saving, call runPlaywrightTests with testFile pointing to ONLY the generated spec, e.g. runPlaywrightTests({ "testFile": "tests/saucedemo-e2e-....spec.ts" }).
` : ''}

AUTONOMOUS DISCOVERY GUIDELINES:
- Be thorough: Explore multiple pages, try different navigation paths, click through menus
- Be systematic: Map out the site structure BEFORE writing tests - understand what exists first
- Be intelligent: Identify patterns (e.g., if you see a login form, check for registration, password reset, etc.)
- Use Playwright MCP tools extensively: Maps (to understand page structure), click (to navigate), screenshot (to verify UI state)
- Document your findings: As you explore, mentally map out what test scenarios make sense
- Avoid excessive back navigation:
  - Do not call browser_navigate_back more than 2 times in a row.
  - Prefer direct navigation (browser_navigate) or clicking explicit links/buttons.

TEST GENERATION GUIDELINES:
- Write well-structured, maintainable test code based on your discoveries
- Include proper test descriptions explaining what flow you're testing
- Use robust selectors (prefer data-test attributes, stable IDs, or semantic selectors)
- Include proper waits and assertions based on what you observed during exploration
- Save tests with descriptive filenames (e.g., "login.spec.ts", "checkout-flow.spec.ts")
- Test files should be valid TypeScript Playwright test code
- In generated Playwright tests, proactively handle unexpected browser dialogs/modals:
  - Register a dialog handler: page.on('dialog', d => d.accept())
  - If an in-page modal appears with an "OK" button (e.g., change-password prompts), click OK before continuing
- After writing tests, run them to verify they work

When you're done, respond in STRICT JSON (no markdown, no prose) using this schema:
{
  "summary": string,
  "generatedFiles": string[],
  "commandsRun": string[],
  "results": { "status": "passed" | "failed" | "unknown", "details": string },
  "nextSteps": string[]
}
`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: `Test this URL: ${targetUrl}

Your task is FULLY AUTONOMOUS:
1. First, EXPLORE the site systematically - map out its structure, pages, and features
2. Then, AUTOMATICALLY identify what test scenarios make sense based on what you discovered
3. Finally, GENERATE and RUN comprehensive Playwright tests covering those scenarios

No manual test steps needed - discover everything yourself and figure out what to test.${isSauceDemo ? '\n\nNote: This is SauceDemo - if you discover login functionality, test multiple user personas. If you discover a shopping cart, test the full purchase flow.' : ''}`
    }
  ];

  let iterations = 0;
  let consecutiveNavigateBack = 0;

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      onLog({
        type: 'agent',
        message: `Agent iteration ${iterations}: Thinking...`,
        timestamp: new Date().toISOString()
      });

      // Call OpenAI with current messages and available tools
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: messages,
        tools: allTools,
        tool_choice: 'auto'
      });

      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);

      // If no tool calls, agent is done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const rawFinal = assistantMessage.content || 'Agent completed successfully.';

        // Try to parse the model's final JSON for a clean, formatted summary.
        let formattedSummary = rawFinal;
        try {
          const parsed = JSON.parse(rawFinal);
          formattedSummary =
            `Summary: ${parsed.summary}\n` +
            `GeneratedFiles: ${(parsed.generatedFiles || []).join(', ') || 'none'}\n` +
            `CommandsRun: ${(parsed.commandsRun || []).join(', ') || 'none'}\n` +
            `Results: ${parsed.results?.status || 'unknown'} - ${parsed.results?.details || ''}\n` +
            `NextSteps: ${(parsed.nextSteps || []).join(' | ') || 'none'}`;
        } catch {
          // Keep raw text as fallback.
        }

        onLog({
          type: 'success',
          message: `Agent completed:\n${formattedSummary}`,
          timestamp: new Date().toISOString()
        });

        // Get list of test files
        const { listTestFiles: getTestFiles } = await import('./tools');
        const testFilesResult = await getTestFiles();
        const testFiles = testFilesResult.success && testFilesResult.result?.files
          ? testFilesResult.result.files
          : [];

        return {
          success: true,
          message: formattedSummary,
          testFiles: testFiles
        };
      }

      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: any;
        
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          toolArgs = {};
        }

        onLog({
          type: 'info',
          message: `Executing tool: ${toolName}${toolArgs.filePath ? ` (${toolArgs.filePath})` : ''}`,
          timestamp: new Date().toISOString()
        });

        try {
          // Guard: prevent infinite/invalid back navigation loops (common cause of "history exhausted").
          if (toolName === 'browser_navigate_back') {
            consecutiveNavigateBack += 1;
            if (consecutiveNavigateBack > 2) {
              const msg =
                'Blocked browser_navigate_back: navigation history likely exhausted. ' +
                'Instead, navigate using explicit URLs (browser_navigate) or click links/buttons.';
              onLog({ type: 'warning', message: msg, timestamp: new Date().toISOString() });
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ success: false, error: msg })
              });
              continue;
            }
          } else {
            consecutiveNavigateBack = 0;
          }

          const toolResult = await executeTool(toolName, toolArgs, customTools);
          
          // Format result for LLM
          const resultContent = typeof toolResult === 'string' 
            ? toolResult 
            : JSON.stringify(toolResult, null, 2);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultContent
          });

          // Log success
          if (toolName === 'saveTestFile' && toolResult.success) {
            onLog({
              type: 'success',
              message: `✓ Test file saved: ${toolArgs.filePath}`,
              timestamp: new Date().toISOString()
            });
          } else if (toolName === 'runPlaywrightTests') {
            onLog({
              type: toolResult.success ? 'success' : 'warning',
              message: `Test execution ${toolResult.success ? 'completed' : 'failed'}`,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error: any) {
          const errorMessage = `Tool execution failed: ${error.message}`;
          onLog({
            type: 'error',
            message: errorMessage,
            timestamp: new Date().toISOString()
          });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: errorMessage })
          });
        }
      }
    }

    // Max iterations reached
    return {
      success: false,
      error: `Agent reached maximum iterations (${MAX_ITERATIONS})`
    };
  } catch (error: any) {
    onLog({
      type: 'error',
      message: `Agent error: ${error.message}`,
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cleanup MCP client connection
 */
export async function cleanupMCPClient(): Promise<void> {
  if (mcpTransport) {
    try {
      await mcpTransport.close();
    } catch (error) {
      console.error('Error closing MCP transport:', error);
    }
    mcpTransport = null;
  }
  mcpClient = null;
}

