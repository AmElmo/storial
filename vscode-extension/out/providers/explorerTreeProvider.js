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
exports.ExplorerTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const treeItems_1 = require("./treeItems");
class ExplorerTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    scanResult = null;
    apiClient = null;
    isLoading = false;
    errorMessage = null;
    serverConnected = false;
    setApiClient(client) {
        this.apiClient = client;
    }
    setServerConnected(connected) {
        this.serverConnected = connected;
        this._onDidChangeTreeData.fire(undefined);
    }
    async refresh(forceRescan = false) {
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
        }
        catch (error) {
            this.errorMessage = error instanceof Error ? error.message : 'Failed to scan project';
            this.scanResult = null;
        }
        finally {
            this.isLoading = false;
            this._onDidChangeTreeData.fire(undefined);
        }
    }
    getScanResult() {
        return this.scanResult;
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        // Server not connected
        if (!this.serverConnected && !this.scanResult) {
            return [
                new treeItems_1.MessageTreeItem('Server not connected', 'warning'),
                new treeItems_1.MessageTreeItem('Click refresh after starting server', 'info')
            ];
        }
        // Loading state
        if (this.isLoading) {
            return [new treeItems_1.MessageTreeItem('Scanning project...', 'loading~spin')];
        }
        // Error state
        if (this.errorMessage) {
            return [new treeItems_1.MessageTreeItem(this.errorMessage, 'error')];
        }
        // No scan result yet
        if (!this.scanResult) {
            return [new treeItems_1.MessageTreeItem('Click refresh to scan', 'info')];
        }
        // Root level - show categories
        if (!element) {
            return this.getRootCategories();
        }
        // Category level - show items
        if (element instanceof treeItems_1.CategoryTreeItem) {
            return this.getCategoryChildren(element.category);
        }
        // Folder level - show items in folder
        if (element instanceof treeItems_1.FolderTreeItem) {
            return element.children;
        }
        return [];
    }
    getRootCategories() {
        const result = this.scanResult;
        const pages = result.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError);
        const categories = [];
        // Always show pages and components
        categories.push(new treeItems_1.CategoryTreeItem('pages', 'Pages', pages.length));
        categories.push(new treeItems_1.CategoryTreeItem('components', 'Components', result.components.length));
        // Show other categories only if they have items
        if (result.hooks?.length > 0) {
            categories.push(new treeItems_1.CategoryTreeItem('hooks', 'Hooks', result.hooks.length));
        }
        if (result.contexts?.length > 0) {
            categories.push(new treeItems_1.CategoryTreeItem('contexts', 'Contexts', result.contexts.length));
        }
        if (result.utilities?.length > 0) {
            categories.push(new treeItems_1.CategoryTreeItem('utilities', 'Utilities', result.utilities.length));
        }
        return categories;
    }
    getCategoryChildren(category) {
        const result = this.scanResult;
        switch (category) {
            case 'pages':
                return this.groupPagesByFolder(result.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError));
            case 'components':
                return this.groupComponentsByFolder(result.components);
            case 'hooks':
                return (result.hooks || []).map(h => new treeItems_1.HookTreeItem(h));
            case 'contexts':
                return (result.contexts || []).map(c => new treeItems_1.ContextTreeItem(c));
            case 'utilities':
                return (result.utilities || []).map(u => new treeItems_1.UtilityTreeItem(u));
            default:
                return [];
        }
    }
    groupPagesByFolder(pages) {
        // Sort pages by route
        const sortedPages = [...pages].sort((a, b) => a.route.localeCompare(b.route));
        // Group by first route segment
        const groups = new Map();
        for (const page of sortedPages) {
            const parts = page.route.split('/').filter(Boolean);
            const folder = parts.length > 1 ? '/' + parts[0] : '/';
            if (!groups.has(folder)) {
                groups.set(folder, []);
            }
            groups.get(folder).push(page);
        }
        // Build tree items
        const items = [];
        // Handle root pages first
        const rootPages = groups.get('/') || [];
        for (const page of rootPages) {
            items.push(new treeItems_1.PageTreeItem(page));
        }
        // Then grouped pages
        for (const [folder, folderPages] of groups) {
            if (folder === '/')
                continue;
            if (folderPages.length === 1) {
                items.push(new treeItems_1.PageTreeItem(folderPages[0]));
            }
            else {
                const children = folderPages.map(p => new treeItems_1.PageTreeItem(p));
                items.push(new treeItems_1.FolderTreeItem(folder, children));
            }
        }
        return items;
    }
    groupComponentsByFolder(components) {
        // Sort components by name
        const sortedComponents = [...components].sort((a, b) => a.name.localeCompare(b.name));
        // Group by folder within components directory
        const groups = new Map();
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
            groups.get(folder).push(comp);
        }
        // If only one group (root), return flat list
        if (groups.size === 1 && groups.has('root')) {
            return sortedComponents.map(c => new treeItems_1.ComponentTreeItem(c));
        }
        // Build folder tree
        const items = [];
        // Root components first (if any)
        const rootComps = groups.get('root') || [];
        for (const comp of rootComps) {
            items.push(new treeItems_1.ComponentTreeItem(comp));
        }
        // Then folders
        for (const [folder, comps] of groups) {
            if (folder === 'root')
                continue;
            const children = comps.map(c => new treeItems_1.ComponentTreeItem(c));
            items.push(new treeItems_1.FolderTreeItem(folder, children));
        }
        return items;
    }
}
exports.ExplorerTreeProvider = ExplorerTreeProvider;
//# sourceMappingURL=explorerTreeProvider.js.map