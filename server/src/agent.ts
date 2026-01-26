import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import OpenAI from 'openai';
import { getCustomTools } from './tools';
import { LogMessage } from './types';
import { getRateLimiter } from './rateLimiter';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || '50', 10);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const TOKENS_PER_MINUTE = parseInt(process.env.TOKENS_PER_MINUTE || '25000', 10);
const TOOL_TIMEOUT_MS = 60000; // 60s timeout for tool execution
const MAX_TOOL_RESULT_LENGTH = 4000; // Truncate large tool results
const MAX_MESSAGES_HISTORY = 30; // Keep last N messages to prevent token explosion

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let mcpInitializing = false;

/**
 * Truncate tool result to reduce token usage
 */
function truncateToolResult(result: any, toolName: string): string {
  let content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  
  // Special handling for browser_snapshot - extract key info only
  if (toolName === 'browser_snapshot' && typeof result === 'object') {
    try {
      const summary: any = {
        url: result.url || 'unknown',
        title: result.title || 'unknown'
      };
      // If there's content array, extract just the text descriptions
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text?.substring(0, 500))
          .join('\n')
          .substring(0, 2000);
        summary.pageContent = textContent;
      }
      content = JSON.stringify(summary, null, 2);
    } catch {
      // Fallback to truncation
    }
  }
  
  if (content.length > MAX_TOOL_RESULT_LENGTH) {
    return content.substring(0, MAX_TOOL_RESULT_LENGTH) + '\n... [truncated for token efficiency]';
  }
  return content;
}

/**
 * Create human-readable summary of tool execution for console
 */
function summarizeToolExecution(toolName: string, args: any, result: any): string {
  switch (toolName) {
    case 'browser_navigate':
      return `🌐 Navigated to: ${args.url}`;
    case 'browser_click':
      return `🖱️ Clicked: ${args.element || args.selector || 'element'}`;
    case 'browser_fill':
    case 'browser_type':
      const maskedValue = args.text?.includes('password') || args.name?.includes('password') 
        ? '****' 
        : (args.text || args.value || '').substring(0, 30);
      return `⌨️ Typed "${maskedValue}" into ${args.element || args.selector || 'field'}`;
    case 'browser_snapshot':
      const pageInfo = result?.title || result?.url || 'page captured';
      return `📸 Snapshot taken: ${pageInfo}`;
    case 'browser_scroll':
      return `📜 Scrolled ${args.direction || 'down'}`;
    case 'browser_hover':
      return `👆 Hovered over: ${args.element || args.selector || 'element'}`;
    case 'browser_select_option':
      return `📝 Selected option: ${args.value || args.label}`;
    case 'browser_press_key':
      return `⌨️ Pressed key: ${args.key}`;
    case 'browser_close':
      return `🔒 Browser closed`;
    case 'saveTestFile':
      return `💾 Saved test file: ${args.filePath}`;
    case 'runPlaywrightTests':
      const status = result?.success ? '✅ PASSED' : '❌ FAILED';
      return `🧪 Tests executed: ${status}`;
    case 'listTestFiles':
      const count = result?.result?.files?.length || 0;
      return `📁 Found ${count} test files`;
    default:
      return `⚙️ ${toolName} completed`;
  }
}

/**
 * Manage message history to prevent token explosion
 */
function pruneMessageHistory(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
  if (messages.length <= MAX_MESSAGES_HISTORY + 2) return; // +2 for system + initial user msg
  
  // Keep system message (first), initial user message (second), and last N messages
  const systemMsg = messages[0];
  const initialUserMsg = messages[1];
  const recentMessages = messages.slice(-MAX_MESSAGES_HISTORY);
  
  // Clear and rebuild
  messages.length = 0;
  messages.push(systemMsg, initialUserMsg, ...recentMessages);
}

// Custom error types for better error handling
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export const ErrorCodes = {
  MCP_INIT_FAILED: 'MCP_INIT_FAILED',
  MCP_CONNECTION_LOST: 'MCP_CONNECTION_LOST',
  OPENAI_AUTH_ERROR: 'OPENAI_AUTH_ERROR',
  OPENAI_RATE_LIMIT: 'OPENAI_RATE_LIMIT',
  OPENAI_API_ERROR: 'OPENAI_API_ERROR',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  MAX_ITERATIONS: 'MAX_ITERATIONS',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN: 'UNKNOWN'
} as const;

/**
 * Initialize MCP client connection to Playwright MCP server
 */
export async function initializeMCPClient(retryCount = 0): Promise<void> {
  const MAX_RETRIES = 3;
  
  if (mcpClient) {
    // Verify connection is still alive
    try {
      await mcpClient.listTools();
      return; // Connection is good
    } catch {
      console.log('⚠️ MCP connection lost, reconnecting...');
      await cleanupMCPClient();
    }
  }

  if (mcpInitializing) {
    // Wait for ongoing initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (mcpClient) return;
  }

  mcpInitializing = true;

  try {
    const isWindows = os.platform() === 'win32';
    let npxCommand = 'npx';
    let npxArgs = ['-y', '@playwright/mcp@latest'];
    
    if (isWindows) {
      const localNpxPath = path.join(__dirname, '..', 'node_modules', '.bin', 'npx.cmd');
      
      if (fs.existsSync(localNpxPath)) {
        npxCommand = localNpxPath;
        console.log(`✅ Found local npx at: ${localNpxPath}`);
      } else {
        let npmFound = false;
        
        try {
          const nodeDir = path.dirname(process.execPath);
          const npmPath = path.join(nodeDir, 'npm.cmd');
          if (fs.existsSync(npmPath)) {
            npxCommand = 'cmd.exe';
            npxArgs = ['/c', npmPath, 'exec', '-y', '@playwright/mcp@latest'];
            console.log(`✅ Using npm from node directory: ${npmPath}`);
            npmFound = true;
          }
        } catch (e) { /* continue */ }
        
        if (!npmFound) {
          try {
            const npmPath = execSync('where npm.cmd', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
              .trim().split('\n')[0].trim();
            if (npmPath && fs.existsSync(npmPath)) {
              npxCommand = 'cmd.exe';
              npxArgs = ['/c', 'npm.cmd', 'exec', '-y', '@playwright/mcp@latest'];
              npmFound = true;
            }
          } catch (e) { /* continue */ }
        }
        
        if (!npmFound) {
          npxCommand = 'cmd.exe';
          npxArgs = ['/c', 'npm.cmd', 'exec', '-y', '@playwright/mcp@latest'];
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

    // Add timeout to connection
    const connectPromise = mcpClient.connect(mcpTransport);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('MCP connection timeout')), 30000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    console.log('✅ MCP client connected successfully');
    mcpInitializing = false;
  } catch (error: any) {
    mcpInitializing = false;
    await cleanupMCPClient();
    
    if (retryCount < MAX_RETRIES) {
      console.log(`⚠️ MCP init failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return initializeMCPClient(retryCount + 1);
    }
    
    throw new AgentError(
      `MCP initialization failed after ${MAX_RETRIES} attempts: ${error.message}`,
      ErrorCodes.MCP_INIT_FAILED,
      false,
      { originalError: error.message }
    );
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
 * Execute with timeout wrapper
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AgentError(
        `${operation} timed out after ${timeoutMs / 1000}s`,
        ErrorCodes.TOOL_TIMEOUT,
        true
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
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
    try {
      return await withTimeout(
        customTool.execute(args),
        TOOL_TIMEOUT_MS,
        `Custom tool "${toolName}"`
      );
    } catch (error: any) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(
        `Custom tool "${toolName}" failed: ${error.message}`,
        ErrorCodes.TOOL_EXECUTION_FAILED,
        true,
        { tool: toolName, args }
      );
    }
  }

  // Otherwise, execute via MCP
  if (!mcpClient) {
    throw new AgentError(
      'MCP client not initialized',
      ErrorCodes.MCP_CONNECTION_LOST,
      true
    );
  }

  try {
    const result = await withTimeout(
      mcpClient.callTool({ name: toolName, arguments: args }),
      TOOL_TIMEOUT_MS,
      `MCP tool "${toolName}"`
    );

    // Check if MCP returned an error in the result
    if (result && typeof result === 'object') {
      if ('content' in result && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (item.type === 'text' && item.text) {
            const text = item.text;
            // Only throw on critical errors, not just mentions of "error"
            if (text.startsWith('Error:') || text.includes('Unknown error') || 
                text.includes('failed to') || text.includes('cannot find')) {
              throw new AgentError(text, ErrorCodes.TOOL_EXECUTION_FAILED, true, { tool: toolName });
            }
          }
        }
      }
      if ('isError' in result && result.isError) {
        const resultAny = result as any;
        const errorMsg = (Array.isArray(resultAny.content) && resultAny.content[0]?.text) 
          || resultAny.message 
          || 'Unknown error from MCP tool';
        throw new AgentError(errorMsg, ErrorCodes.TOOL_EXECUTION_FAILED, true, { tool: toolName });
      }
    }

    return result;
  } catch (error: any) {
    if (error instanceof AgentError) throw error;
    
    // Check for connection issues
    if (error.message?.includes('connection') || error.message?.includes('EPIPE')) {
      throw new AgentError(
        `MCP connection lost during "${toolName}"`,
        ErrorCodes.MCP_CONNECTION_LOST,
        true,
        { tool: toolName }
      );
    }
    
    throw new AgentError(
      `MCP tool "${toolName}" failed: ${error.message || 'Unknown error'}`,
      ErrorCodes.TOOL_EXECUTION_FAILED,
      true,
      { tool: toolName, originalError: error.message }
    );
  }
}

/**
 * Classify OpenAI API errors
 */
function classifyOpenAIError(error: any): AgentError {
  const message = error.message || error.toString();
  const status = error.status || error.statusCode;

  if (status === 401 || message.includes('Invalid API key') || message.includes('Incorrect API key')) {
    return new AgentError(
      'OpenAI API key is invalid. Please check your OPENAI_API_KEY.',
      ErrorCodes.OPENAI_AUTH_ERROR,
      false
    );
  }

  if (status === 429 || message.includes('rate limit') || message.includes('Rate limit')) {
    return new AgentError(
      'OpenAI rate limit exceeded. Waiting and retrying...',
      ErrorCodes.OPENAI_RATE_LIMIT,
      true
    );
  }

  if (status === 400 && message.includes('model')) {
    return new AgentError(
      `Invalid model: ${OPENAI_MODEL}. Check your OPENAI_MODEL setting.`,
      ErrorCodes.OPENAI_API_ERROR,
      false
    );
  }

  if (status === 503 || message.includes('overloaded')) {
    return new AgentError(
      'OpenAI service is overloaded. Retrying...',
      ErrorCodes.OPENAI_API_ERROR,
      true
    );
  }

  return new AgentError(
    `OpenAI API error: ${message}`,
    ErrorCodes.OPENAI_API_ERROR,
    status >= 500 // Server errors are recoverable
  );
}

/**
 * Run the agent loop to explore a website and generate tests
 */
export async function runAgent(
  targetUrl: string,
  schema: string | undefined,
  onLog: (log: LogMessage) => void
): Promise<{ success: boolean; message?: string; testFiles?: string[]; error?: string; errorCode?: string }> {
  // Validate inputs
  if (!targetUrl || typeof targetUrl !== 'string') {
    return {
      success: false,
      error: 'Invalid URL: URL is required',
      errorCode: ErrorCodes.INVALID_INPUT
    };
  }

  try {
    new URL(targetUrl);
  } catch {
    return {
      success: false,
      error: `Invalid URL format: ${targetUrl}`,
      errorCode: ErrorCodes.INVALID_INPUT
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      success: false,
      error: 'OPENAI_API_KEY environment variable is not set',
      errorCode: ErrorCodes.OPENAI_AUTH_ERROR
    };
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // Initialize rate limiter with SSE logger
  const rateLimiter = getRateLimiter({
    tokensPerMinute: TOKENS_PER_MINUTE,
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 60000
  });
  
  // Wire up rate limiter to send logs to SSE stream
  rateLimiter.setLogger((message: string) => {
    onLog({
      type: 'info',
      message: message,
      timestamp: new Date().toISOString()
    });
  });

  // Initialize MCP client if not already done
  await initializeMCPClient();

  const { allTools, customTools } = await getAllTools();

  const isSauceDemo = /saucedemo\.com/i.test(targetUrl);

  // Build optimized system prompt (reduced token usage)
  const systemPrompt = `You are a QA Engineer AI agent. AUTOMATICALLY discover and test websites.

PHASE 1: DISCOVERY
1. Navigate using browser_navigate
2. Map pages and interactive elements
3. Identify critical user flows

PHASE 2: TEST GENERATION
4. Write Playwright test suites
5. Save with saveTestFile (timestamped filenames)
6. Run with runPlaywrightTests

${schema ? `\nSchema:\n${schema}\n` : ''}
${isSauceDemo ? `SauceDemo: Test purchase flow (standard_user/secret_sauce) and locked_out_user. Use data-test selectors.` : ''}

CRITICAL RULES:
- MODAL/POPUP HANDLING: After login or any action, CHECK for modal dialogs (password change, alerts, etc). If you see a modal with OK/Cancel/Close button, CLICK IT FIRST before doing anything else. Look for elements like: button containing "OK", "Close", "Cancel", "Dismiss", "Continue", or X icons.
- If clicks fail repeatedly, a modal is likely blocking - take a snapshot and look for dismiss buttons.
- Max 2 consecutive browser_navigate_back calls
- Use data-test selectors when available
- In tests: page.on('dialog', d => d.accept())
- WHEN FINISHED: Call browser_close to close the browser window

Response format (STRICT JSON):
{
  "summary": string,
  "generatedFiles": string[],
  "commandsRun": string[],
  "results": { "status": "passed"|"failed"|"unknown", "details": string },
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
  let consecutiveFailedClicks = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  // Helper to close browser and cleanup
  const cleanup = async () => {
    // Clear rate limiter logger
    rateLimiter.setLogger(null);
    
    // Close browser
    try {
      if (mcpClient) {
        await withTimeout(
          mcpClient.callTool({ name: 'browser_close', arguments: {} }),
          5000,
          'browser_close'
        );
        onLog({ type: 'info', message: 'Browser closed', timestamp: new Date().toISOString() });
      }
    } catch (e) {
      // Browser may already be closed - that's ok
    }
  };

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Estimate tokens for this request
      const estimatedTokens = estimateRequestTokens(messages, allTools);
      const stats = rateLimiter.getTokenStats();
      
      onLog({
        type: 'agent',
        message: `Agent iteration ${iterations}/${MAX_ITERATIONS} | Messages: ${messages.length} | Est. tokens: ${estimatedTokens.toLocaleString()}`,
        timestamp: new Date().toISOString()
      });

      // Call OpenAI with rate limiting and retry logic
      let response;
      try {
        response = await rateLimiter.executeWithRateLimit(
          async () => {
            return await openai.chat.completions.create({
              model: OPENAI_MODEL,
              messages: messages,
              tools: allTools,
              tool_choice: 'auto'
            });
          },
          estimatedTokens,
          1
        );
        consecutiveErrors = 0; // Reset on success
      } catch (error: any) {
        const classifiedError = classifyOpenAIError(error);
        
        if (!classifiedError.recoverable) {
          await cleanup();
          return {
            success: false,
            error: classifiedError.message,
            errorCode: classifiedError.code
          };
        }

        consecutiveErrors++;
        onLog({
          type: 'warning',
          message: `OpenAI error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${classifiedError.message}`,
          timestamp: new Date().toISOString()
        });

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          await cleanup();
          return {
            success: false,
            error: `Too many consecutive errors: ${classifiedError.message}`,
            errorCode: classifiedError.code
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * consecutiveErrors));
        continue;
      }

      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);

      // Prune message history to prevent token explosion
      pruneMessageHistory(messages);

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

        // Close browser
        await cleanup();

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
          // Guard: prevent infinite/invalid back navigation loops
          if (toolName === 'browser_navigate_back') {
            consecutiveNavigateBack += 1;
            if (consecutiveNavigateBack > 2) {
              const msg = 'Blocked: navigation history exhausted. Use browser_navigate with explicit URL instead.';
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

          let toolResult;
          try {
            toolResult = await executeTool(toolName, toolArgs, customTools);
          } catch (toolError: any) {
            // Handle MCP connection loss - try to reconnect
            if (toolError.code === ErrorCodes.MCP_CONNECTION_LOST) {
              onLog({ type: 'warning', message: 'MCP connection lost, reconnecting...', timestamp: new Date().toISOString() });
              try {
                await cleanupMCPClient();
                await initializeMCPClient();
                // Retry the tool call once
                toolResult = await executeTool(toolName, toolArgs, customTools);
              } catch (reconnectError: any) {
                throw reconnectError;
              }
            } else {
              throw toolError;
            }
          }

          // Track click failures to detect modal blocking
          if (toolName === 'browser_click' || toolName === 'browser_press_key') {
            const resultStr = JSON.stringify(toolResult);
            if (resultStr.includes('error') || resultStr.includes('Error') || resultStr.includes('failed')) {
              consecutiveFailedClicks++;
              if (consecutiveFailedClicks >= 3) {
                // Likely stuck on a modal - inject hint to agent
                onLog({ type: 'warning', message: 'Multiple click failures detected - possible modal blocking', timestamp: new Date().toISOString() });
                messages.push({
                  role: 'user',
                  content: 'SYSTEM: Multiple clicks failed. A modal/popup may be blocking. Take a browser_snapshot and look for modal dismiss buttons (OK, Close, Cancel, X, Continue, Dismiss). Click the dismiss button before continuing.'
                });
                consecutiveFailedClicks = 0;
              }
            } else {
              consecutiveFailedClicks = 0;
            }
          } else if (toolName !== 'browser_snapshot') {
            consecutiveFailedClicks = 0;
          }
          
          // Format result for LLM (truncated to save tokens)
          const resultContent = truncateToolResult(toolResult, toolName);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultContent
          });

          // Log human-readable summary to console
          const summary = summarizeToolExecution(toolName, toolArgs, toolResult);
          const logType = toolName === 'runPlaywrightTests' && !toolResult?.success ? 'warning' : 
                         toolName === 'saveTestFile' || toolName === 'runPlaywrightTests' ? 'success' : 'info';
          onLog({
            type: logType,
            message: summary,
            timestamp: new Date().toISOString()
          });
        } catch (error: any) {
          const isAgentError = error instanceof AgentError;
          const errorCode = isAgentError ? error.code : ErrorCodes.TOOL_EXECUTION_FAILED;
          const errorMessage = error.message || 'Unknown tool error';
          
          onLog({
            type: 'error',
            message: `Tool "${toolName}" failed: ${errorMessage}`,
            timestamp: new Date().toISOString()
          });

          // For non-recoverable errors, fail fast
          if (isAgentError && !error.recoverable) {
            await cleanup();
            return {
              success: false,
              error: errorMessage,
              errorCode: errorCode
            };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ 
              error: errorMessage,
              recoverable: isAgentError ? error.recoverable : true
            })
          });
        }
      }
    }

    // Max iterations reached - close browser
    await cleanup();
    onLog({
      type: 'warning',
      message: `Agent stopped: reached maximum iterations (${MAX_ITERATIONS})`,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: false,
      error: `Agent reached maximum iterations (${MAX_ITERATIONS}). Consider increasing MAX_ITERATIONS or simplifying the task.`,
      errorCode: ErrorCodes.MAX_ITERATIONS
    };
  } catch (error: any) {
    // Close browser on error
    await cleanup();
    
    const isAgentError = error instanceof AgentError;
    const errorCode = isAgentError ? error.code : ErrorCodes.UNKNOWN;
    const errorMessage = error.message || 'Unknown error occurred';
    
    onLog({
      type: 'error',
      message: `Agent error: ${errorMessage}`,
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: errorMessage,
      errorCode: errorCode
    };
  }
}

/**
 * Estimate tokens for a request (rough approximation)
 */
function estimateRequestTokens(messages: any[], tools?: any[]): number {
  let tokens = 0;
  
  // Count message tokens (rough estimate: 1 token ≈ 4 characters)
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      tokens += Math.ceil(msg.content.length / 4);
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text' && item.text) {
          tokens += Math.ceil(item.text.length / 4);
        }
      }
    }
  }

  // Add tool definitions (rough estimate)
  if (tools && tools.length > 0) {
    tokens += tools.length * 100; // ~100 tokens per tool definition
  }

  // Add overhead for API structure
  tokens += 50;

  return tokens;
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

