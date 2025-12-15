import * as vscode from 'vscode';
import { ServerManager } from './server/serverManager';
import { ExplorerTreeProvider } from './providers/explorerTreeProvider';
import { StatusBarManager } from './statusBar/statusBarManager';
import { registerCommands } from './commands';

let serverManager: ServerManager | undefined;
let statusBarManager: StatusBarManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('NextJS Explorer extension is activating...');

  // Get workspace folder as project path
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage(
      'NextJS Explorer: Open a folder to use this extension'
    );
    return;
  }

  const projectPath = workspaceFolder.uri.fsPath;
  console.log(`NextJS Explorer: Project path = ${projectPath}`);

  // Initialize server manager
  serverManager = new ServerManager(context, projectPath);

  // Initialize status bar
  statusBarManager = new StatusBarManager();

  // Initialize tree provider
  const treeProvider = new ExplorerTreeProvider();
  treeProvider.setApiClient(serverManager.getApiClient());

  // Register tree view
  const treeView = vscode.window.createTreeView('nextjsExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  // Set API client for status bar
  statusBarManager.setApiClient(serverManager.getApiClient());

  // Register all commands (pass treeView for double-click handling)
  registerCommands(context, treeProvider, serverManager, statusBarManager, treeView);

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
  } else {
    console.log('NextJS Explorer: Server is not running');
    statusBarManager.setServerStatus(false);
    treeProvider.setServerConnected(false);

    // Prompt user to start server
    serverManager.promptToStartServer().then(async (started) => {
      if (started) {
        statusBarManager!.setServerStatus(true);
        treeProvider.setServerConnected(true);
        await treeProvider.refresh();
        await statusBarManager!.updateStats();
      }
    });
  }

  console.log('NextJS Explorer extension activated successfully');
}

export function deactivate() {
  console.log('NextJS Explorer extension is deactivating...');
  serverManager?.dispose();
  statusBarManager?.dispose();
}
