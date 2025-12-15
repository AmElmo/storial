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
exports.PropItem = exports.DetailLinkItem = exports.DetailSectionItem = exports.MessageTreeItem = exports.FolderTreeItem = exports.UtilityTreeItem = exports.ContextTreeItem = exports.HookTreeItem = exports.ComponentTreeItem = exports.PageTreeItem = exports.CategoryTreeItem = void 0;
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
            case 'health': return 'warning';
            default: return 'folder';
        }
    }
}
exports.CategoryTreeItem = CategoryTreeItem;
class PageTreeItem extends vscode.TreeItem {
    page;
    hasDetails;
    filePath;
    constructor(page) {
        // Make expandable if has components or links
        const hasDetails = page.components.length > 0 || page.linksTo.length > 0;
        super(page.route || '/', hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.page = page;
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
        // No command - click expands, use inline button or double-click to open file
        // Show component count
        if (page.components.length > 0) {
            this.description = `${page.components.length} components`;
        }
    }
}
exports.PageTreeItem = PageTreeItem;
class ComponentTreeItem extends vscode.TreeItem {
    component;
    hasDetails;
    filePath;
    constructor(component) {
        const usageCount = component.usedInPages.length + component.usedInComponents.length;
        const hasDetails = usageCount > 0 || component.props.length > 0;
        super(component.name, hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.component = component;
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
        this.iconPath = new vscode.ThemeIcon(component.isClientComponent ? 'browser' : 'server');
        // No command - click expands, use inline button or double-click to open file
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
    hasDetails;
    filePath;
    constructor(hook) {
        const hasDetails = hook.usedIn.length > 0 || hook.dependencies.length > 0;
        super(hook.name, hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.hook = hook;
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
exports.HookTreeItem = HookTreeItem;
class ContextTreeItem extends vscode.TreeItem {
    context;
    hasDetails;
    filePath;
    constructor(context) {
        const hasDetails = context.usedIn.length > 0;
        super(context.name, hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.context = context;
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
exports.ContextTreeItem = ContextTreeItem;
class UtilityTreeItem extends vscode.TreeItem {
    utility;
    hasDetails;
    filePath;
    constructor(utility) {
        const hasDetails = utility.usedIn.length > 0 || utility.exports.length > 0;
        super(utility.name, hasDetails ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.utility = utility;
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
class DetailSectionItem extends vscode.TreeItem {
    items;
    icon;
    constructor(label, items, icon) {
        super(label, items.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        this.items = items;
        this.icon = icon;
        this.contextValue = 'detailSection';
        this.iconPath = new vscode.ThemeIcon(icon);
        this.description = `${items.length}`;
    }
}
exports.DetailSectionItem = DetailSectionItem;
class DetailLinkItem extends vscode.TreeItem {
    constructor(label, filePath, icon) {
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
exports.DetailLinkItem = DetailLinkItem;
class PropItem extends vscode.TreeItem {
    constructor(name, type, required) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'prop';
        this.iconPath = new vscode.ThemeIcon(required ? 'symbol-property' : 'symbol-field');
        this.description = type + (required ? '' : '?');
    }
}
exports.PropItem = PropItem;
//# sourceMappingURL=treeItems.js.map