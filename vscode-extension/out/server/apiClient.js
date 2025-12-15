"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const API_BASE = 'http://localhost:3050/api';
class ApiClient {
    projectPath;
    constructor(projectPath) {
        this.projectPath = projectPath;
    }
    async isServerRunning() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(`${API_BASE}/project`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response.ok || response.status === 404;
        }
        catch {
            return false;
        }
    }
    async setProjectPath() {
        const response = await fetch(`${API_BASE}/project`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: this.projectPath })
        });
        if (!response.ok) {
            const error = (await response.json());
            throw new Error(error.message || 'Failed to set project path');
        }
    }
    async scan(forceRescan = false) {
        const response = await fetch(`${API_BASE}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: this.projectPath, forceRescan })
        });
        if (!response.ok) {
            const error = (await response.json());
            throw new Error(error.message || 'Failed to scan project');
        }
        return (await response.json());
    }
    async getOverview() {
        try {
            const response = await fetch(`${API_BASE}/scan/overview`);
            if (!response.ok) {
                return null;
            }
            return (await response.json());
        }
        catch {
            return null;
        }
    }
    async generateStory(type, name, provider = 'local') {
        const response = await fetch(`${API_BASE}/stories/generate-with-llm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name, provider })
        });
        return (await response.json());
    }
}
exports.ApiClient = ApiClient;
//# sourceMappingURL=apiClient.js.map