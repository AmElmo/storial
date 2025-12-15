import * as vscode from 'vscode';
import { ExplorerTreeProvider } from '../providers/explorerTreeProvider';
import { ServerManager } from '../server/serverManager';
import { StatusBarManager } from '../statusBar/statusBarManager';
import { ComponentTreeItem, PageTreeItem } from '../providers/treeItems';

export function registerCommands(
  context: vscode.ExtensionContext,
  treeProvider: ExplorerTreeProvider,
  serverManager: ServerManager,
  statusBarManager: StatusBarManager
): void {

  // Go to file
  context.subscriptions.push(
    vscode.commands.registerCommand('nextjsExplorer.goToFile', async (filePath: string) => {
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
    vscode.commands.registerCommand('nextjsExplorer.openInBrowser', async () => {
      const url = vscode.Uri.parse('http://localhost:5180');
      await vscode.env.openExternal(url);
    })
  );

  // Refresh tree
  context.subscriptions.push(
    vscode.commands.registerCommand('nextjsExplorer.refresh', async () => {
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
    vscode.commands.registerCommand('nextjsExplorer.startServer', async () => {
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
    vscode.commands.registerCommand('nextjsExplorer.stopServer', async () => {
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
    vscode.commands.registerCommand('nextjsExplorer.generateStory', async (item: ComponentTreeItem | PageTreeItem) => {
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
    vscode.commands.registerCommand('nextjsExplorer.viewInWebUI', async (item: ComponentTreeItem | PageTreeItem) => {
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
