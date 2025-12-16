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
const fs = __importStar(require("fs"));
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
    /**
     * Find where storial is installed (global npm, npx, or local)
     */
    findStorialCommand() {
        const env = this.getEnvWithPath();
        // Option 1: Check if storial is globally installed
        try {
            const globalPath = (0, child_process_1.execSync)('npm root -g', { encoding: 'utf-8', env }).trim();
            const storialGlobalPath = path.join(globalPath, 'storial');
            if (fs.existsSync(storialGlobalPath)) {
                this.outputChannel.appendLine(`Found global storial at: ${storialGlobalPath}`);
                return { command: 'storial', args: ['server'] };
            }
        }
        catch {
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
    getEnvWithPath() {
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
    async promptToStartServer() {
        const choice = await vscode.window.showInformationMessage('Storial server is not running.', 'Start Server', 'Install Storial', "I'll run it manually");
        if (choice === 'Start Server') {
            return this.startServer();
        }
        else if (choice === 'Install Storial') {
            // Open terminal with install command
            const terminal = vscode.window.createTerminal('Storial Install');
            terminal.sendText('npm install -g storial');
            terminal.show();
            vscode.window.showInformationMessage('Installing Storial globally. Once complete, try "Start Server" again.');
        }
        else if (choice === "I'll run it manually") {
            const command = 'npx storial';
            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage(`Command copied to clipboard: "${command}". Run it in your terminal to start Storial.`);
        }
        return false;
    }
    async startServer() {
        this.outputChannel.appendLine('Looking for Storial installation...');
        this.outputChannel.show(true);
        const storialCmd = this.findStorialCommand();
        if (!storialCmd) {
            this.outputChannel.appendLine('Storial not found!');
            const install = await vscode.window.showErrorMessage('Storial is not installed. Would you like to install it?', 'Install globally', 'Cancel');
            if (install === 'Install globally') {
                const terminal = vscode.window.createTerminal('Storial Install');
                terminal.sendText('npm install -g storial');
                terminal.show();
                vscode.window.showInformationMessage('Installing Storial. Once complete, try starting the server again.');
            }
            return false;
        }
        this.outputChannel.appendLine(`Starting: ${storialCmd.command} ${storialCmd.args.join(' ')}`);
        try {
            const env = this.getEnvWithPath();
            this.serverProcess = (0, child_process_1.spawn)(storialCmd.command, storialCmd.args, {
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
            }
            else {
                vscode.window.showErrorMessage('Server failed to start. Check Output > Storial Server for details.');
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