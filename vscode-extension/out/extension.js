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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const serverManager_1 = require("./server/serverManager");
const explorerTreeProvider_1 = require("./providers/explorerTreeProvider");
const statusBarManager_1 = require("./statusBar/statusBarManager");
const commands_1 = require("./commands");
let serverManager;
let statusBarManager;
async function activate(context) {
    console.log('NextJS Explorer extension is activating...');
    // Get workspace folder as project path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('NextJS Explorer: Open a folder to use this extension');
        return;
    }
    const projectPath = workspaceFolder.uri.fsPath;
    console.log(`NextJS Explorer: Project path = ${projectPath}`);
    // Initialize server manager
    serverManager = new serverManager_1.ServerManager(context, projectPath);
    // Initialize status bar
    statusBarManager = new statusBarManager_1.StatusBarManager();
    // Initialize tree provider
    const treeProvider = new explorerTreeProvider_1.ExplorerTreeProvider();
    treeProvider.setApiClient(serverManager.getApiClient());
    // Register tree view
    const treeView = vscode.window.createTreeView('nextjsExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    // Set API client for status bar
    statusBarManager.setApiClient(serverManager.getApiClient());
    // Register all commands
    (0, commands_1.registerCommands)(context, treeProvider, serverManager, statusBarManager);
    // Add disposables
    context.subscriptions.push(treeView);
    context.subscriptions.push(statusBarManager);
    context.subscriptions.push({
        dispose: () => serverManager?.dispose()
    });
    // Check if server is running and prompt if not
    const serverRunning = await serverManager.ensureServerRunning();
    if (serverRunning) {
        console.log('NextJS Explorer: Server is running');
        statusBarManager.setServerStatus(true);
        treeProvider.setServerConnected(true);
        // Auto-scan on activation
        await treeProvider.refresh();
        await statusBarManager.updateStats();
    }
    else {
        console.log('NextJS Explorer: Server is not running');
        statusBarManager.setServerStatus(false);
        treeProvider.setServerConnected(false);
        // Prompt user to start server
        serverManager.promptToStartServer().then(async (started) => {
            if (started) {
                statusBarManager.setServerStatus(true);
                treeProvider.setServerConnected(true);
                await treeProvider.refresh();
                await statusBarManager.updateStats();
            }
        });
    }
    console.log('NextJS Explorer extension activated successfully');
}
function deactivate() {
    console.log('NextJS Explorer extension is deactivating...');
    serverManager?.dispose();
    statusBarManager?.dispose();
}
//# sourceMappingURL=extension.js.map