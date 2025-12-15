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
    readonly hasDetails: boolean;
    readonly filePath: string;
    constructor(page: PageInfo);
}
export declare class ComponentTreeItem extends vscode.TreeItem {
    readonly component: ComponentInfo;
    readonly hasDetails: boolean;
    readonly filePath: string;
    constructor(component: ComponentInfo);
}
export declare class HookTreeItem extends vscode.TreeItem {
    readonly hook: HookInfo;
    readonly hasDetails: boolean;
    readonly filePath: string;
    constructor(hook: HookInfo);
}
export declare class ContextTreeItem extends vscode.TreeItem {
    readonly context: ContextInfo;
    readonly hasDetails: boolean;
    readonly filePath: string;
    constructor(context: ContextInfo);
}
export declare class UtilityTreeItem extends vscode.TreeItem {
    readonly utility: UtilityInfo;
    readonly hasDetails: boolean;
    readonly filePath: string;
    constructor(utility: UtilityInfo);
}
export declare class FolderTreeItem extends vscode.TreeItem {
    readonly children: vscode.TreeItem[];
    constructor(label: string, children: vscode.TreeItem[]);
}
export declare class MessageTreeItem extends vscode.TreeItem {
    constructor(message: string, icon?: string);
}
export interface DetailItemData {
    name: string;
    filePath?: string;
}
export declare class DetailSectionItem extends vscode.TreeItem {
    readonly items: DetailItemData[];
    readonly icon: string;
    constructor(label: string, items: DetailItemData[], icon: string);
}
export declare class DetailLinkItem extends vscode.TreeItem {
    constructor(label: string, filePath?: string, icon?: string);
}
export declare class PropItem extends vscode.TreeItem {
    constructor(name: string, type: string, required: boolean);
}
//# sourceMappingURL=treeItems.d.ts.map