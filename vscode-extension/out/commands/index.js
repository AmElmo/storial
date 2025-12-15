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
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const treeItems_1 = require("../providers/treeItems");
// Helper to extract file path from various tree item types
function getFilePathFromItem(item) {
    if (typeof item === 'string') {
        return item;
    }
    if (item instanceof treeItems_1.PageTreeItem) {
        return item.filePath;
    }
    if (item instanceof treeItems_1.ComponentTreeItem) {
        return item.filePath;
    }
    if (item instanceof treeItems_1.HookTreeItem) {
        return item.filePath;
    }
    if (item instanceof treeItems_1.ContextTreeItem) {
        return item.filePath;
    }
    if (item instanceof treeItems_1.UtilityTreeItem) {
        return item.filePath;
    }
    return undefined;
}
function registerCommands(context, treeProvider, serverManager, statusBarManager, treeView) {
    // Track clicks for double-click detection
    let lastClickTime = 0;
    let lastClickedItem;
    const DOUBLE_CLICK_THRESHOLD = 400; // ms
    // Handle tree view selection (for double-click detection)
    context.subscriptions.push(treeView.onDidChangeSelection(async (e) => {
        const item = e.selection[0];
        if (!item)
            return;
        const now = Date.now();
        const filePath = getFilePathFromItem(item);
        // Check for double-click
        if (filePath && lastClickedItem === item && (now - lastClickTime) < DOUBLE_CLICK_THRESHOLD) {
            // Double-click detected - open file
            try {
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
            }
            lastClickedItem = undefined;
            lastClickTime = 0;
        }
        else {
            lastClickedItem = item;
            lastClickTime = now;
        }
    }));
    // Go to file - accepts either a file path string or a tree item
    context.subscriptions.push(vscode.commands.registerCommand('nextjsExplorer.goToFile', async (itemOrPath) => {
        const filePath = getFilePathFromItem(itemOrPath);
        if (!filePath) {
            vscode.window.showWarningMessage('No file path available for this item');
            return;
        }
        try {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
        }
    }));
    // Open in browser
    context.subscriptions.push(vscode.commands.registerCommand('nextjsExplorer.openInBrowser', async () => {
        const url = vscode.Uri.parse('http://localhost:5180');
        await vscode.env.openExternal(url);
    }));
    // Refresh tree
    context.subscriptions.push(vscode.commands.registerCommand('nextjsExplorer.refresh', async () => {
        // First check if server is running
        const running = await serverManager.isServerRunning();
        if (!running) {
            const started = await serverManager.promptToStartServer();
            if (!started) {
                return;
            }
        }
        treeProvider.setServerConnected(true);
        await treeProvider.refresh(true);
        await statusBarManager.updateStats();
        statusBarManager.setServerStatus(true);
    }));
    // Start server
    context.subscriptions.push(vscode.commands.registerCommand('nextjsExplorer.startServer', async () => {
        const running = await serverManager.isServerRunning();
        if (running) {
            vscode.window.showInformationMessage('Server is already running');
            return;
        }
        const started = await serverManager.promptToStartServer();
        if (started) {
            statusBarManager.setServerStatus(true);
            treeProvider.setServerConnected(true);
            await treeProvider.refresh();
            await statusBarManager.updateStats();
        }
    }));
    // Stop server
    context.subscriptions.push(vscode.commands.registerCommand('nextjsExplorer.stopServer', async () => {
        if (serverManager.isServerProcessRunning()) {
            serverManager.stopServer();
            statusBarManager.setServerStatus(false);
            treeProvider.setServerConnected(false);
        }
        else {
            vscode.window.showInformationMessage('Server was not started by this extension. Stop it manually in your terminal.');
        }
    }));
    // Generate story
    context.subscriptions.push(vscode.commands.registerCommand('nextjsExplorer.generateStory', async (item) => {
        if (!item) {
            vscode.window.showWarningMessage('Select a component or page first');
            return;
        }
        const type = item instanceof treeItems_1.ComponentTreeItem ? 'component' : 'page';
        const name = item instanceof treeItems_1.ComponentTreeItem
            ? item.component.name
            : item.page.route || item.page.fileName;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating story for ${name}...`,
            cancellable: false
        }, async () => {
            try {
                const apiClient = serverManager.getApiClient();
                const result = await apiClient.generateStory(type, name);
                if (result.success) {
                    const storyCount = result.stories?.stories?.length || 0;
                    vscode.window.showInformationMessage(`Generated ${storyCount} stories for ${name}`);
                    await treeProvider.refresh();
                    await statusBarManager.updateStats();
                }
                else {
                    vscode.window.showErrorMessage(`Story generation failed: ${result.error || result.message}`);
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to generate story: ${message}`);
            }
        });
    }));
    // View in Web UI
    context.subscriptions.push(vscode.commands.registerCommand('nextjsExplorer.viewInWebUI', async (item) => {
        if (!item) {
            vscode.window.showWarningMessage('Select a component or page first');
            return;
        }
        const type = item instanceof treeItems_1.ComponentTreeItem ? 'component' : 'page';
        const name = item instanceof treeItems_1.ComponentTreeItem
            ? item.component.name
            : item.page.route;
        const url = vscode.Uri.parse(`http://localhost:5180?type=${type}&name=${encodeURIComponent(name || '')}&view=${type}s`);
        await vscode.env.openExternal(url);
    }));
}
//# sourceMappingURL=index.js.map