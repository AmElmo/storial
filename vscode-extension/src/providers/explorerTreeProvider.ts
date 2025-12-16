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
  MessageTreeItem,
  DetailSectionItem,
  DetailLinkItem,
  PropItem,
  DetailItemData
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

    // Page details
    if (element instanceof PageTreeItem && element.hasDetails) {
      return this.getPageDetails(element.page);
    }

    // Component details
    if (element instanceof ComponentTreeItem && element.hasDetails) {
      return this.getComponentDetails(element.component);
    }

    // Hook details
    if (element instanceof HookTreeItem && element.hasDetails) {
      return this.getHookDetails(element.hook);
    }

    // Context details
    if (element instanceof ContextTreeItem && element.hasDetails) {
      return this.getContextDetails(element.context);
    }

    // Utility details
    if (element instanceof UtilityTreeItem && element.hasDetails) {
      return this.getUtilityDetails(element.utility);
    }

    // Detail section children
    if (element instanceof DetailSectionItem) {
      return element.items.map(item => new DetailLinkItem(item.name, item.filePath, 'circle-small'));
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

    // Health category - shows unused items
    const unusedCount = this.getUnusedCount();
    if (unusedCount > 0) {
      categories.push(new CategoryTreeItem('health', 'Health', unusedCount));
    }

    return categories;
  }

  private getUnusedCount(): number {
    const result = this.scanResult;
    if (!result) return 0;

    const unusedComponents = result.components.filter(c =>
      c.usedInPages.length === 0 && c.usedInComponents.length === 0
    ).length;
    const unusedHooks = (result.hooks || []).filter(h => h.usedIn.length === 0).length;
    const unusedContexts = (result.contexts || []).filter(c => c.usedIn.length === 0).length;
    const unusedUtilities = (result.utilities || []).filter(u => u.usedIn.length === 0).length;

    return unusedComponents + unusedHooks + unusedContexts + unusedUtilities;
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
      case 'health':
        return this.getHealthChildren();
      default:
        return [];
    }
  }

  private getHealthChildren(): vscode.TreeItem[] {
    const result = this.scanResult!;
    const items: vscode.TreeItem[] = [];

    // Unused components
    const unusedComponents = result.components.filter(c =>
      c.usedInPages.length === 0 && c.usedInComponents.length === 0
    );
    if (unusedComponents.length > 0) {
      const children = unusedComponents.map(c => new ComponentTreeItem(c));
      items.push(new FolderTreeItem(`Unused Components`, children));
    }

    // Unused hooks
    const unusedHooks = (result.hooks || []).filter(h => h.usedIn.length === 0);
    if (unusedHooks.length > 0) {
      const children = unusedHooks.map(h => new HookTreeItem(h));
      items.push(new FolderTreeItem(`Unused Hooks`, children));
    }

    // Unused contexts
    const unusedContexts = (result.contexts || []).filter(c => c.usedIn.length === 0);
    if (unusedContexts.length > 0) {
      const children = unusedContexts.map(c => new ContextTreeItem(c));
      items.push(new FolderTreeItem(`Unused Contexts`, children));
    }

    // Unused utilities
    const unusedUtilities = (result.utilities || []).filter(u => u.usedIn.length === 0);
    if (unusedUtilities.length > 0) {
      const children = unusedUtilities.map(u => new UtilityTreeItem(u));
      items.push(new FolderTreeItem(`Unused Utilities`, children));
    }

    return items;
  }

  // Helper to look up component file path by name
  private getComponentFilePath(name: string): string | undefined {
    return this.scanResult?.components.find(c => c.name === name)?.filePath;
  }

  // Helper to look up page file path by route
  private getPageFilePath(route: string): string | undefined {
    return this.scanResult?.pages.find(p => p.route === route)?.filePath;
  }

  // Detail views for expanded items
  private getPageDetails(page: PageInfo): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    if (page.components.length > 0) {
      const componentItems: DetailItemData[] = page.components.map(name => ({
        name,
        filePath: this.getComponentFilePath(name)
      }));
      items.push(new DetailSectionItem('Components used', componentItems, 'symbol-class'));
    }

    if (page.linksTo.length > 0) {
      const linkItems: DetailItemData[] = page.linksTo.map(route => ({
        name: route,
        filePath: this.getPageFilePath(route)
      }));
      items.push(new DetailSectionItem('Links to', linkItems, 'link'));
    }

    if (page.dataDependencies.length > 0) {
      const deps: DetailItemData[] = page.dataDependencies.map(d => ({
        name: `${d.type}: ${d.source}`,
        filePath: undefined
      }));
      items.push(new DetailSectionItem('Data dependencies', deps, 'database'));
    }

    return items;
  }

  private getComponentDetails(component: ComponentInfo): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    if (component.usedInPages.length > 0) {
      const pageItems: DetailItemData[] = component.usedInPages.map(route => ({
        name: route,
        filePath: this.getPageFilePath(route)
      }));
      items.push(new DetailSectionItem('Used in pages', pageItems, 'file'));
    }

    if (component.usedInComponents.length > 0) {
      const compItems: DetailItemData[] = component.usedInComponents.map(name => ({
        name,
        filePath: this.getComponentFilePath(name)
      }));
      items.push(new DetailSectionItem('Used in components', compItems, 'symbol-class'));
    }

    if (component.props.length > 0) {
      const propItems: DetailItemData[] = component.props.map(p => ({
        name: `${p.name}: ${p.type}${p.required ? '' : '?'}`,
        filePath: undefined
      }));
      items.push(new DetailSectionItem('Props', propItems, 'symbol-property'));
    }

    if (component.dataDependencies.length > 0) {
      const deps: DetailItemData[] = component.dataDependencies.map(d => ({
        name: `${d.type}: ${d.source}`,
        filePath: undefined
      }));
      items.push(new DetailSectionItem('Data dependencies', deps, 'database'));
    }

    return items;
  }

  private getHookDetails(hook: { usedIn: string[]; dependencies: string[] }): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    if (hook.usedIn.length > 0) {
      const usedInItems: DetailItemData[] = hook.usedIn.map(name => ({
        name,
        filePath: this.getComponentFilePath(name)
      }));
      items.push(new DetailSectionItem('Used in', usedInItems, 'references'));
    }

    if (hook.dependencies.length > 0) {
      const depItems: DetailItemData[] = hook.dependencies.map(name => ({
        name,
        filePath: undefined
      }));
      items.push(new DetailSectionItem('Dependencies', depItems, 'package'));
    }

    return items;
  }

  private getContextDetails(context: { usedIn: string[] }): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    if (context.usedIn.length > 0) {
      const usedInItems: DetailItemData[] = context.usedIn.map(name => ({
        name,
        filePath: this.getComponentFilePath(name)
      }));
      items.push(new DetailSectionItem('Used in', usedInItems, 'references'));
    }

    return items;
  }

  private getUtilityDetails(utility: { exports: string[]; usedIn: string[] }): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    if (utility.exports.length > 0) {
      const exportItems: DetailItemData[] = utility.exports.map(name => ({
        name,
        filePath: undefined
      }));
      items.push(new DetailSectionItem('Exports', exportItems, 'symbol-function'));
    }

    if (utility.usedIn.length > 0) {
      const usedInItems: DetailItemData[] = utility.usedIn.map(name => ({
        name,
        filePath: this.getComponentFilePath(name)
      }));
      items.push(new DetailSectionItem('Used in', usedInItems, 'references'));
    }

    return items;
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
