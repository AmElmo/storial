// API client for communicating with the scanner server
// FEATURES: Only heuristic-based, high-reliability features

// Client-side logging utility
const log = {
  api: (method: string, endpoint: string, data?: any) => {
    console.debug(`%c[API ${method}]%c ${endpoint}`, 'color: #8b5cf6; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  },
  success: (msg: string, data?: any) => {
    console.debug(`%c[API ✓]%c ${msg}`, 'color: #22c55e; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  },
  error: (msg: string, data?: any) => {
    console.debug(`%c[API ✗]%c ${msg}`, 'color: #ef4444; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  },
  debug: (msg: string, data?: any) => {
    console.debug(`%c[API 🔍]%c ${msg}`, 'color: #6b7280; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  }
};

// ==================== TYPES ====================

export interface PageInfo {
  route: string;
  filePath: string;
  fileName: string;
  isLayout?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  componentName?: string; // For React Router - the component rendered at this route
  components: string[];
  linksTo: string[];
  dataDependencies: DataDependency[];
}

export interface ServerActionDependency {
  functionName: string;
  importPath: string;
  sourceFilePath: string;
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  fileName: string;
  isClientComponent: boolean;
  props: PropInfo[];
  usedInPages: string[];
  usedInComponents: string[];
  imports: string[];
  dataDependencies: DataDependency[];
  serverActions: ServerActionDependency[];
}

export interface DataDependency {
  type: 'fetch' | 'prisma' | 'drizzle' | 'useQuery' | 'useSWR' | 'serverAction' | 'unknown';
  source: string;
  line: number;
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

export interface HookInfo {
  name: string;
  filePath: string;
  fileName: string;
  description?: string;
  dependencies: string[];
  usedIn: string[];
}

export interface ContextInfo {
  name: string;
  filePath: string;
  fileName: string;
  providerName: string;
  usedIn: string[];
}

export interface UtilityInfo {
  name: string;
  filePath: string;
  fileName: string;
  exports: string[];
  usedIn: string[];
}

export interface LayoutNode {
  route: string;
  filePath: string;
  children: LayoutNode[];
}

export type RouterType = 'nextjs-app' | 'nextjs-pages' | 'react-router' | 'unknown';

export interface ServerActionFile {
  filePath: string;
  relativePath: string;
  exportedFunctions: string[];
}

export interface ScanResult {
  projectPath: string;
  projectName: string;
  routerType: RouterType;
  framework: 'nextjs' | 'react' | 'unknown';
  pages: PageInfo[];
  components: ComponentInfo[];
  hooks: HookInfo[];
  contexts: ContextInfo[];
  utilities: UtilityInfo[];
  serverActionFiles: ServerActionFile[];
  layoutHierarchy: LayoutNode | null;
  scannedAt: string;
}

export interface ScanResultWithCache extends ScanResult {
  fromCache?: boolean;
}

export interface ProjectConfig {
  path: string;
  name?: string;
}

// ==================== API FUNCTIONS ====================

const API_BASE = '/api';

export async function scanProject(projectPath: string, forceRescan: boolean = false): Promise<ScanResultWithCache> {
  log.api('POST', '/scan', { projectPath, forceRescan });
  const startTime = performance.now();

  try {
    const response = await fetch(`${API_BASE}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath, forceRescan }),
    });

    const duration = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const error = await response.json();
      log.error(`Scan failed (${response.status}) in ${duration}ms`, error);
      throw new Error(error.message || 'Failed to scan project');
    }

    const result = await response.json();
    log.success(`Scan completed in ${duration}ms`, {
      pages: result.pages?.length,
      components: result.components?.length,
      routerType: result.routerType,
      fromCache: result.fromCache
    });

    return result;
  } catch (err) {
    log.error('Scan request failed', err);
    throw err;
  }
}

export async function getProjectInfo(): Promise<ProjectConfig | null> {
  log.api('GET', '/project');

  try {
    const response = await fetch(`${API_BASE}/project`);

    if (!response.ok) {
      log.debug('No project configured (404)');
      return null;
    }

    const result = await response.json();
    log.success('Got project info', result);
    return result;
  } catch (err) {
    log.error('Failed to get project info', err);
    return null;
  }
}

// Import the type from ScanOverview component
export interface ScanOverviewData {
  projectPath: string;
  projectName: string;
  framework: 'nextjs' | 'react' | 'unknown';
  routerType: 'nextjs-app' | 'nextjs-pages' | 'react-router' | 'unknown';
  scannedAt: string;
  fromCache?: boolean;
  cachedAt?: string;
  counts: {
    pages: number;
    layouts: number;
    components: number;
    hooks: number;
    contexts: number;
    utilities: number;
    serverActionFiles: number;
  };
  stories: {
    pagesWithStories: number;
    componentsWithStories: number;
    totalPageStories: number;
    totalComponentStories: number;
  };
  details?: {
    pages: Array<{
      route: string;
      fileName: string;
      isLayout: boolean;
      isLoading: boolean;
      isError: boolean;
      hasStories: boolean;
    }>;
    components: Array<{
      name: string;
      fileName: string;
      isClientComponent: boolean;
      hasStories: boolean;
      usedInPages: number;
      usedInComponents: number;
    }>;
  };
}

export async function getScanOverview(): Promise<ScanOverviewData | null> {
  log.api('GET', '/scan/overview');

  try {
    const response = await fetch(`${API_BASE}/scan/overview`);

    if (!response.ok) {
      log.debug('No scan overview available');
      return null;
    }

    const result = await response.json();
    log.success('Got scan overview', result);
    return result;
  } catch (err) {
    log.error('Failed to get scan overview', err);
    return null;
  }
}

export async function setProjectPath(projectPath: string): Promise<void> {
  log.api('POST', '/project', { projectPath });
  
  try {
    const response = await fetch(`${API_BASE}/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      log.error('Failed to set project path', error);
      throw new Error(error.message || 'Failed to set project path');
    }
    
    log.success('Project path set successfully');
  } catch (err) {
    log.error('Set project path request failed', err);
    throw err;
  }
}

export async function getFileContent(filePath: string): Promise<string> {
  log.api('GET', '/file', { path: filePath });
  
  try {
    const response = await fetch(`${API_BASE}/file?path=${encodeURIComponent(filePath)}`);
    
    if (!response.ok) {
      log.error(`File not found: ${filePath}`);
      throw new Error('Failed to read file');
    }
    
    const data = await response.json();
    log.success(`File read (${data.content.length} chars)`);
    return data.content;
  } catch (err) {
    log.error('Get file content failed', err);
    throw err;
  }
}

// ==================== STORIES API ====================

export interface MockServerActionConfig {
  returns?: any;
  throwError?: string;
  delay?: number;
}

export interface MockServerActionsConfig {
  [importPath: string]: {
    [functionName: string]: MockServerActionConfig;
  };
}

export interface StoryDefinition {
  id: string;
  name: string;
  description?: string;
  props?: Record<string, any>;
  routeParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  mockAuth?: Record<string, any>;
  mockApi?: Record<string, any>;
  mockServerActions?: MockServerActionsConfig;
  mockContext?: Record<string, any>;
}

export interface StoriesFile {
  componentName?: string;
  pageName?: string;
  type: 'component' | 'page';
  stories: StoryDefinition[];
  themeVariants?: string[];
  viewports?: Array<{ name: string; width: number; height: number }>;
}

export interface StoriesList {
  components: string[];
  pages: string[];
}

export async function setupStoryTemplates(): Promise<{ created: boolean; path: string }> {
  log.api('POST', '/stories/setup');
  
  try {
    const response = await fetch(`${API_BASE}/stories/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const error = await response.json();
      log.error('Failed to setup templates', error);
      throw new Error(error.message || 'Failed to setup templates');
    }
    
    const result = await response.json();
    log.success('Templates setup complete', result);
    return result;
  } catch (err) {
    log.error('Setup templates request failed', err);
    throw err;
  }
}

export async function generateStoriesPrompt(
  type: 'component' | 'page', 
  name: string
): Promise<{ prompt: string; type: string; name: string }> {
  log.api('POST', '/stories/generate-prompt', { type, name });
  
  try {
    const response = await fetch(`${API_BASE}/stories/generate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name })
    });
    
    if (!response.ok) {
      const error = await response.json();
      log.error('Failed to generate prompt', error);
      throw new Error(error.message || 'Failed to generate prompt');
    }
    
    const result = await response.json();
    log.success('Generated prompt', { length: result.prompt.length });
    return result;
  } catch (err) {
    log.error('Generate prompt request failed', err);
    throw err;
  }
}

export async function getStories(
  type: 'component' | 'page', 
  name: string
): Promise<StoriesFile | null> {
  log.api('GET', `/stories/${type}/${name}`);
  
  try {
    const response = await fetch(`${API_BASE}/stories/${type}/${encodeURIComponent(name)}`);
    
    if (response.status === 404) {
      log.debug('No stories found');
      return null;
    }
    
    if (!response.ok) {
      const error = await response.json();
      log.error('Failed to get stories', error);
      throw new Error(error.message || 'Failed to get stories');
    }
    
    const result = await response.json();
    log.success('Got stories', { count: result.stories.length });
    return result;
  } catch (err) {
    log.error('Get stories request failed', err);
    throw err;
  }
}

export async function listAllStories(): Promise<StoriesList> {
  log.api('GET', '/stories');
  
  try {
    const response = await fetch(`${API_BASE}/stories`);
    
    if (!response.ok) {
      const error = await response.json();
      log.error('Failed to list stories', error);
      throw new Error(error.message || 'Failed to list stories');
    }
    
    const result = await response.json();
    log.success('Listed stories', result);
    return result;
  } catch (err) {
    log.error('List stories request failed', err);
    throw err;
  }
}

// ==================== PREVIEW API ====================

export interface PreviewSetupResult {
  success: boolean;
  message: string;
  filesCreated: string[];
  filesModified: string[];
  previewUrl: string;
}

export interface PreviewStatus {
  isSetup: boolean;
  previewFileExists: boolean;
  routeExists: boolean;
  previewFilePath: string | null;
}

export async function setupPreview(): Promise<PreviewSetupResult> {
  log.api('POST', '/preview/setup');
  
  try {
    const response = await fetch(`${API_BASE}/preview/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (result.success) {
      log.success('Preview setup complete', result);
    } else {
      log.error('Preview setup failed', result);
    }
    
    return result;
  } catch (err) {
    log.error('Preview setup request failed', err);
    throw err;
  }
}

export async function getPreviewStatus(): Promise<PreviewStatus> {
  log.api('GET', '/preview/status');
  
  try {
    const response = await fetch(`${API_BASE}/preview/status`);
    
    if (!response.ok) {
      const error = await response.json();
      log.error('Failed to get preview status', error);
      throw new Error(error.message || 'Failed to get preview status');
    }
    
    const result = await response.json();
    log.success('Preview status', result);
    return result;
  } catch (err) {
    log.error('Get preview status request failed', err);
    throw err;
  }
}

export async function removePreview(): Promise<{ success: boolean; message: string }> {
  log.api('DELETE', '/preview');
  
  try {
    const response = await fetch(`${API_BASE}/preview`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      log.success('Preview removed');
    } else {
      log.error('Failed to remove preview', result);
    }
    
    return result;
  } catch (err) {
    log.error('Remove preview request failed', err);
    throw err;
  }
}

// ==================== SERVER ACTIONS DETECTION ====================
// Note: Server action MOCKING has been removed due to Next.js/Turbopack limitations.
// We only detect server actions to show user warnings.

export async function getServerActions(): Promise<ServerActionFile[]> {
  log.api('GET', '/server-actions');
  
  try {
    const response = await fetch(`${API_BASE}/server-actions`);
    
    if (!response.ok) {
      const error = await response.json();
      log.error('Failed to get server actions', error);
      throw new Error(error.message || 'Failed to get server actions');
    }
    
    const result = await response.json();
    log.success('Got server actions', { count: result.length });
    return result;
  } catch (err) {
    log.error('Get server actions request failed', err);
    throw err;
  }
}

// Note: Server action MOCKING has been removed due to Next.js/Turbopack limitations.
// The getServerActions() function above is kept for DETECTION only, to show user warnings.

// ==================== LLM API ====================

export type LLMProvider = 'local' | 'openai' | 'openrouter';

// OpenRouter model configuration - mirrors server-side config
export interface OpenRouterModel {
  id: string;           // OpenRouter model ID
  name: string;         // Display name
  description: string;  // Short description
  provider: string;     // Original provider (anthropic, openai, google, etc.)
}

// Pre-configured models for the dropdown - should match server-side list
// This is intentionally duplicated for type safety and immediate UI availability
export const OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Latest Claude - excellent for code', provider: 'anthropic' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', description: 'Fast & affordable Claude', provider: 'anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship model', provider: 'openai' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & cheap GPT-4', provider: 'openai' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: 'Google latest fast model', provider: 'google' },
  { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', description: 'Google most capable model', provider: 'google' },
  { id: 'x-ai/grok-3-mini-beta', name: 'Grok 3 Mini', description: 'xAI reasoning model', provider: 'xai' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct', name: 'Mistral Small 3.1', description: 'Fast Mistral model', provider: 'mistral' },
  { id: 'mistralai/mistral-large-latest', name: 'Mistral Large', description: 'Mistral flagship model', provider: 'mistral' },
  { id: 'mistralai/codestral-2508', name: 'Codestral', description: 'Mistral code specialist (80+ languages)', provider: 'mistral' },
  { id: 'mistralai/devstral-medium', name: 'Devstral Medium', description: 'Mistral agentic coding model', provider: 'mistral' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Meta open model', provider: 'meta' },
  { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', description: 'Efficient Chinese model', provider: 'deepseek' },
  // Free models (rate limited but $0 cost)
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (Free)', description: 'Meta free tier - rate limited', provider: 'free' },
  { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)', description: 'Google free tier - rate limited', provider: 'free' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', description: 'Mistral free tier - rate limited', provider: 'free' }
];

// Helper to get provider icon/color
export function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    anthropic: 'text-orange-500',
    openai: 'text-emerald-500',
    google: 'text-blue-500',
    xai: 'text-gray-500',
    mistral: 'text-purple-500',
    meta: 'text-indigo-500',
    deepseek: 'text-cyan-500',
    free: 'text-green-500'
  };
  return colors[provider] || 'text-gray-500';
}

export interface LLMSettings {
  url: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMTestResult {
  connected: boolean;
  error?: string;
  response?: string;
  model?: string;
  url: string;
  hint?: string;
}

export interface LLMCost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export interface LLMGenerateResult {
  success: boolean;
  message: string;
  provider?: LLMProvider;
  model?: string;
  stories?: StoriesFile;
  filePath?: string;
  error?: string;
  rawResponse?: string;
  hint?: string;
  stats?: {
    provider: LLMProvider;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    durationSeconds: number;
    llmCallMs?: number;
    llmCallSeconds?: number;
  };
  cost?: LLMCost;
}

export async function getLLMSettings(): Promise<LLMSettings> {
  log.api('GET', '/llm/settings');
  
  try {
    const response = await fetch(`${API_BASE}/llm/settings`);
    const result = await response.json();
    log.success('Got LLM settings', result);
    return result;
  } catch (err) {
    log.error('Get LLM settings failed', err);
    throw err;
  }
}

export async function updateLLMSettings(settings: Partial<LLMSettings>): Promise<LLMSettings> {
  log.api('POST', '/llm/settings', settings);
  
  try {
    const response = await fetch(`${API_BASE}/llm/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const result = await response.json();
    log.success('Updated LLM settings', result);
    return result;
  } catch (err) {
    log.error('Update LLM settings failed', err);
    throw err;
  }
}

export async function testLLMConnection(): Promise<LLMTestResult> {
  log.api('GET', '/llm/test');
  
  try {
    const response = await fetch(`${API_BASE}/llm/test`);
    const result = await response.json();
    
    if (result.connected) {
      log.success('LLM connection test passed', result);
    } else {
      log.error('LLM connection test failed', result);
    }
    
    return result;
  } catch (err) {
    log.error('LLM connection test error', err);
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Connection failed',
      url: 'http://localhost:1234/v1/chat/completions',
      hint: 'Make sure LM Studio is running with the local server enabled'
    };
  }
}

export async function generateStoriesWithLLM(
  type: 'component' | 'page',
  name: string,
  provider: LLMProvider = 'local',
  model?: string // OpenRouter model ID (e.g., 'anthropic/claude-3.5-sonnet')
): Promise<LLMGenerateResult> {
  const providerLabels: Record<LLMProvider, string> = {
    local: 'Local LLM',
    openai: 'ChatGPT',
    openrouter: 'OpenRouter'
  };
  const providerLabel = providerLabels[provider] || provider;
  
  log.api('POST', '/stories/generate-with-llm', { type, name, provider, model });
  
  try {
    const response = await fetch(`${API_BASE}/stories/generate-with-llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, provider, model })
    });
    
    const result = await response.json();
    
    if (result.success) {
      log.success(`Generated stories with ${providerLabel}`, { 
        count: result.stories?.stories?.length,
        filePath: result.filePath,
        provider: result.provider,
        model: result.stats?.model,
        cost: result.cost?.totalCost
      });
    } else {
      log.error(`${providerLabel} generation failed`, result);
    }
    
    return result;
  } catch (err) {
    log.error(`Generate stories with ${providerLabel} failed`, err);
    const hints: Record<LLMProvider, string> = {
      local: 'Make sure LM Studio is running with the local server enabled',
      openai: 'Check your OpenAI API key and internet connection',
      openrouter: 'Check your OpenRouter API key and internet connection'
    };
    return {
      success: false,
      message: 'Failed to generate stories',
      error: err instanceof Error ? err.message : 'Unknown error',
      hint: hints[provider] || 'Check your connection'
    };
  }
}
