#!/usr/bin/env node
/**
 * Setup script for QA Application
 * Validates environment and installs dependencies
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REQUIRED_NODE_VERSION = 18;
const RECOMMENDED_NODE_VERSION = '20.11.0';

console.log('\n🚀 QA Application Setup\n');
console.log('='.repeat(50));

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

console.log(`\n📦 Node.js version: ${nodeVersion}`);

if (majorVersion < REQUIRED_NODE_VERSION) {
  console.error(`\n❌ ERROR: Node.js ${REQUIRED_NODE_VERSION}+ is required.`);
  console.error(`   Your version: ${nodeVersion}`);
  console.error(`\n   Please install Node.js ${RECOMMENDED_NODE_VERSION} using one of these methods:`);
  console.error(`\n   Option 1 - Volta (Recommended for Windows):`);
  console.error(`     1. Download from https://volta.sh`);
  console.error(`     2. Run: volta install node@${RECOMMENDED_NODE_VERSION}`);
  console.error(`\n   Option 2 - fnm (Fast Node Manager):`);
  console.error(`     1. Install: winget install Schniz.fnm`);
  console.error(`     2. Run: fnm install ${RECOMMENDED_NODE_VERSION}`);
  console.error(`     3. Run: fnm use ${RECOMMENDED_NODE_VERSION}`);
  console.error(`\n   Option 3 - nvm-windows:`);
  console.error(`     1. Download from https://github.com/coreybutler/nvm-windows`);
  console.error(`     2. Run: nvm install ${RECOMMENDED_NODE_VERSION}`);
  console.error(`     3. Run: nvm use ${RECOMMENDED_NODE_VERSION}`);
  process.exit(1);
}

console.log('✅ Node.js version OK');

// Check npm version
const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
console.log(`📦 npm version: ${npmVersion}`);

// Check for .env file in server
const serverEnvPath = path.join(__dirname, '..', 'server', '.env');
const serverEnvExamplePath = path.join(__dirname, '..', 'server', '.env.example');

if (!fs.existsSync(serverEnvPath)) {
  console.log('\n⚠️  No .env file found in server directory.');
  
  if (fs.existsSync(serverEnvExamplePath)) {
    console.log('   Creating from .env.example...');
    fs.copyFileSync(serverEnvExamplePath, serverEnvPath);
    console.log('   ✅ Created .env file. Please edit it with your OPENAI_API_KEY.');
  } else {
    console.log('   Creating default .env file...');
    const defaultEnv = `# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o

# Server Configuration
PORT=3001

# Rate Limiting
TOKENS_PER_MINUTE=25000
MAX_ITERATIONS=50
`;
    fs.writeFileSync(serverEnvPath, defaultEnv);
    console.log('   ✅ Created .env file. Please edit it with your OPENAI_API_KEY.');
  }
} else {
  console.log('✅ Server .env file exists');
}

// Install dependencies
console.log('\n📥 Installing dependencies...\n');

try {
  // Install root dependencies
  console.log('Installing root dependencies...');
  execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  
  // Install client dependencies
  console.log('\nInstalling client dependencies...');
  execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..', 'client') });
  
  // Install server dependencies
  console.log('\nInstalling server dependencies...');
  execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..', 'server') });
  
  // Install Playwright browsers
  console.log('\nInstalling Playwright browsers...');
  execSync('npx playwright install', { stdio: 'inherit', cwd: path.join(__dirname, '..', 'server') });
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Edit server/.env and add your OPENAI_API_KEY');
  console.log('  2. Run: npm run dev');
  console.log('  3. Open http://localhost:3000 in your browser\n');
  
} catch (error) {
  console.error('\n❌ Setup failed:', error.message);
  process.exit(1);
}
