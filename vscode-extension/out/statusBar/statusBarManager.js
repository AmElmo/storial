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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    statsItem;
    serverItem;
    apiClient = null;
    constructor() {
        // Stats: "47 components | 66% stories"
        this.statsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statsItem.command = 'storial.openInBrowser';
        this.statsItem.tooltip = 'Click to open Storial in browser';
        this.statsItem.text = '$(layers) Storial';
        this.statsItem.show();
        // Server status indicator
        this.serverItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.serverItem.command = 'storial.startServer';
        this.serverItem.show();
        this.setServerStatus(false);
    }
    setApiClient(client) {
        this.apiClient = client;
    }
    async updateStats() {
        if (!this.apiClient) {
            return;
        }
        try {
            const overview = await this.apiClient.getOverview();
            if (overview) {
                const componentCount = overview.counts.components;
                const storyCoverage = overview.counts.components > 0
                    ? Math.round((overview.stories.componentsWithStories / overview.counts.components) * 100)
                    : 0;
                this.statsItem.text = `$(layers) ${componentCount} components | ${storyCoverage}% stories`;
            }
        }
        catch {
            this.statsItem.text = '$(layers) Storial';
        }
    }
    setServerStatus(running) {
        if (running) {
            this.serverItem.text = '$(check) Server';
            this.serverItem.tooltip = 'Server is running';
            this.serverItem.backgroundColor = undefined;
            this.serverItem.command = 'storial.stopServer';
        }
        else {
            this.serverItem.text = '$(x) Server';
            this.serverItem.tooltip = 'Server is not running - click to start';
            this.serverItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.serverItem.command = 'storial.startServer';
        }
    }
    dispose() {
        this.statsItem.dispose();
        this.serverItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBarManager.js.map