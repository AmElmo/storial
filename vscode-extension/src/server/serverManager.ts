import * as vscode from 'vscode';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ApiClient } from './apiClient';

export class ServerManager {
  private serverProcess: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private projectPath: string;
  private extensionPath: string;
  private apiClient: ApiClient;

  constructor(context: vscode.ExtensionContext, projectPath: string) {
    this.projectPath = projectPath;
    this.extensionPath = context.extensionPath;
    this.outputChannel = vscode.window.createOutputChannel('Storial Server');
    this.apiClient = new ApiClient(projectPath);
  }

  getApiClient(): ApiClient {
    return this.apiClient;
  }

  async isServerRunning(): Promise<boolean> {
    return this.apiClient.isServerRunning();
  }

  async ensureServerRunning(): Promise<boolean> {
    if (await this.isServerRunning()) {
      await this.apiClient.setProjectPath();
      return true;
    }
    return false;
  }

  /**
   * Find where storial is installed (global npm, npx, or local)
   */
  private findStorialCommand(): { command: string; args: string[]; cwd?: string } | null {
    const env = this.getEnvWithPath();

    // Option 1: Check if storial is globally installed
    try {
      const globalPath = execSync('npm root -g', { encoding: 'utf-8', env }).trim();
      const storialGlobalPath = path.join(globalPath, 'storial');
      if (fs.existsSync(storialGlobalPath)) {
        this.outputChannel.appendLine(`Found global storial at: ${storialGlobalPath}`);
        return { command: 'storial', args: ['server'] };
      }
    } catch {
      // Global not found, continue
    }

    // Option 2: Check if storial is in node_modules of the project
    const localStorialPath = path.join(this.projectPath, 'node_modules', '.bin', 'storial');
    if (fs.existsSync(localStorialPath)) {
      this.outputChannel.appendLine(`Found local storial at: ${localStorialPath}`);
      return { command: localStorialPath, args: ['server'] };
    }

    // Option 3: Use npx (always available if npm is installed)
    this.outputChannel.appendLine('Will use npx to run storial');
    return { command: 'npx', args: ['storial', 'server'] };
  }

  private getEnvWithPath(): NodeJS.ProcessEnv {
    // Ensure common paths are in PATH for finding npm/node
    const additionalPaths = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      process.env.HOME ? `${process.env.HOME}/.nvm/versions/node/*/bin` : '',
      process.env.HOME ? `${process.env.HOME}/.npm-global/bin` : ''
    ].filter(Boolean);

    return {
      ...process.env,
      PATH: `${additionalPaths.join(':')}:${process.env.PATH || ''}`
    };
  }

  async promptToStartServer(): Promise<boolean> {
    const choice = await vscode.window.showInformationMessage(
      'Storial server is not running.',
      'Start Server',
      'Install Storial',
      "I'll run it manually"
    );

    if (choice === 'Start Server') {
      return this.startServer();
    } else if (choice === 'Install Storial') {
      // Open terminal with install command
      const terminal = vscode.window.createTerminal('Storial Install');
      terminal.sendText('npm install -g storial');
      terminal.show();
      vscode.window.showInformationMessage(
        'Installing Storial globally. Once complete, try "Start Server" again.'
      );
    } else if (choice === "I'll run it manually") {
      const command = 'npx storial';
      await vscode.env.clipboard.writeText(command);
      vscode.window.showInformationMessage(
        `Command copied to clipboard: "${command}". Run it in your terminal to start Storial.`
      );
    }

    return false;
  }

  async startServer(): Promise<boolean> {
    this.outputChannel.appendLine('Looking for Storial installation...');
    this.outputChannel.show(true);

    const storialCmd = this.findStorialCommand();

    if (!storialCmd) {
      this.outputChannel.appendLine('Storial not found!');
      const install = await vscode.window.showErrorMessage(
        'Storial is not installed. Would you like to install it?',
        'Install globally',
        'Cancel'
      );

      if (install === 'Install globally') {
        const terminal = vscode.window.createTerminal('Storial Install');
        terminal.sendText('npm install -g storial');
        terminal.show();
        vscode.window.showInformationMessage(
          'Installing Storial. Once complete, try starting the server again.'
        );
      }
      return false;
    }

    this.outputChannel.appendLine(`Starting: ${storialCmd.command} ${storialCmd.args.join(' ')}`);

    try {
      const env = this.getEnvWithPath();

      this.serverProcess = spawn(storialCmd.command, storialCmd.args, {
        cwd: storialCmd.cwd || this.projectPath,
        shell: true,
        env
      });

      this.serverProcess.stdout?.on('data', (data) => {
        this.outputChannel.appendLine(data.toString().trim());
      });

      this.serverProcess.stderr?.on('data', (data) => {
        this.outputChannel.appendLine(`[stderr] ${data.toString().trim()}`);
      });

      this.serverProcess.on('error', (error) => {
        this.outputChannel.appendLine(`[error] ${error.message}`);
        vscode.window.showErrorMessage(`Failed to start server: ${error.message}`);
      });

      this.serverProcess.on('exit', (code) => {
        this.outputChannel.appendLine(`Server exited with code ${code}`);
        this.serverProcess = null;
      });

      // Wait for server to be ready
      const ready = await this.waitForServer(30000); // 30s for npx to download

      if (ready) {
        await this.apiClient.setProjectPath();
        vscode.window.showInformationMessage('Storial server started successfully!');
        return true;
      } else {
        vscode.window.showErrorMessage(
          'Server failed to start. Check Output > Storial Server for details.'
        );
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.outputChannel.appendLine(`Failed to start server: ${message}`);
      vscode.window.showErrorMessage(`Failed to start server: ${message}`);
      return false;
    }
  }

  private async waitForServer(timeout: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.isServerRunning()) {
        return true;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  stopServer(): void {
    if (this.serverProcess) {
      this.outputChannel.appendLine('Stopping server...');
      this.serverProcess.kill();
      this.serverProcess = null;
      vscode.window.showInformationMessage('Storial server stopped.');
    }
  }

  isServerProcessRunning(): boolean {
    return this.serverProcess !== null;
  }

  showOutput(): void {
    this.outputChannel.show();
  }

  dispose(): void {
    this.stopServer();
    this.outputChannel.dispose();
  }
}
