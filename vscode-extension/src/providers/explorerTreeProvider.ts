import * as vscode from 'vscode';
import { ApiClient } from '../server/apiClient';
import {
  CategoryTreeItem,
  PageTreeItem,
  ComponentTreeItem,
  HookTreeItem,
  ContextTreeItem,
  UtilityTreeItem,
  FolderTreeItem,
  MessageTreeItem
} from './treeItems';
import type { ScanResult, PageInfo, ComponentInfo } from '../types/api';

export class ExplorerTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private scanResult: ScanResult | null = null;
  private apiClient: ApiClient | null = null;
  private isLoading = false;
  private errorMessage: string | null = null;
  private serverConnected = false;

  setApiClient(client: ApiClient): void {
    this.apiClient = client;
  }

  setServerConnected(connected: boolean): void {
    this.serverConnected = connected;
    this._onDidChangeTreeData.fire(undefined);
  }

  async refresh(forceRescan: boolean = false): Promise<void> {
    if (!this.apiClient) {
      this.errorMessage = 'API client not initialized';
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this._onDidChangeTreeData.fire(undefined);

    try {
      this.scanResult = await this.apiClient.scan(forceRescan);
      this.serverConnected = true;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to scan project';
      this.scanResult = null;
    } finally {
      this.isLoading = false;
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  getScanResult(): ScanResult | null {
    return this.scanResult;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // Server not connected
    if (!this.serverConnected && !this.scanResult) {
      return [
        new MessageTreeItem('Server not connected', 'warning'),
        new MessageTreeItem('Click refresh after starting server', 'info')
      ];
    }

    // Loading state
    if (this.isLoading) {
      return [new MessageTreeItem('Scanning project...', 'loading~spin')];
    }

    // Error state
    if (this.errorMessage) {
      return [new MessageTreeItem(this.errorMessage, 'error')];
    }

    // No scan result yet
    if (!this.scanResult) {
      return [new MessageTreeItem('Click refresh to scan', 'info')];
    }

    // Root level - show categories
    if (!element) {
      return this.getRootCategories();
    }

    // Category level - show items
    if (element instanceof CategoryTreeItem) {
      return this.getCategoryChildren(element.category);
    }

    // Folder level - show items in folder
    if (element instanceof FolderTreeItem) {
      return element.children;
    }

    return [];
  }

  private getRootCategories(): vscode.TreeItem[] {
    const result = this.scanResult!;
    const pages = result.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError);

    const categories: vscode.TreeItem[] = [];

    // Always show pages and components
    categories.push(new CategoryTreeItem('pages', 'Pages', pages.length));
    categories.push(new CategoryTreeItem('components', 'Components', result.components.length));

    // Show other categories only if they have items
    if (result.hooks?.length > 0) {
      categories.push(new CategoryTreeItem('hooks', 'Hooks', result.hooks.length));
    }
    if (result.contexts?.length > 0) {
      categories.push(new CategoryTreeItem('contexts', 'Contexts', result.contexts.length));
    }
    if (result.utilities?.length > 0) {
      categories.push(new CategoryTreeItem('utilities', 'Utilities', result.utilities.length));
    }

    return categories;
  }

  private getCategoryChildren(category: string): vscode.TreeItem[] {
    const result = this.scanResult!;

    switch (category) {
      case 'pages':
        return this.groupPagesByFolder(
          result.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError)
        );
      case 'components':
        return this.groupComponentsByFolder(result.components);
      case 'hooks':
        return (result.hooks || []).map(h => new HookTreeItem(h));
      case 'contexts':
        return (result.contexts || []).map(c => new ContextTreeItem(c));
      case 'utilities':
        return (result.utilities || []).map(u => new UtilityTreeItem(u));
      default:
        return [];
    }
  }

  private groupPagesByFolder(pages: PageInfo[]): vscode.TreeItem[] {
    // Sort pages by route
    const sortedPages = [...pages].sort((a, b) => a.route.localeCompare(b.route));

    // Group by first route segment
    const groups = new Map<string, PageInfo[]>();

    for (const page of sortedPages) {
      const parts = page.route.split('/').filter(Boolean);
      const folder = parts.length > 1 ? '/' + parts[0] : '/';
      if (!groups.has(folder)) {
        groups.set(folder, []);
      }
      groups.get(folder)!.push(page);
    }

    // Build tree items
    const items: vscode.TreeItem[] = [];

    // Handle root pages first
    const rootPages = groups.get('/') || [];
    for (const page of rootPages) {
      items.push(new PageTreeItem(page));
    }

    // Then grouped pages
    for (const [folder, folderPages] of groups) {
      if (folder === '/') continue;

      if (folderPages.length === 1) {
        items.push(new PageTreeItem(folderPages[0]));
      } else {
        const children = folderPages.map(p => new PageTreeItem(p));
        items.push(new FolderTreeItem(folder, children));
      }
    }

    return items;
  }

  private groupComponentsByFolder(components: ComponentInfo[]): vscode.TreeItem[] {
    // Sort components by name
    const sortedComponents = [...components].sort((a, b) => a.name.localeCompare(b.name));

    // Group by folder within components directory
    const groups = new Map<string, ComponentInfo[]>();

    for (const comp of sortedComponents) {
      // Extract folder from path
      const pathParts = comp.filePath.split('/');
      const compIdx = pathParts.findIndex(p => p.toLowerCase() === 'components');

      let folder = 'root';
      if (compIdx !== -1 && pathParts.length > compIdx + 2) {
        folder = pathParts[compIdx + 1];
      }

      if (!groups.has(folder)) {
        groups.set(folder, []);
      }
      groups.get(folder)!.push(comp);
    }

    // If only one group (root), return flat list
    if (groups.size === 1 && groups.has('root')) {
      return sortedComponents.map(c => new ComponentTreeItem(c));
    }

    // Build folder tree
    const items: vscode.TreeItem[] = [];

    // Root components first (if any)
    const rootComps = groups.get('root') || [];
    for (const comp of rootComps) {
      items.push(new ComponentTreeItem(comp));
    }

    // Then folders
    for (const [folder, comps] of groups) {
      if (folder === 'root') continue;
      const children = comps.map(c => new ComponentTreeItem(c));
      items.push(new FolderTreeItem(folder, children));
    }

    return items;
  }
}
