import * as vscode from 'vscode';
import type { PageInfo, ComponentInfo, HookInfo, ContextInfo, UtilityInfo } from '../types/api';

export class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    label: string,
    public readonly itemCount: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'category';
    this.iconPath = new vscode.ThemeIcon(this.getIconForCategory(category));
    this.description = `${itemCount}`;
  }

  private getIconForCategory(category: string): string {
    switch (category) {
      case 'pages': return 'file';
      case 'components': return 'symbol-class';
      case 'hooks': return 'symbol-method';
      case 'contexts': return 'symbol-interface';
      case 'utilities': return 'tools';
      case 'health': return 'warning';
      default: return 'folder';
    }
  }
}

export class PageTreeItem extends vscode.TreeItem {
  public readonly hasDetails: boolean;
  public readonly filePath: string;

  constructor(public readonly page: PageInfo) {
    // Make expandable if has components or links
    const hasDetails = page.components.length > 0 || page.linksTo.length > 0;
    super(
      page.route || '/',
      hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.hasDetails = hasDetails;
    this.filePath = page.filePath;
    this.contextValue = 'page';

    // Tooltip with details
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${page.route || '/'}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${page.fileName}\`\n`);
    if (page.components.length > 0) {
      tooltip.appendMarkdown(`- Components: ${page.components.length}\n`);
    }
    if (page.linksTo.length > 0) {
      tooltip.appendMarkdown(`- Links to: ${page.linksTo.length} pages\n`);
    }
    if (page.dataDependencies.length > 0) {
      tooltip.appendMarkdown(`- Data deps: ${page.dataDependencies.length}\n`);
    }
    tooltip.appendMarkdown(`\n*Double-click or use inline button to open file*`);
    this.tooltip = tooltip;

    // Icon based on type
    if (page.isLayout) {
      this.iconPath = new vscode.ThemeIcon('layout');
    } else if (page.isLoading) {
      this.iconPath = new vscode.ThemeIcon('loading~spin');
    } else if (page.isError) {
      this.iconPath = new vscode.ThemeIcon('error');
    } else {
      this.iconPath = new vscode.ThemeIcon('file');
    }

    // No command - click expands, use inline button or double-click to open file

    // Show component count
    if (page.components.length > 0) {
      this.description = `${page.components.length} components`;
    }
  }
}

export class ComponentTreeItem extends vscode.TreeItem {
  public readonly hasDetails: boolean;
  public readonly filePath: string;

  constructor(public readonly component: ComponentInfo) {
    const usageCount = component.usedInPages.length + component.usedInComponents.length;
    const hasDetails = usageCount > 0 || component.props.length > 0;

    super(
      component.name,
      hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.hasDetails = hasDetails;
    this.filePath = component.filePath;
    this.contextValue = 'component';

    // Tooltip
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${component.name}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${component.fileName}\`\n`);
    tooltip.appendMarkdown(`- Type: ${component.isClientComponent ? 'Client Component' : 'Server Component'}\n`);
    tooltip.appendMarkdown(`- Used in: ${usageCount} places\n`);
    if (component.props.length > 0) {
      tooltip.appendMarkdown(`- Props: ${component.props.map(p => p.name).join(', ')}\n`);
    }
    tooltip.appendMarkdown(`\n*Double-click or use inline button to open file*`);
    this.tooltip = tooltip;

    // Icon
    this.iconPath = new vscode.ThemeIcon(
      component.isClientComponent ? 'browser' : 'server'
    );

    // No command - click expands, use inline button or double-click to open file

    // Usage count as description
    if (usageCount > 0) {
      this.description = `${usageCount}×`;
    } else {
      this.description = 'unused';
    }
  }
}

export class HookTreeItem extends vscode.TreeItem {
  public readonly hasDetails: boolean;
  public readonly filePath: string;

  constructor(public readonly hook: HookInfo) {
    const hasDetails = hook.usedIn.length > 0 || hook.dependencies.length > 0;

    super(
      hook.name,
      hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.hasDetails = hasDetails;
    this.filePath = hook.filePath;
    this.contextValue = 'hook';
    this.iconPath = new vscode.ThemeIcon('symbol-method');

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${hook.name}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${hook.fileName}\`\n`);
    if (hook.dependencies.length > 0) {
      tooltip.appendMarkdown(`- Dependencies: ${hook.dependencies.join(', ')}\n`);
    }
    tooltip.appendMarkdown(`- Used in: ${hook.usedIn.length} places\n`);
    tooltip.appendMarkdown(`\n*Double-click or use inline button to open file*`);
    this.tooltip = tooltip;

    // No command - click expands, use inline button or double-click to open file

    this.description = hook.usedIn.length > 0 ? `${hook.usedIn.length}×` : 'unused';
  }
}

export class ContextTreeItem extends vscode.TreeItem {
  public readonly hasDetails: boolean;
  public readonly filePath: string;

  constructor(public readonly context: ContextInfo) {
    const hasDetails = context.usedIn.length > 0;

    super(
      context.name,
      hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.hasDetails = hasDetails;
    this.filePath = context.filePath;
    this.contextValue = 'context';
    this.iconPath = new vscode.ThemeIcon('symbol-interface');

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${context.name}**\n\n`);
    tooltip.appendMarkdown(`- Provider: \`${context.providerName}\`\n`);
    tooltip.appendMarkdown(`- File: \`${context.fileName}\`\n`);
    tooltip.appendMarkdown(`- Used in: ${context.usedIn.length} places\n`);
    tooltip.appendMarkdown(`\n*Double-click or use inline button to open file*`);
    this.tooltip = tooltip;

    // No command - click expands, use inline button or double-click to open file

    this.description = context.usedIn.length > 0 ? `${context.usedIn.length}×` : 'unused';
  }
}

export class UtilityTreeItem extends vscode.TreeItem {
  public readonly hasDetails: boolean;
  public readonly filePath: string;

  constructor(public readonly utility: UtilityInfo) {
    const hasDetails = utility.usedIn.length > 0 || utility.exports.length > 0;

    super(
      utility.name,
      hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.hasDetails = hasDetails;
    this.filePath = utility.filePath;
    this.contextValue = 'utility';
    this.iconPath = new vscode.ThemeIcon('tools');

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${utility.name}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${utility.fileName}\`\n`);
    tooltip.appendMarkdown(`- Exports: ${utility.exports.join(', ')}\n`);
    tooltip.appendMarkdown(`- Used in: ${utility.usedIn.length} places\n`);
    tooltip.appendMarkdown(`\n*Double-click or use inline button to open file*`);
    this.tooltip = tooltip;

    // No command - click expands, use inline button or double-click to open file

    this.description = `${utility.exports.length} exports`;
  }
}

export class FolderTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly children: vscode.TreeItem[]
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'folder';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = `${children.length}`;
  }
}

export class MessageTreeItem extends vscode.TreeItem {
  constructor(message: string, icon?: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'message';
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
  }
}

// Detail items for expanded views
export interface DetailItemData {
  name: string;
  filePath?: string;
}

export class DetailSectionItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly items: DetailItemData[],
    public readonly icon: string
  ) {
    super(label, items.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'detailSection';
    this.iconPath = new vscode.ThemeIcon(icon);
    this.description = `${items.length}`;
  }
}

export class DetailLinkItem extends vscode.TreeItem {
  constructor(
    label: string,
    filePath?: string,
    icon?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'detailLink';
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }

    if (filePath) {
      this.command = {
        command: 'nextjsExplorer.goToFile',
        title: 'Go to File',
        arguments: [filePath]
      };
      this.tooltip = `Click to open ${filePath}`;
    }
  }
}

export class PropItem extends vscode.TreeItem {
  constructor(name: string, type: string, required: boolean) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'prop';
    this.iconPath = new vscode.ThemeIcon(required ? 'symbol-property' : 'symbol-field');
    this.description = type + (required ? '' : '?');
  }
}
