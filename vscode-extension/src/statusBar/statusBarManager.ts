import * as vscode from 'vscode';
import { ApiClient } from '../server/apiClient';

export class StatusBarManager implements vscode.Disposable {
  private statsItem: vscode.StatusBarItem;
  private serverItem: vscode.StatusBarItem;
  private apiClient: ApiClient | null = null;

  constructor() {
    // Stats: "47 components | 66% stories"
    this.statsItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statsItem.command = 'nextjsExplorer.openInBrowser';
    this.statsItem.tooltip = 'Click to open NextJS Explorer in browser';
    this.statsItem.text = '$(layers) NextJS Explorer';
    this.statsItem.show();

    // Server status indicator
    this.serverItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.serverItem.command = 'nextjsExplorer.startServer';
    this.serverItem.show();
    this.setServerStatus(false);
  }

  setApiClient(client: ApiClient): void {
    this.apiClient = client;
  }

  async updateStats(): Promise<void> {
    if (!this.apiClient) {
      return;
    }

    try {
      const overview = await this.apiClient.getOverview();
      if (overview) {
        const componentCount = overview.counts.components;
        const storyCoverage = overview.counts.components > 0
          ? Math.round((overview.stories.componentsWithStories / overview.counts.components) * 100)
          : 0;

        this.statsItem.text = `$(layers) ${componentCount} components | ${storyCoverage}% stories`;
      }
    } catch {
      this.statsItem.text = '$(layers) NextJS Explorer';
    }
  }

  setServerStatus(running: boolean): void {
    if (running) {
      this.serverItem.text = '$(check) Server';
      this.serverItem.tooltip = 'Server is running';
      this.serverItem.backgroundColor = undefined;
      this.serverItem.command = 'nextjsExplorer.stopServer';
    } else {
      this.serverItem.text = '$(x) Server';
      this.serverItem.tooltip = 'Server is not running - click to start';
      this.serverItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.serverItem.command = 'nextjsExplorer.startServer';
    }
  }

  dispose(): void {
    this.statsItem.dispose();
    this.serverItem.dispose();
  }
}
