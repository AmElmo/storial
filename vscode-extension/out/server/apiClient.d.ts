import type { ScanResult, ScanOverviewData, LLMGenerateResult, LLMProvider } from '../types/api';
export declare class ApiClient {
    private projectPath;
    constructor(projectPath: string);
    isServerRunning(): Promise<boolean>;
    setProjectPath(): Promise<void>;
    scan(forceRescan?: boolean): Promise<ScanResult>;
    getOverview(): Promise<ScanOverviewData | null>;
    generateStory(type: 'component' | 'page', name: string, provider?: LLMProvider): Promise<LLMGenerateResult>;
}
//# sourceMappingURL=apiClient.d.ts.map