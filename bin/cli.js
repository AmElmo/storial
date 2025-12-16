#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
\x1b[36m╔═══════════════════════════════════════════════════════╗
║              ✨ Storial CLI                           ║
║     AI-powered component stories for React/Next.js   ║
╚═══════════════════════════════════════════════════════╝\x1b[0m

Usage: storial [command] [options]

Commands:
  start, dev     Start the Storial server and web UI (default)
  server         Start only the server (no web UI)
  help           Show this help message
  version        Show version

Options:
  --port <port>  Server port (default: 3050)

Examples:
  storial                    # Start server + web UI
  storial start              # Same as above
  storial server             # Server only (for VS Code extension)
  npx storial                # Run without installing

Documentation: https://github.com/AmElmo/storial
`);
}

function printVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    console.log(`storial v${packageJson.version}`);
  } catch {
    console.log('storial (version unknown)');
  }
}

async function startServer(serverOnly = false) {
  const distServerPath = path.join(rootDir, 'dist', 'server', 'index.js');
  const srcServerPath = path.join(rootDir, 'server', 'index.ts');

  // Check if we have built dist or need to use tsx for development
  const useBuilt = fs.existsSync(distServerPath);

  if (serverOnly || useBuilt) {
    // Production: run built server
    if (!useBuilt) {
      console.error('\x1b[31mError: Server not built. Run "npm run build" first or use "npx storial" for development.\x1b[0m');
      process.exit(1);
    }

    console.log('\x1b[36m[Storial]\x1b[0m Starting server...');
    const server = spawn('node', [distServerPath], {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env }
    });

    server.on('error', (err) => {
      console.error('\x1b[31mFailed to start server:\x1b[0m', err.message);
      process.exit(1);
    });

    server.on('exit', (code) => {
      process.exit(code || 0);
    });
  } else {
    // Development: use npm run dev (requires tsx)
    console.log('\x1b[36m[Storial]\x1b[0m Starting in development mode...');
    const dev = spawn('npm', ['run', 'dev'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env }
    });

    dev.on('error', (err) => {
      console.error('\x1b[31mFailed to start:\x1b[0m', err.message);
      process.exit(1);
    });

    dev.on('exit', (code) => {
      process.exit(code || 0);
    });
  }
}

// Handle commands
switch (command) {
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;

  case 'version':
  case '--version':
  case '-v':
    printVersion();
    break;

  case 'server':
    startServer(true);
    break;

  case 'start':
  case 'dev':
  case undefined:
    startServer(false);
    break;

  default:
    console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`);
    printHelp();
    process.exit(1);
}
