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
    this.outputChannel = vscode.window.createOutputChannel('NextJS Explorer Server');
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
      'NextJS Explorer server is not running.',
      'Start Server',
      "I'll run it manually"
    );

    if (choice === 'Start Server') {
      return this.startServer();
    } else if (choice === "I'll run it manually") {
      const command = 'npm run dev';
      await vscode.env.clipboard.writeText(command);
      vscode.window.showInformationMessage(
        `Command copied to clipboard: ${command}\n\nRun this in the nextjs-explorer directory.`
      );
    }

    return false;
  }

  async startServer(): Promise<boolean> {
    const explorerPath = this.getExplorerPath();

    this.outputChannel.appendLine(`Starting server from: ${explorerPath}`);
    this.outputChannel.show(true);

    try {
      this.serverProcess = spawn('npm', ['run', 'dev:server'], {
        cwd: explorerPath,
        shell: true,
        env: { ...process.env }
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
        vscode.window.showInformationMessage('NextJS Explorer server started successfully!');
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

  private getExplorerPath(): string {
    // The extension is in vscode-extension/ subdirectory
    // So the main nextjs-explorer is one level up
    return path.resolve(this.extensionPath, '..');
  }

  stopServer(): void {
    if (this.serverProcess) {
      this.outputChannel.appendLine('Stopping server...');
      this.serverProcess.kill();
      this.serverProcess = null;
      vscode.window.showInformationMessage('NextJS Explorer server stopped.');
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
