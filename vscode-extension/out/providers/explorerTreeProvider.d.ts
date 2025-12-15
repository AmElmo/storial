import * as vscode from 'vscode';
import { ApiClient } from '../server/apiClient';
import type { ScanResult } from '../types/api';
export declare class ExplorerTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined>;
    private scanResult;
    private apiClient;
    private isLoading;
    private errorMessage;
    private serverConnected;
    setApiClient(client: ApiClient): void;
    setServerConnected(connected: boolean): void;
    refresh(forceRescan?: boolean): Promise<void>;
    getScanResult(): ScanResult | null;
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem;
    getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]>;
    private getRootCategories;
    private getCategoryChildren;
    private getComponentFilePath;
    private getPageFilePath;
    private getPageDetails;
    private getComponentDetails;
    private getHookDetails;
    private getContextDetails;
    private getUtilityDetails;
    private groupPagesByFolder;
    private groupComponentsByFolder;
}
//# sourceMappingURL=explorerTreeProvider.d.ts.map