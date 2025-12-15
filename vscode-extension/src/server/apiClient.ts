import type { ScanResult, ScanOverviewData, LLMGenerateResult, LLMProvider } from '../types/api';

const API_BASE = 'http://localhost:3050/api';

interface ApiError {
  message?: string;
}

export class ApiClient {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async isServerRunning(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${API_BASE}/project`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }

  async setProjectPath(): Promise<void> {
    const response = await fetch(`${API_BASE}/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: this.projectPath })
    });

    if (!response.ok) {
      const error = (await response.json()) as ApiError;
      throw new Error(error.message || 'Failed to set project path');
    }
  }

  async scan(forceRescan: boolean = false): Promise<ScanResult> {
    const response = await fetch(`${API_BASE}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: this.projectPath, forceRescan })
    });

    if (!response.ok) {
      const error = (await response.json()) as ApiError;
      throw new Error(error.message || 'Failed to scan project');
    }

    return (await response.json()) as ScanResult;
  }

  async getOverview(): Promise<ScanOverviewData | null> {
    try {
      const response = await fetch(`${API_BASE}/scan/overview`);

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as ScanOverviewData;
    } catch {
      return null;
    }
  }

  async generateStory(
    type: 'component' | 'page',
    name: string,
    provider: LLMProvider = 'local'
  ): Promise<LLMGenerateResult> {
    const response = await fetch(`${API_BASE}/stories/generate-with-llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, provider })
    });

    return (await response.json()) as LLMGenerateResult;
  }
}
