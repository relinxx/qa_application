# Quick Setup Guide

## Prerequisites Check

- [ ] Node.js 18+ installed (`node --version`) - Recommended: **20.11.0**
- [ ] npm installed (`npm --version`)
- [ ] OpenAI API key (get from https://platform.openai.com/api-keys)

---

## 🔧 Environment Isolation (Recommended)

This project pins Node.js version to ensure consistent behavior across machines.

### Option 1: Volta (Best for Windows)

```powershell
# Install Volta (run PowerShell as Administrator)
winget install Volta.Volta

# Restart terminal, then navigate to project
cd qa_application

# Volta automatically installs and uses the pinned Node version
node --version  # Should show v20.11.0
```

### Option 2: fnm (Fast Node Manager)

```powershell
# Install fnm
winget install Schniz.fnm

# Add to PowerShell profile (run once)
fnm env --use-on-cd | Out-String | Invoke-Expression

# Restart terminal
cd qa_application
fnm install    # Reads .nvmrc
fnm use        # Switches to project's Node version
```

### Option 3: nvm-windows

```powershell
# Download from: https://github.com/coreybutler/nvm-windows/releases
nvm install 20.11.0
nvm use 20.11.0
```

---

## Automated Setup (Recommended)

```bash
cd qa_application
npm run setup
```

This will:
- Validate Node.js version
- Install all dependencies
- Create .env template
- Install Playwright browsers

---

## Manual Step-by-Step Setup

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

### Wrong Node.js Version
```bash
# Check current version
node --version

# If wrong, use your version manager:
volta install node@20.11.0   # Volta
fnm use                       # fnm (reads .nvmrc)
nvm use 20.11.0              # nvm-windows
```

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
