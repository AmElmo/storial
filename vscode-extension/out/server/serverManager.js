"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerManager = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const apiClient_1 = require("./apiClient");
class ServerManager {
    serverProcess = null;
    outputChannel;
    projectPath;
    extensionPath;
    apiClient;
    constructor(context, projectPath) {
        this.projectPath = projectPath;
        this.extensionPath = context.extensionPath;
        this.outputChannel = vscode.window.createOutputChannel('Storial Server');
        this.apiClient = new apiClient_1.ApiClient(projectPath);
    }
    getApiClient() {
        return this.apiClient;
    }
    async isServerRunning() {
        return this.apiClient.isServerRunning();
    }
    async ensureServerRunning() {
        if (await this.isServerRunning()) {
            await this.apiClient.setProjectPath();
            return true;
        }
        return false;
    }
    async promptToStartServer() {
        const choice = await vscode.window.showInformationMessage('Storial server is not running.', 'Start Server', "I'll run it manually");
        if (choice === 'Start Server') {
            return this.startServer();
        }
        else if (choice === "I'll run it manually") {
            const storialPath = this.getStorialPath();
            const command = `cd ${storialPath} && npm run dev`;
            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage(`Command copied to clipboard. Run it in your terminal to start both the server and web UI.`);
        }
        return false;
    }
    async startServer() {
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
            this.serverProcess = (0, child_process_1.spawn)(npmPath, ['run', 'dev'], {
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
            }
            else {
                vscode.window.showErrorMessage('Server failed to start within timeout. Check the output channel for details.');
                return false;
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`Failed to start server: ${message}`);
            vscode.window.showErrorMessage(`Failed to start server: ${message}`);
            return false;
        }
    }
    async waitForServer(timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (await this.isServerRunning()) {
                return true;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    }
    getStorialPath() {
        // The extension is in vscode-extension/ subdirectory
        // So the main storial directory is one level up
        return path.resolve(this.extensionPath, '..');
    }
    stopServer() {
        if (this.serverProcess) {
            this.outputChannel.appendLine('Stopping server...');
            this.serverProcess.kill();
            this.serverProcess = null;
            vscode.window.showInformationMessage('Storial server stopped.');
        }
    }
    isServerProcessRunning() {
        return this.serverProcess !== null;
    }
    showOutput() {
        this.outputChannel.show();
    }
    dispose() {
        this.stopServer();
        this.outputChannel.dispose();
    }
}
exports.ServerManager = ServerManager;
//# sourceMappingURL=serverManager.js.map