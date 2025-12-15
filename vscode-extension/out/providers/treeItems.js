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
exports.MessageTreeItem = exports.FolderTreeItem = exports.UtilityTreeItem = exports.ContextTreeItem = exports.HookTreeItem = exports.ComponentTreeItem = exports.PageTreeItem = exports.CategoryTreeItem = void 0;
const vscode = __importStar(require("vscode"));
class CategoryTreeItem extends vscode.TreeItem {
    category;
    itemCount;
    constructor(category, label, itemCount) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.category = category;
        this.itemCount = itemCount;
        this.contextValue = 'category';
        this.iconPath = new vscode.ThemeIcon(this.getIconForCategory(category));
        this.description = `${itemCount}`;
    }
    getIconForCategory(category) {
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
exports.CategoryTreeItem = CategoryTreeItem;
class PageTreeItem extends vscode.TreeItem {
    page;
    constructor(page) {
        super(page.route || '/', vscode.TreeItemCollapsibleState.None);
        this.page = page;
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
        }
        else if (page.isLoading) {
            this.iconPath = new vscode.ThemeIcon('loading~spin');
        }
        else if (page.isError) {
            this.iconPath = new vscode.ThemeIcon('error');
        }
        else {
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
exports.PageTreeItem = PageTreeItem;
class ComponentTreeItem extends vscode.TreeItem {
    component;
    constructor(component) {
        super(component.name, vscode.TreeItemCollapsibleState.None);
        this.component = component;
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
        this.iconPath = new vscode.ThemeIcon(component.isClientComponent ? 'browser' : 'server');
        // Command
        this.command = {
            command: 'nextjsExplorer.goToFile',
            title: 'Go to File',
            arguments: [component.filePath]
        };
        // Usage count as description
        if (usageCount > 0) {
            this.description = `${usageCount}×`;
        }
        else {
            this.description = 'unused';
        }
    }
}
exports.ComponentTreeItem = ComponentTreeItem;
class HookTreeItem extends vscode.TreeItem {
    hook;
    constructor(hook) {
        super(hook.name, vscode.TreeItemCollapsibleState.None);
        this.hook = hook;
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
exports.HookTreeItem = HookTreeItem;
class ContextTreeItem extends vscode.TreeItem {
    context;
    constructor(context) {
        super(context.name, vscode.TreeItemCollapsibleState.None);
        this.context = context;
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
exports.ContextTreeItem = ContextTreeItem;
class UtilityTreeItem extends vscode.TreeItem {
    utility;
    constructor(utility) {
        super(utility.name, vscode.TreeItemCollapsibleState.None);
        this.utility = utility;
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
exports.UtilityTreeItem = UtilityTreeItem;
class FolderTreeItem extends vscode.TreeItem {
    children;
    constructor(label, children) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.children = children;
        this.contextValue = 'folder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = `${children.length}`;
    }
}
exports.FolderTreeItem = FolderTreeItem;
class MessageTreeItem extends vscode.TreeItem {
    constructor(message, icon) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'message';
        if (icon) {
            this.iconPath = new vscode.ThemeIcon(icon);
        }
    }
}
exports.MessageTreeItem = MessageTreeItem;
//# sourceMappingURL=treeItems.js.map