/**
 * LLM Logger Module
 * 
 * Handles logging of LLM generation requests for debugging and analysis.
 * Logs are saved to .explorer/llm-logs/ in the project directory.
 */

import fs from 'fs/promises';
import path from 'path';

// Logging utility
const log = {
  info: (msg: string, data?: any) => {
    console.log(`\x1b[36m[LLM-LOGGER]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  success: (msg: string, data?: any) => {
    console.log(`\x1b[32m[LLM-LOGGER ✓]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  error: (msg: string, data?: any) => {
    console.log(`\x1b[31m[LLM-LOGGER ✗]\x1b[0m ${msg}`, data !== undefined ? data : '');
  }
};

// ==================== TYPES ====================

export type LLMProvider = 'local' | 'openai' | 'openrouter';

// OpenRouter model configuration - easy to add new models
export interface OpenRouterModel {
  id: string;           // OpenRouter model ID (e.g., 'anthropic/claude-3.5-sonnet')
  name: string;         // Display name
  description: string;  // Short description
  contextLength: number;
  inputCostPer1k: number;  // Cost per 1000 input tokens in USD
  outputCostPer1k: number; // Cost per 1000 output tokens in USD
  provider: string;        // Original provider (anthropic, openai, google, etc.)
}

// Pre-configured models for the dropdown - easy to extend
export const OPENROUTER_MODELS: OpenRouterModel[] = [
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Latest Claude - excellent for code',
    contextLength: 200000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    provider: 'anthropic'
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    description: 'Fast & affordable Claude',
    contextLength: 200000,
    inputCostPer1k: 0.0008,
    outputCostPer1k: 0.004,
    provider: 'anthropic'
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI flagship model',
    contextLength: 128000,
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
    provider: 'openai'
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast & cheap GPT-4',
    contextLength: 128000,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    provider: 'openai'
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    description: 'Google latest fast model',
    contextLength: 1000000,
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0004,
    provider: 'google'
  },
  {
    id: 'google/gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro',
    description: 'Google most capable model',
    contextLength: 1000000,
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.01,
    provider: 'google'
  },
  {
    id: 'x-ai/grok-3-mini-beta',
    name: 'Grok 3 Mini',
    description: 'xAI reasoning model',
    contextLength: 131072,
    inputCostPer1k: 0.0003,
    outputCostPer1k: 0.0005,
    provider: 'xai'
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct',
    name: 'Mistral Small 3.1',
    description: 'Fast Mistral model',
    contextLength: 96000,
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0003,
    provider: 'mistral'
  },
  {
    id: 'mistralai/mistral-large-latest',
    name: 'Mistral Large',
    description: 'Mistral flagship model',
    contextLength: 128000,
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.006,
    provider: 'mistral'
  },
  {
    id: 'mistralai/codestral-2508',
    name: 'Codestral',
    description: 'Mistral code specialist (80+ languages)',
    contextLength: 32000,
    inputCostPer1k: 0.0003,
    outputCostPer1k: 0.0009,
    provider: 'mistral'
  },
  {
    id: 'mistralai/devstral-medium',
    name: 'Devstral Medium',
    description: 'Mistral agentic coding model',
    contextLength: 128000,
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0003,
    provider: 'mistral'
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    description: 'Meta open model',
    contextLength: 128000,
    inputCostPer1k: 0.00039,
    outputCostPer1k: 0.0004,
    provider: 'meta'
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek V3',
    description: 'Efficient Chinese model',
    contextLength: 163840,
    inputCostPer1k: 0.00014,
    outputCostPer1k: 0.00028,
    provider: 'deepseek'
  },
  // Free models (rate limited but $0 cost)
  {
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    name: 'Llama 3.2 3B (Free)',
    description: 'Meta free tier - rate limited',
    contextLength: 131072,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    provider: 'free'
  },
  {
    id: 'google/gemma-2-9b-it:free',
    name: 'Gemma 2 9B (Free)',
    description: 'Google free tier - rate limited',
    contextLength: 8192,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    provider: 'free'
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    name: 'Mistral 7B (Free)',
    description: 'Mistral free tier - rate limited',
    contextLength: 32768,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    provider: 'free'
  }
];

export interface LLMCost {
  inputCost: number;      // Cost for input tokens in USD
  outputCost: number;     // Cost for output tokens in USD
  totalCost: number;      // Total cost in USD
  currency: string;       // Always 'USD'
  // OpenRouter-specific fields
  nativeTokensPrompt?: number;    // Native tokenizer count
  nativeTokensCompletion?: number;
}

export interface LLMLogEntry {
  id: string;
  timestamp: string;
  provider: LLMProvider;
  duration: {
    totalMs: number;
    totalSeconds: number;
    llmCallMs: number;
    llmCallSeconds: number;
  };
  request: {
    type: 'component' | 'page';
    name: string;
    sourceFile: string;
    sourceCodeLength: number;
    promptLength: number;
    estimatedInputTokens: number;
  };
  llmConfig: {
    url: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  response: {
    success: boolean;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    outputLength: number;
    storiesGenerated: number;
    parseSuccess: boolean;
  };
  // Cost information (primarily for OpenRouter, but also calculated for others)
  cost?: LLMCost;
  error?: string;
  // Large content fields at the end for readability
  prompt: string;
  rawOutput: string;
}

export interface LLMLogSummary {
  file: string;
  id: string;
  timestamp: string;
  type: string;
  name: string;
  success: boolean;
  model: string;
  provider: LLMProvider;
  totalTokens: number;
  duration: number;
  storiesGenerated: number;
  cost?: number; // Total cost in USD
}

// ==================== FUNCTIONS ====================

/**
 * Get model config by ID
 */
export function getOpenRouterModel(modelId: string): OpenRouterModel | undefined {
  return OPENROUTER_MODELS.find(m => m.id === modelId);
}

// OpenAI direct API pricing (as of 2024)
const OPENAI_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.01 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'gpt-4': { inputPer1k: 0.03, outputPer1k: 0.06 },
  'gpt-3.5-turbo': { inputPer1k: 0.0005, outputPer1k: 0.0015 }
};

/**
 * Calculate cost based on token usage and model
 * For OpenRouter, the cost comes from the API response (or our pricing table)
 * For OpenAI, we calculate based on known pricing
 * For local models, cost is zero
 */
export function calculateCost(
  provider: LLMProvider,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  openRouterCost?: { total_cost?: number; native_tokens_prompt?: number; native_tokens_completion?: number }
): LLMCost {
  // If OpenRouter provides cost directly, use it
  if (openRouterCost?.total_cost !== undefined && openRouterCost.total_cost > 0) {
    const model = getOpenRouterModel(modelId);
    const inputCost = model ? (promptTokens / 1000) * model.inputCostPer1k : 0;
    const outputCost = model ? (completionTokens / 1000) * model.outputCostPer1k : 0;
    
    return {
      inputCost: inputCost,
      outputCost: outputCost,
      totalCost: openRouterCost.total_cost,
      currency: 'USD',
      nativeTokensPrompt: openRouterCost.native_tokens_prompt,
      nativeTokensCompletion: openRouterCost.native_tokens_completion
    };
  }
  
  // Calculate based on OpenRouter pricing table
  const openRouterModel = getOpenRouterModel(modelId);
  if (openRouterModel) {
    const inputCost = (promptTokens / 1000) * openRouterModel.inputCostPer1k;
    const outputCost = (completionTokens / 1000) * openRouterModel.outputCostPer1k;
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD'
    };
  }
  
  // Calculate based on OpenAI direct API pricing
  if (provider === 'openai') {
    const pricing = OPENAI_PRICING[modelId] || OPENAI_PRICING['gpt-4o-mini'];
    const inputCost = (promptTokens / 1000) * pricing.inputPer1k;
    const outputCost = (completionTokens / 1000) * pricing.outputPer1k;
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD'
    };
  }
  
  // For local or unknown models, return zero cost
  return {
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
    currency: 'USD'
  };
}

/**
 * Create an empty log entry with default values
 * Field order is intentional - metadata at top, large content (prompt/rawOutput) at bottom
 */
export function createLogEntry(
  type: 'component' | 'page',
  name: string,
  sourceFile: string,
  sourceCodeLength: number,
  promptLength: number,
  llmConfig: { url: string; model: string; temperature: number; maxTokens: number },
  provider: LLMProvider = 'local'
): LLMLogEntry {
  return {
    id: `llm-${Date.now()}`,
    timestamp: new Date().toISOString(),
    provider,
    duration: { totalMs: 0, totalSeconds: 0, llmCallMs: 0, llmCallSeconds: 0 },
    request: {
      type,
      name,
      sourceFile,
      sourceCodeLength,
      promptLength,
      estimatedInputTokens: Math.ceil(promptLength / 4)
    },
    llmConfig,
    response: {
      success: false,
      model: 'unknown',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      outputLength: 0,
      storiesGenerated: 0,
      parseSuccess: false
    },
    // Cost - initialized here so it appears before prompt/rawOutput in JSON
    cost: {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD'
    },
    // Error placeholder (will be set if error occurs)
    error: undefined,
    // Large content fields at the end for readability
    prompt: '',
    rawOutput: ''
  };
}

/**
 * Set duration values (both ms and human-readable seconds)
 */
export function setDuration(logEntry: LLMLogEntry, totalMs: number, llmCallMs: number): void {
  logEntry.duration.totalMs = totalMs;
  logEntry.duration.totalSeconds = Math.round(totalMs / 100) / 10; // 1 decimal place
  logEntry.duration.llmCallMs = llmCallMs;
  logEntry.duration.llmCallSeconds = Math.round(llmCallMs / 100) / 10;
}

/**
 * Save an LLM log entry to the project's .explorer/llm-logs directory
 * Filename format: {provider}_{model}_{type}_{name}_{timestamp}.json
 */
export async function saveLLMLog(projectPath: string, logEntry: LLMLogEntry): Promise<string> {
  const logsDir = path.join(projectPath, '.explorer', 'llm-logs');
  await fs.mkdir(logsDir, { recursive: true });
  
  // Provider prefix (local or openai)
  const providerPrefix = logEntry.provider || 'local';
  
  // Sanitize model name (extract just the model name, not full path)
  const modelName = (logEntry.response.model || 'unknown')
    .split('/').pop()  // Get last part if it's a path
    ?.replace(/[^a-zA-Z0-9-]/g, '') // Remove special chars
    ?.slice(0, 30) || 'unknown';
  
  // Sanitize component/page name
  const safeName = logEntry.request.name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 30);
  
  // Timestamp at the end for sorting
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  // Format: {provider}_{model}_{type}_{name}_{timestamp}.json
  const fileName = `${providerPrefix}_${modelName}_${logEntry.request.type}_${safeName}_${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);
  
  await fs.writeFile(filePath, JSON.stringify(logEntry, null, 2), 'utf-8');
  log.success(`Saved LLM log [${providerPrefix}]`, { path: filePath });
  
  return filePath;
}

/**
 * List all LLM logs in the project (returns last N logs)
 */
export async function listLLMLogs(projectPath: string, limit: number = 50): Promise<LLMLogSummary[]> {
  const logsDir = path.join(projectPath, '.explorer', 'llm-logs');
  const logs: LLMLogSummary[] = [];
  
  try {
    const files = await fs.readdir(logsDir);
    
    for (const file of files.filter(f => f.endsWith('.json')).slice(-limit)) {
      try {
        const content = await fs.readFile(path.join(logsDir, file), 'utf-8');
        const logEntry = JSON.parse(content) as LLMLogEntry;
        logs.push({
          file,
          id: logEntry.id,
          timestamp: logEntry.timestamp,
          type: logEntry.request?.type || 'unknown',
          name: logEntry.request?.name || 'unknown',
          success: logEntry.response?.success || false,
          model: logEntry.response?.model || 'unknown',
          provider: logEntry.provider || 'local',
          totalTokens: logEntry.response?.totalTokens || 0,
          duration: logEntry.duration?.totalMs || 0,
          storiesGenerated: logEntry.response?.storiesGenerated || 0,
          cost: logEntry.cost?.totalCost
        });
      } catch {
        // Skip invalid files
      }
    }
    
    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    log.info('Listed LLM logs', { count: logs.length });
    return logs;
  } catch {
    return []; // No logs directory yet
  }
}

/**
 * Get a specific LLM log by filename
 */
export async function getLLMLog(projectPath: string, filename: string): Promise<LLMLogEntry | null> {
  const filePath = path.join(projectPath, '.explorer', 'llm-logs', filename);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as LLMLogEntry;
  } catch {
    return null;
  }
}

/**
 * Delete old logs (keep last N)
 */
export async function cleanupOldLogs(projectPath: string, keepCount: number = 100): Promise<number> {
  const logsDir = path.join(projectPath, '.explorer', 'llm-logs');
  
  try {
    const files = await fs.readdir(logsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
    
    if (jsonFiles.length <= keepCount) {
      return 0;
    }
    
    const filesToDelete = jsonFiles.slice(0, jsonFiles.length - keepCount);
    
    for (const file of filesToDelete) {
      await fs.unlink(path.join(logsDir, file));
    }
    
    log.info('Cleaned up old logs', { deleted: filesToDelete.length });
    return filesToDelete.length;
  } catch {
    return 0;
  }
}

