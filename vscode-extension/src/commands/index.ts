import * as vscode from 'vscode';
import { ExplorerTreeProvider } from '../providers/explorerTreeProvider';
import { ServerManager } from '../server/serverManager';
import { StatusBarManager } from '../statusBar/statusBarManager';
import {
  ComponentTreeItem,
  PageTreeItem,
  HookTreeItem,
  ContextTreeItem,
  UtilityTreeItem
} from '../providers/treeItems';

// Helper to extract file path from various tree item types
function getFilePathFromItem(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item;
  }
  if (item instanceof PageTreeItem) {
    return item.filePath;
  }
  if (item instanceof ComponentTreeItem) {
    return item.filePath;
  }
  if (item instanceof HookTreeItem) {
    return item.filePath;
  }
  if (item instanceof ContextTreeItem) {
    return item.filePath;
  }
  if (item instanceof UtilityTreeItem) {
    return item.filePath;
  }
  return undefined;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  treeProvider: ExplorerTreeProvider,
  serverManager: ServerManager,
  statusBarManager: StatusBarManager,
  treeView: vscode.TreeView<vscode.TreeItem>
): void {

  // Track clicks for double-click detection
  let lastClickTime = 0;
  let lastClickedItem: vscode.TreeItem | undefined;
  const DOUBLE_CLICK_THRESHOLD = 400; // ms

  // Handle tree view selection (for double-click detection)
  context.subscriptions.push(
    treeView.onDidChangeSelection(async (e) => {
      const item = e.selection[0];
      if (!item) return;

      const now = Date.now();
      const filePath = getFilePathFromItem(item);

      // Check for double-click
      if (filePath && lastClickedItem === item && (now - lastClickTime) < DOUBLE_CLICK_THRESHOLD) {
        // Double-click detected - open file
        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
        }
        lastClickedItem = undefined;
        lastClickTime = 0;
      } else {
        lastClickedItem = item;
        lastClickTime = now;
      }
    })
  );

  // Go to file - accepts either a file path string or a tree item
  context.subscriptions.push(
    vscode.commands.registerCommand('storial.goToFile', async (itemOrPath: unknown) => {
      const filePath = getFilePathFromItem(itemOrPath);
      if (!filePath) {
        vscode.window.showWarningMessage('No file path available for this item');
        return;
      }

      try {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
      }
    })
  );

  // Open in browser
  context.subscriptions.push(
    vscode.commands.registerCommand('storial.openInBrowser', async () => {
      const url = vscode.Uri.parse('http://localhost:5180');
      await vscode.env.openExternal(url);
    })
  );

  // Refresh tree
  context.subscriptions.push(
    vscode.commands.registerCommand('storial.refresh', async () => {
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
    })
  );

  // Start server
  context.subscriptions.push(
    vscode.commands.registerCommand('storial.startServer', async () => {
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
    })
  );

  // Stop server
  context.subscriptions.push(
    vscode.commands.registerCommand('storial.stopServer', async () => {
      if (serverManager.isServerProcessRunning()) {
        serverManager.stopServer();
        statusBarManager.setServerStatus(false);
        treeProvider.setServerConnected(false);
      } else {
        vscode.window.showInformationMessage(
          'Server was not started by this extension. Stop it manually in your terminal.'
        );
      }
    })
  );

  // Generate story
  context.subscriptions.push(
    vscode.commands.registerCommand('storial.generateStory', async (item: ComponentTreeItem | PageTreeItem) => {
      if (!item) {
        vscode.window.showWarningMessage('Select a component or page first');
        return;
      }

      const type = item instanceof ComponentTreeItem ? 'component' : 'page';
      const name = item instanceof ComponentTreeItem
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
            vscode.window.showInformationMessage(
              `Generated ${storyCount} stories for ${name}`
            );
            await treeProvider.refresh();
            await statusBarManager.updateStats();
          } else {
            vscode.window.showErrorMessage(
              `Story generation failed: ${result.error || result.message}`
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(`Failed to generate story: ${message}`);
        }
      });
    })
  );

  // View in Web UI
  context.subscriptions.push(
    vscode.commands.registerCommand('storial.viewInWebUI', async (item: ComponentTreeItem | PageTreeItem) => {
      if (!item) {
        vscode.window.showWarningMessage('Select a component or page first');
        return;
      }

      const type = item instanceof ComponentTreeItem ? 'component' : 'page';
      const name = item instanceof ComponentTreeItem
        ? item.component.name
        : item.page.route;

      const url = vscode.Uri.parse(
        `http://localhost:5180?type=${type}&name=${encodeURIComponent(name || '')}&view=${type}s`
      );
      await vscode.env.openExternal(url);
    })
  );
}
