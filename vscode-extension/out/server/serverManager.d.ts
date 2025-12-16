import * as vscode from 'vscode';
import { ApiClient } from './apiClient';
export declare class ServerManager {
    private serverProcess;
    private outputChannel;
    private projectPath;
    private extensionPath;
    private apiClient;
    constructor(context: vscode.ExtensionContext, projectPath: string);
    getApiClient(): ApiClient;
    isServerRunning(): Promise<boolean>;
    ensureServerRunning(): Promise<boolean>;
    /**
     * Find where storial is installed (global npm, npx, or local)
     */
    private findStorialCommand;
    private getEnvWithPath;
    promptToStartServer(): Promise<boolean>;
    startServer(): Promise<boolean>;
    private waitForServer;
    stopServer(): void;
    isServerProcessRunning(): boolean;
    showOutput(): void;
    dispose(): void;
}
//# sourceMappingURL=serverManager.d.ts.map