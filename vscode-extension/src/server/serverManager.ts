import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
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

  async promptToStartServer(): Promise<boolean> {
    const choice = await vscode.window.showInformationMessage(
      'Storial server is not running.',
      'Start Server',
      "I'll run it manually"
    );

    if (choice === 'Start Server') {
      return this.startServer();
    } else if (choice === "I'll run it manually") {
      const storialPath = this.getStorialPath();
      const command = `cd ${storialPath} && npm run dev`;
      await vscode.env.clipboard.writeText(command);
      vscode.window.showInformationMessage(
        `Command copied to clipboard. Run it in your terminal to start both the server and web UI.`
      );
    }

    return false;
  }

  async startServer(): Promise<boolean> {
    const storialPath = this.getStorialPath();

    this.outputChannel.appendLine(`Starting server from: ${storialPath}`);
    this.outputChannel.show(true);

    try {
      // Use full path to npm since VSCode extension host doesn't inherit shell PATH
      const npmPath = '/opt/homebrew/bin/npm';

      // Also need to set PATH so node can be found
      const env = {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
      };

      // Use 'dev' instead of 'dev:server' to start both server (3050) and UI (5180)
      this.serverProcess = spawn(npmPath, ['run', 'dev'], {
        cwd: storialPath,
        shell: false,
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
      const ready = await this.waitForServer(15000);

      if (ready) {
        await this.apiClient.setProjectPath();
        vscode.window.showInformationMessage('Storial server started successfully!');
        return true;
      } else {
        vscode.window.showErrorMessage('Server failed to start within timeout. Check the output channel for details.');
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

  private getStorialPath(): string {
    // The extension is in vscode-extension/ subdirectory
    // So the main storial directory is one level up
    return path.resolve(this.extensionPath, '..');
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
