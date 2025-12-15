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
      default: return 'folder';
    }
  }
}

export class PageTreeItem extends vscode.TreeItem {
  constructor(public readonly page: PageInfo) {
    super(page.route || '/', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'page';

    // Tooltip with details
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${page.route || '/'}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${page.fileName}\`\n`);
    if (page.components.length > 0) {
      tooltip.appendMarkdown(`- Components: ${page.components.length}\n`);
    }
    if (page.dataDependencies.length > 0) {
      tooltip.appendMarkdown(`- Data deps: ${page.dataDependencies.length}\n`);
    }
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

    // Command to open file
    this.command = {
      command: 'nextjsExplorer.goToFile',
      title: 'Go to File',
      arguments: [page.filePath]
    };

    // Show component count
    if (page.components.length > 0) {
      this.description = `${page.components.length} components`;
    }
  }
}

export class ComponentTreeItem extends vscode.TreeItem {
  constructor(public readonly component: ComponentInfo) {
    super(component.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'component';

    const usageCount = component.usedInPages.length + component.usedInComponents.length;

    // Tooltip
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${component.name}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${component.fileName}\`\n`);
    tooltip.appendMarkdown(`- Type: ${component.isClientComponent ? 'Client Component' : 'Server Component'}\n`);
    tooltip.appendMarkdown(`- Used in: ${usageCount} places\n`);
    if (component.props.length > 0) {
      tooltip.appendMarkdown(`- Props: ${component.props.map(p => p.name).join(', ')}\n`);
    }
    this.tooltip = tooltip;

    // Icon
    this.iconPath = new vscode.ThemeIcon(
      component.isClientComponent ? 'browser' : 'server'
    );

    // Command
    this.command = {
      command: 'nextjsExplorer.goToFile',
      title: 'Go to File',
      arguments: [component.filePath]
    };

    // Usage count as description
    if (usageCount > 0) {
      this.description = `${usageCount}×`;
    } else {
      this.description = 'unused';
    }
  }
}

export class HookTreeItem extends vscode.TreeItem {
  constructor(public readonly hook: HookInfo) {
    super(hook.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'hook';
    this.iconPath = new vscode.ThemeIcon('symbol-method');

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${hook.name}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${hook.fileName}\`\n`);
    if (hook.dependencies.length > 0) {
      tooltip.appendMarkdown(`- Dependencies: ${hook.dependencies.join(', ')}\n`);
    }
    tooltip.appendMarkdown(`- Used in: ${hook.usedIn.length} places\n`);
    this.tooltip = tooltip;

    this.description = hook.usedIn.length > 0 ? `${hook.usedIn.length}×` : 'unused';

    this.command = {
      command: 'nextjsExplorer.goToFile',
      title: 'Go to File',
      arguments: [hook.filePath]
    };
  }
}

export class ContextTreeItem extends vscode.TreeItem {
  constructor(public readonly context: ContextInfo) {
    super(context.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'context';
    this.iconPath = new vscode.ThemeIcon('symbol-interface');

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${context.name}**\n\n`);
    tooltip.appendMarkdown(`- Provider: \`${context.providerName}\`\n`);
    tooltip.appendMarkdown(`- File: \`${context.fileName}\`\n`);
    tooltip.appendMarkdown(`- Used in: ${context.usedIn.length} places\n`);
    this.tooltip = tooltip;

    this.description = context.usedIn.length > 0 ? `${context.usedIn.length}×` : 'unused';

    this.command = {
      command: 'nextjsExplorer.goToFile',
      title: 'Go to File',
      arguments: [context.filePath]
    };
  }
}

export class UtilityTreeItem extends vscode.TreeItem {
  constructor(public readonly utility: UtilityInfo) {
    super(utility.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'utility';
    this.iconPath = new vscode.ThemeIcon('tools');

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${utility.name}**\n\n`);
    tooltip.appendMarkdown(`- File: \`${utility.fileName}\`\n`);
    tooltip.appendMarkdown(`- Exports: ${utility.exports.join(', ')}\n`);
    tooltip.appendMarkdown(`- Used in: ${utility.usedIn.length} places\n`);
    this.tooltip = tooltip;

    this.description = `${utility.exports.length} exports`;

    this.command = {
      command: 'nextjsExplorer.goToFile',
      title: 'Go to File',
      arguments: [utility.filePath]
    };
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
