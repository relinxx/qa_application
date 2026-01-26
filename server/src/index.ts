import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runAgent, cleanupMCPClient, ErrorCodes } from './agent';
import { AgentRequest, LogMessage } from './types';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '600000', 10); // 10 min default

// Track active requests for cleanup
const activeRequests = new Map<string, { abort: () => void }>();

if (process.env.PORT) {
  console.log(`📌 Using PORT from environment: ${process.env.PORT}`);
} else {
  console.log(`📌 Using default PORT: ${PORT}`);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(REQUEST_TIMEOUT, () => {
    console.error(`Request timeout after ${REQUEST_TIMEOUT / 1000}s`);
  });
  next();
});

// Validate environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable is not set');
  console.error('Please create a .env file with your OpenAI API key');
  process.exit(1);
} else {
  const keyPreview = process.env.OPENAI_API_KEY.substring(0, 8) + '...';
  console.log(`✅ OpenAI API key loaded: ${keyPreview}`);
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit - try to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - try to continue
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start test generation endpoint with SSE
app.post('/api/start-test', async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let isClientConnected = true;
  let agentRunning = false;

  const { url, schema }: AgentRequest = req.body;

  // Validate URL
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ 
      error: 'URL is required and must be a string',
      errorCode: ErrorCodes.INVALID_INPUT 
    });
  }

  if (url.length > 2048) {
    return res.status(400).json({ 
      error: 'URL too long (max 2048 characters)',
      errorCode: ErrorCodes.INVALID_INPUT 
    });
  }

  // Basic URL validation
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ 
        error: 'URL must use http or https protocol',
        errorCode: ErrorCodes.INVALID_INPUT 
      });
    }
  } catch (e) {
    return res.status(400).json({ 
      error: 'Invalid URL format',
      errorCode: ErrorCodes.INVALID_INPUT 
    });
  }

  // Validate schema if provided
  if (schema && typeof schema !== 'string') {
    return res.status(400).json({ 
      error: 'Schema must be a string',
      errorCode: ErrorCodes.INVALID_INPUT 
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Request-Id', requestId);

  // Handle client disconnect
  const cleanup = () => {
    isClientConnected = false;
    activeRequests.delete(requestId);
    if (agentRunning) {
      console.log(`⚠️ Client disconnected during agent run: ${requestId}`);
    }
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);

  // Safe send function that checks connection
  const sendLog = (log: LogMessage) => {
    if (!isClientConnected) return;
    try {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    } catch (error) {
      console.error('Error sending log:', error);
      isClientConnected = false;
    }
  };

  // Track this request
  activeRequests.set(requestId, { abort: cleanup });

  // Keep-alive heartbeat to prevent SSE connection timeout
  const heartbeatInterval = setInterval(() => {
    if (!isClientConnected) {
      clearInterval(heartbeatInterval);
      return;
    }
    try {
      // Send SSE comment as heartbeat (not visible to client but keeps connection alive)
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeatInterval);
      isClientConnected = false;
    }
  }, 5000); // Every 5 seconds - more frequent to handle rate limiter waits

  // Send initial connection message
  sendLog({ 
    type: 'info', 
    message: 'Connected to agent stream',
    timestamp: new Date().toISOString()
  });

  try {
    sendLog({
      type: 'info',
      message: `Starting test generation for URL: ${url}`,
      timestamp: new Date().toISOString()
    });

    agentRunning = true;
    const result = await runAgent(url, schema, sendLog);
    agentRunning = false;
    clearInterval(heartbeatInterval);

    if (!isClientConnected) {
      console.log(`Request ${requestId} completed but client disconnected`);
      return;
    }

    // Send final result
    res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
    res.end();
  } catch (error: any) {
    agentRunning = false;
    clearInterval(heartbeatInterval);
    
    if (!isClientConnected) {
      console.log(`Request ${requestId} errored but client disconnected`);
      return;
    }

    const errorMessage = error.message || 'Unknown error occurred';
    const errorCode = error.code || ErrorCodes.UNKNOWN;

    sendLog({
      type: 'error',
      message: `Fatal error: ${errorMessage}`,
      timestamp: new Date().toISOString()
    });

    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: errorMessage,
      errorCode: errorCode
    })}\n\n`);
    res.end();
  } finally {
    clearInterval(heartbeatInterval);
    activeRequests.delete(requestId);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await cleanupMCPClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await cleanupMCPClient();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 QA_APP Server running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
    console.error(`   This usually means:`);
    console.error(`   1. Another instance of the server is already running`);
    console.error(`   2. Another application is using port ${PORT}`);
    console.error(`\n   Solutions:`);
    console.error(`   - Stop the other process using port ${PORT}`);
    console.error(`   - Or set a different PORT in your .env file`);
    console.error(`   - Or kill the process: npx kill-port ${PORT}`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
