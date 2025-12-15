import * as vscode from 'vscode';
import { ApiClient } from '../server/apiClient';
export declare class StatusBarManager implements vscode.Disposable {
    private statsItem;
    private serverItem;
    private apiClient;
    constructor();
    setApiClient(client: ApiClient): void;
    updateStats(): Promise<void>;
    setServerStatus(running: boolean): void;
    dispose(): void;
}
//# sourceMappingURL=statusBarManager.d.ts.map