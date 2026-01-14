# Quick Setup Guide

## Prerequisites Check

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] OpenAI API key (get from https://platform.openai.com/api-keys)

## Step-by-Step Setup

### 1. Backend Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Install Playwright browsers
npm run playwright:install

# Create .env file (copy the template below)
# Windows: copy .env.example .env
# Linux/Mac: cp .env.example .env
```

Edit `.env` file:
```env
OPENAI_API_KEY=sk-your-actual-key-here
PORT=3001
OPENAI_MODEL=gpt-4o
MAX_ITERATIONS=50
```

### 2. Frontend Setup

```bash
# Navigate to client directory
cd ../client

# Install dependencies
npm install
```

### 3. Start the Application

**Terminal 1 - Start Backend:**
```bash
cd server
npm run dev
```

You should see:
```
🚀 QA_APP Server running on http://localhost:3001
📝 Health check: http://localhost:3001/health
```

**Terminal 2 - Start Frontend:**
```bash
cd client
npm run dev
```

You should see:
```
- ready started server on 0.0.0.0:3000
- Local: http://localhost:3000
```

### 4. Test the Application

1. Open http://localhost:3000 in your browser
2. Enter a test URL: `https://demo.realworld.io`
3. Click "Start Test Generation"
4. Watch the agent console for real-time updates

## Troubleshooting

### Backend won't start
- Check that `.env` file exists and has `OPENAI_API_KEY`
- Verify port 3001 is not in use
- Check Node.js version: `node --version` (should be 18+)

### Frontend won't start
- Check port 3000 is not in use
- Verify all dependencies installed: `npm install`

### MCP Connection Issues
- Ensure `npx` works: `npx --version`
- Check internet connection (needs to download @playwright/mcp)
- Try manually: `npx -y @playwright/mcp@latest`

### OpenAI API Errors
- Verify API key is correct
- Check API quota/billing at https://platform.openai.com/usage
- Ensure you have credits available

## Next Steps

- Review generated test files in `server/tests/`
- Run tests manually: `cd server && npx playwright test`
- Customize agent behavior in `server/src/agent.ts`
