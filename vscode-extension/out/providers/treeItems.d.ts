import * as vscode from 'vscode';
import type { PageInfo, ComponentInfo, HookInfo, ContextInfo, UtilityInfo } from '../types/api';
export declare class CategoryTreeItem extends vscode.TreeItem {
    readonly category: string;
    readonly itemCount: number;
    constructor(category: string, label: string, itemCount: number);
    private getIconForCategory;
}
export declare class PageTreeItem extends vscode.TreeItem {
    readonly page: PageInfo;
    constructor(page: PageInfo);
}
export declare class ComponentTreeItem extends vscode.TreeItem {
    readonly component: ComponentInfo;
    constructor(component: ComponentInfo);
}
export declare class HookTreeItem extends vscode.TreeItem {
    readonly hook: HookInfo;
    constructor(hook: HookInfo);
}
export declare class ContextTreeItem extends vscode.TreeItem {
    readonly context: ContextInfo;
    constructor(context: ContextInfo);
}
export declare class UtilityTreeItem extends vscode.TreeItem {
    readonly utility: UtilityInfo;
    constructor(utility: UtilityInfo);
}
export declare class FolderTreeItem extends vscode.TreeItem {
    readonly children: vscode.TreeItem[];
    constructor(label: string, children: vscode.TreeItem[]);
}
export declare class MessageTreeItem extends vscode.TreeItem {
    constructor(message: string, icon?: string);
}
//# sourceMappingURL=treeItems.d.ts.map