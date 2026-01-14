# QA_APP - Automated QA Agent

A web-based application that uses the **Model Context Protocol (MCP)** to orchestrate an AI agent. The agent navigates websites using Playwright, detects user flows, writes test suites, and executes them autonomously.

## Architecture

- **Frontend**: Next.js + React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Protocol**: Model Context Protocol (MCP) SDK
- **AI**: OpenAI GPT-4o
- **Testing**: Playwright

## Prerequisites

- Node.js 18+ and npm
- OpenAI API key
- Playwright browsers (installed automatically)

## Setup Instructions

### 1. Backend Setup

```bash
cd server
npm install
npx playwright install
```

Create a `.env` file in the `server/` directory:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
OPENAI_MODEL=gpt-4o
MAX_ITERATIONS=50
```

### 2. Frontend Setup

```bash
cd client
npm install
```

### 3. Running the Application

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

The backend will start on `http://localhost:3001`

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```

The frontend will start on `http://localhost:3000`

### 4. Usage

1. Open `http://localhost:3000` in your browser
2. Enter a target URL (e.g., `https://demo.realworld.io`)
3. Optionally upload or paste a Swagger/OpenAPI schema
4. Click "Start Test Generation"
5. Watch the agent console as it:
   - Navigates the website
   - Discovers user flows
   - Writes Playwright tests
   - Executes the tests

## Project Structure

```
QA_Application_DEMO/
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── index.ts       # Express server
│   │   ├── agent.ts       # MCP client & agent loop
│   │   ├── tools.ts       # Custom tools
│   │   └── types.ts       # TypeScript types
│   ├── tests/             # Generated test files
│   └── package.json
├── client/                # Next.js frontend
│   ├── src/
│   │   ├── app/           # Next.js app directory
│   │   ├── components/    # React components
│   │   └── lib/           # API client
│   └── package.json
└── README.md
```

## How It Works

1. **User Input**: User provides a URL (and optionally a Swagger schema)
2. **MCP Connection**: Backend connects to Playwright MCP server
3. **Agent Loop**: 
   - LLM receives context and available tools
   - LLM decides which tool to call (navigate, click, screenshot, etc.)
   - Tool executes via MCP or custom tools
   - Results fed back to LLM
   - Process repeats until tests are written
4. **Test Generation**: Agent writes Playwright test files to `server/tests/`
5. **Test Execution**: Agent can run tests and report results
6. **Real-time Updates**: All actions stream to frontend via SSE

## Custom Tools

The agent has access to:

- **Playwright MCP Tools**: `Maps`, `click`, `screenshot`, `fill`, etc.
- **Custom Tools**:
  - `saveTestFile`: Save Playwright test files
  - `runPlaywrightTests`: Execute tests
  - `listTestFiles`: List generated test files

## Security Considerations

- URLs are validated before processing
- File paths are sanitized to prevent directory traversal
- Environment variables for sensitive data
- Rate limiting recommended for production

## Troubleshooting

### MCP Server Connection Issues
- Ensure `npx` can access `@playwright/mcp@latest`
- Check network connectivity

### OpenAI API Errors
- Verify `OPENAI_API_KEY` is set correctly
- Check API quota and billing

### Playwright Installation
- Run `npx playwright install` in the `server/` directory
- Ensure system dependencies are installed

## License

ISC
