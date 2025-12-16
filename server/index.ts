import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { scanNextJsProject } from './scanner.js';
import { generateStoriesPrompt, ensureTemplatesExist, getStories, listAllStories, StoryFile } from './prompt-generator.js';
import { setupPreview, checkPreviewStatus, removePreview } from './preview-injector.js';
import { LLMLogEntry, LLMProvider, createLogEntry, saveLLMLog, listLLMLogs, getLLMLog, setDuration, calculateCost, OPENROUTER_MODELS, getOpenRouterModel } from './llm-logger.js';
// Note: Server action mocking removed due to Next.js/Turbopack limitations
// Keeping mock-generator.ts and build-config-injector.ts files for potential future use
import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';

// Load .env from target project directory
function loadProjectEnv(projectPath: string): void {
  const envPath = path.join(projectPath, '.env');
  if (fss.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    console.log(`\x1b[32m[SERVER ✓]\x1b[0m Loaded .env from ${envPath}`);
  } else {
    console.log(`\x1b[33m[SERVER ⚠]\x1b[0m No .env file found at ${envPath}`);
  }
}

const app = express();
const PORT = 3050;

// Logging utility
const log = {
  info: (msg: string, data?: any) => {
    console.log(`\x1b[36m[SERVER]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  success: (msg: string, data?: any) => {
    console.log(`\x1b[32m[SERVER ✓]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  warn: (msg: string, data?: any) => {
    console.log(`\x1b[33m[SERVER ⚠]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  error: (msg: string, data?: any) => {
    console.log(`\x1b[31m[SERVER ✗]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  request: (method: string, path: string, body?: any) => {
    console.log(`\x1b[35m[REQUEST]\x1b[0m ${method} ${path}`, body ? JSON.stringify(body).slice(0, 200) : '');
  }
};

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  log.request(req.method, req.path, req.body);
  next();
});

// Store the current project path
let currentProjectPath: string | null = null;
let cachedScanResult: any = null;

// ==================== SCAN CACHE ====================
// Save scan results to .storial/scan.json for persistence across restarts

const SCAN_CACHE_FILE = 'scan.json';

interface ScanCacheData {
  projectPath: string;
  scanResult: any;
  cachedAt: string;
}

async function getScanCachePath(projectPath: string): Promise<string> {
  const storialDir = path.join(projectPath, '.storial');
  await fs.mkdir(storialDir, { recursive: true });
  return path.join(storialDir, SCAN_CACHE_FILE);
}

async function loadScanCache(projectPath: string): Promise<ScanCacheData | null> {
  try {
    const cachePath = await getScanCachePath(projectPath);
    const content = await fs.readFile(cachePath, 'utf-8');
    const cache = JSON.parse(content) as ScanCacheData;
    
    // Verify the cached data is for the same project path
    if (cache.projectPath !== projectPath) {
      log.warn('Scan cache is for different project, ignoring');
      return null;
    }
    
    log.success('Loaded scan cache', { 
      cachedAt: cache.cachedAt,
      pages: cache.scanResult?.pages?.length,
      components: cache.scanResult?.components?.length
    });
    return cache;
  } catch (error) {
    // Cache doesn't exist or is invalid
    log.info('No valid scan cache found');
    return null;
  }
}

async function saveScanCache(projectPath: string, scanResult: any): Promise<void> {
  try {
    const cachePath = await getScanCachePath(projectPath);
    const cacheData: ScanCacheData = {
      projectPath,
      scanResult,
      cachedAt: new Date().toISOString()
    };
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
    log.success('Saved scan cache', { path: cachePath });
  } catch (error) {
    log.error('Failed to save scan cache', error);
  }
}

// Get scan overview with story counts
async function getScanOverviewData(projectPath: string, scanResult: any): Promise<any> {
  const stories = await listAllStories(projectPath);
  
  // Count stories per page/component
  const pageStoryCounts: Record<string, number> = {};
  const componentStoryCounts: Record<string, number> = {};
  
  // For each page/component, check if it has stories
  for (const page of scanResult.pages || []) {
    const safeName = page.route?.replace(/^\//, '').replace(/\//g, '_').replace(/:/g, '_') || page.fileName.replace(/\.(tsx?|jsx?)$/, '');
    if (stories.pages.includes(safeName)) {
      pageStoryCounts[page.route || page.fileName] = 1; // We'd need to read the file to get actual count
    }
  }
  
  for (const component of scanResult.components || []) {
    if (stories.components.includes(component.name)) {
      componentStoryCounts[component.name] = 1;
    }
  }
  
  return {
    projectPath: scanResult.projectPath,
    projectName: scanResult.projectName,
    framework: scanResult.framework,
    routerType: scanResult.routerType,
    scannedAt: scanResult.scannedAt,
    counts: {
      pages: scanResult.pages?.filter((p: any) => !p.isLayout && !p.isLoading && !p.isError).length || 0,
      layouts: scanResult.pages?.filter((p: any) => p.isLayout).length || 0,
      components: scanResult.components?.length || 0,
      hooks: scanResult.hooks?.length || 0,
      contexts: scanResult.contexts?.length || 0,
      utilities: scanResult.utilities?.length || 0,
      serverActionFiles: scanResult.serverActionFiles?.length || 0
    },
    stories: {
      pagesWithStories: Object.keys(pageStoryCounts).length,
      componentsWithStories: Object.keys(componentStoryCounts).length,
      totalPageStories: stories.pages.length,
      totalComponentStories: stories.components.length
    },
    details: {
      pages: scanResult.pages?.map((p: any) => ({
        route: p.route,
        fileName: p.fileName,
        isLayout: p.isLayout,
        isLoading: p.isLoading,
        isError: p.isError,
        hasStories: !!pageStoryCounts[p.route || p.fileName]
      })) || [],
      components: scanResult.components?.map((c: any) => ({
        name: c.name,
        fileName: c.fileName,
        isClientComponent: c.isClientComponent,
        hasStories: !!componentStoryCounts[c.name],
        usedInPages: c.usedInPages?.length || 0,
        usedInComponents: c.usedInComponents?.length || 0
      })) || []
    }
  };
}

// Get current project info
app.get('/api/project', (_req, res) => {
  log.info('Getting current project info');
  
  if (!currentProjectPath) {
    log.warn('No project configured');
    return res.status(404).json({ message: 'No project configured' });
  }
  
  const response = { 
    path: currentProjectPath,
    name: path.basename(currentProjectPath)
  };
  log.success('Returning project info', response);
  res.json(response);
});

// Set project path
app.post('/api/project', async (req, res) => {
  const { projectPath } = req.body;
  log.info('Setting project path', { projectPath });
  
  if (!projectPath) {
    log.error('Project path is required');
    return res.status(400).json({ message: 'Project path is required' });
  }

  try {
    // Verify the path exists
    log.info('Verifying path exists...');
    await fs.access(projectPath);
    log.success('Path exists');
    
    // Check if it looks like a React/Next.js project
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      log.info('Checking for package.json...');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const hasNext = packageJson.dependencies?.next || packageJson.devDependencies?.next;
      const hasReact = packageJson.dependencies?.react || packageJson.devDependencies?.react;
      
      if (hasNext) {
        log.success('Next.js detected');
      } else if (hasReact) {
        log.success('React detected');
      } else {
        log.warn('Neither Next.js nor React found in dependencies');
      }
    } catch {
      log.warn('Could not read package.json');
    }

    currentProjectPath = projectPath;
    cachedScanResult = null; // Clear cache when project changes

    // Load .env from target project for API keys
    loadProjectEnv(projectPath);

    log.success(`Project path set to: ${projectPath}`);
    res.json({ success: true, path: projectPath });
  } catch (error) {
    log.error(`Invalid project path: ${projectPath}`, error);
    res.status(400).json({ message: `Invalid project path: ${projectPath}` });
  }
});

// Scan project (with cache support)
app.post('/api/scan', async (req, res) => {
  const projectPath = req.body.projectPath || currentProjectPath;
  const forceRescan = req.body.forceRescan === true;
  
  log.info('=== SCAN REQUEST ===');
  log.info('Project path:', projectPath);
  log.info('Force rescan:', forceRescan);
  
  if (!projectPath) {
    log.error('No project path provided');
    return res.status(400).json({ message: 'No project path provided. Set one first via POST /api/project' });
  }

  try {
    // Check for cached scan result (unless force rescan)
    if (!forceRescan) {
      const cache = await loadScanCache(projectPath);
      if (cache) {
        log.success('Using cached scan result');
        cachedScanResult = cache.scanResult;
        currentProjectPath = projectPath;
        return res.json({
          ...cache.scanResult,
          fromCache: true,
          cachedAt: cache.cachedAt
        });
      }
    }
    
    // Perform fresh scan
    const startTime = Date.now();
    log.info('Calling scanNextJsProject...');
    
    const result = await scanNextJsProject(projectPath);
    
    const duration = Date.now() - startTime;
    log.success(`Scan completed in ${duration}ms`);
    log.info('Scan results:', {
      pages: result.pages.length,
      components: result.components.length,
      routerType: result.routerType
    });
    
    // Save to cache
    await saveScanCache(projectPath, result);
    
    cachedScanResult = result;
    currentProjectPath = projectPath;
    
    res.json({
      ...result,
      fromCache: false
    });
  } catch (error) {
    log.error('Scan failed', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Failed to scan project' 
    });
  }
});

// Get cached scan result
app.get('/api/scan', (_req, res) => {
  log.info('Getting cached scan result');
  
  if (!cachedScanResult) {
    log.warn('No cached scan result available');
    return res.status(404).json({ message: 'No scan result available. Run a scan first.' });
  }
  
  log.success('Returning cached scan result');
  res.json(cachedScanResult);
});

// Get scan overview with story counts
app.get('/api/scan/overview', async (_req, res) => {
  log.info('Getting scan overview');
  
  if (!currentProjectPath || !cachedScanResult) {
    log.warn('No scan result available');
    return res.status(404).json({ message: 'No scan result available. Run a scan first.' });
  }
  
  try {
    const overview = await getScanOverviewData(currentProjectPath, cachedScanResult);
    log.success('Returning scan overview', {
      pages: overview.counts.pages,
      components: overview.counts.components,
      pagesWithStories: overview.stories.pagesWithStories,
      componentsWithStories: overview.stories.componentsWithStories
    });
    res.json(overview);
  } catch (error) {
    log.error('Failed to get scan overview', error);
    res.status(500).json({ message: 'Failed to get scan overview' });
  }
});

// Read file content
app.get('/api/file', async (req, res) => {
  const filePath = req.query.path as string;
  log.info('Reading file', { filePath });
  
  if (!filePath) {
    log.error('File path is required');
    return res.status(400).json({ message: 'File path is required' });
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    log.success(`File read successfully (${content.length} chars)`);
    res.json({ content, path: filePath });
  } catch (error) {
    log.error(`File not found: ${filePath}`, error);
    res.status(404).json({ message: `File not found: ${filePath}` });
  }
});

// ==================== COMPONENT REGISTRY ENDPOINT ====================

// Get component registry for dynamic imports in Canvas
app.get('/api/component-registry', (_req, res) => {
  log.info('Getting component registry');
  
  if (!cachedScanResult) {
    log.error('No scan result available');
    return res.status(404).json({ message: 'No scan result available. Run a scan first.' });
  }
  
  // Build registry from components and pages
  const registry: Record<string, { name: string; path: string; type: 'component' | 'page' }> = {};
  
  // Helper to extract the path relative to the last /src/ directory
  const getRelativePath = (filePath: string): string => {
    // Find the LAST occurrence of /src/ and take everything after it
    const srcIndex = filePath.lastIndexOf('/src/');
    if (srcIndex !== -1) {
      return filePath.slice(srcIndex + 5).replace(/\.(tsx?|jsx?)$/, ''); // +5 to skip '/src/'
    }
    // Fallback: just take the filename
    return filePath.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || filePath;
  };
  
  // Add components
  for (const component of cachedScanResult.components) {
    // Convert file path to import path (e.g., /full/path/src/components/Button.tsx -> components/Button)
    const relativePath = getRelativePath(component.filePath);
    registry[component.name] = {
      name: component.name,
      path: relativePath,
      type: 'component'
    };
    // Also add lowercase version for easier lookup
    registry[component.name.toLowerCase()] = {
      name: component.name,
      path: relativePath,
      type: 'component'
    };
  }
  
  // Add pages (they can also be previewed)
  for (const page of cachedScanResult.pages) {
    const pageName = page.fileName.replace(/\.(tsx?|jsx?)$/, '');
    const relativePath = getRelativePath(page.filePath);
    registry[pageName] = {
      name: pageName,
      path: relativePath,
      type: 'page'
    };
    registry[pageName.toLowerCase()] = {
      name: pageName,
      path: relativePath,
      type: 'page'
    };
  }
  
  log.success('Built component registry', { count: Object.keys(registry).length / 2 }); // Divide by 2 since we add both cases
  res.json(registry);
});

// ==================== STORIES ENDPOINTS ====================

// Setup templates in target project
app.post('/api/stories/setup', async (req, res) => {
  log.info('Setting up stories templates');
  
  if (!currentProjectPath) {
    log.error('No project configured');
    return res.status(400).json({ message: 'No project configured' });
  }
  
  try {
    const result = await ensureTemplatesExist(currentProjectPath);
    log.success('Templates setup complete', result);
    res.json(result);
  } catch (error) {
    log.error('Failed to setup templates', error);
    res.status(500).json({ message: 'Failed to setup templates' });
  }
});

// Generate AI prompt for stories
app.post('/api/stories/generate-prompt', async (req, res) => {
  const { type, name } = req.body;
  log.info('Generating stories prompt', { type, name });
  
  if (!currentProjectPath || !cachedScanResult) {
    log.error('No project scanned');
    return res.status(400).json({ message: 'No project scanned. Run a scan first.' });
  }
  
  if (!type || !name) {
    log.error('Type and name are required');
    return res.status(400).json({ message: 'Type and name are required' });
  }
  
  try {
    // Find the item
    let item;
    if (type === 'component') {
      item = cachedScanResult.components.find((c: any) => c.name === name);
    } else if (type === 'page') {
      item = cachedScanResult.pages.find((p: any) => p.route === name || p.fileName === name);
    }
    
    if (!item) {
      log.error('Item not found', { type, name });
      return res.status(404).json({ message: `${type} not found: ${name}` });
    }
    
    // Read the source code
    const sourceCode = await fs.readFile(item.filePath, 'utf-8');
    log.info('Read source code', { length: sourceCode.length });
    
    // Ensure templates exist
    await ensureTemplatesExist(currentProjectPath);
    
    // Generate the prompt
    const prompt = generateStoriesPrompt({
      type,
      item,
      sourceCode,
      projectPath: currentProjectPath
    });
    
    log.success('Generated prompt', { length: prompt.length });
    res.json({ prompt, type, name });
  } catch (error) {
    log.error('Failed to generate prompt', error);
    res.status(500).json({ message: 'Failed to generate prompt' });
  }
});

// ==================== LLM GENERATION ====================

// LM Studio default settings (local)
const LLM_DEFAULT_URL = 'http://localhost:1234/v1/chat/completions';

// OpenAI API settings
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini'; // Cheaper and effective model for this task
// API key loaded from target project's .env file
// Supports both STORIAL_OPENAI_API_KEY (preferred) and OPENAI_API_KEY (fallback)
function getOpenAIKey(): string {
  return process.env.STORIAL_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
}

// OpenRouter API settings
// Get your API key from https://openrouter.ai/keys
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// API key loaded from target project's .env file
// Supports both STORIAL_OPENROUTER_API_KEY (preferred) and OPENROUTER_API_KEY (fallback)
function getOpenRouterKey(): string {
  return process.env.STORIAL_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
}

interface LLMSettings {
  url: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

let llmSettings: LLMSettings = {
  url: LLM_DEFAULT_URL,
  model: 'local-model', // LM Studio ignores this but we send it for compatibility
  temperature: 0.7,
  maxTokens: 12000
};

// Get/Set LLM settings
app.get('/api/llm/settings', (_req, res) => {
  log.info('Getting LLM settings');
  res.json(llmSettings);
});

app.post('/api/llm/settings', (req, res) => {
  log.info('Updating LLM settings', req.body);
  llmSettings = { ...llmSettings, ...req.body };
  res.json(llmSettings);
});

// Test LLM connection
app.get('/api/llm/test', async (_req, res) => {
  log.info('Testing LLM connection', { url: llmSettings.url });
  
  try {
    const response = await fetch(llmSettings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llmSettings.model,
        messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
        max_tokens: 10,
        temperature: 0
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      log.error('LLM connection failed', { status: response.status, error: errorText });
      return res.json({ 
        connected: false, 
        error: `HTTP ${response.status}: ${errorText}`,
        url: llmSettings.url
      });
    }
    
    const data = await response.json();
    const modelResponse = data.choices?.[0]?.message?.content || '';
    log.success('LLM connection successful', { response: modelResponse });
    
    res.json({ 
      connected: true, 
      response: modelResponse,
      model: data.model || 'unknown',
      url: llmSettings.url
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error('LLM connection error', { error: errorMsg });
    res.json({ 
      connected: false, 
      error: errorMsg,
      url: llmSettings.url,
      hint: 'Make sure LM Studio is running with the local server enabled (default port: 1234)'
    });
  }
});

// Generate stories using LLM (local, OpenAI, OpenRouter, or Storial Cloud)
app.post('/api/stories/generate-with-llm', async (req, res) => {
  const { type, name, provider = 'local', model } = req.body;

  // Determine provider
  let llmProvider: LLMProvider;
  if (provider === 'storial-cloud') {
    // Storial Cloud - coming soon
    return res.status(503).json({
      success: false,
      message: 'Storial Cloud is coming soon!',
      error: 'storial-cloud-coming-soon',
      hint: 'Storial Cloud will provide premium AI story generation without requiring your own API key. Join the waitlist at https://storial.dev/waitlist',
      comingSoon: true,
      alternatives: [
        { provider: 'local', name: 'Local LLM (LM Studio)', description: 'Free, runs locally, no API key needed' },
        { provider: 'openai', name: 'OpenAI', description: 'Use your own OpenAI API key' },
        { provider: 'openrouter', name: 'OpenRouter', description: 'Access 20+ models with one API key' }
      ]
    });
  } else if (provider === 'openai') {
    llmProvider = 'openai';
  } else if (provider === 'openrouter') {
    llmProvider = 'openrouter';
  } else {
    llmProvider = 'local';
  }
  
  const startTime = Date.now();
  
  // Determine target URL and model based on provider
  let targetUrl: string;
  let targetModel: string;
  
  if (llmProvider === 'openai') {
    targetUrl = OPENAI_API_URL;
    targetModel = OPENAI_MODEL;
  } else if (llmProvider === 'openrouter') {
    targetUrl = OPENROUTER_API_URL;
    // Use the provided model or default to Claude Sonnet
    targetModel = model || 'anthropic/claude-sonnet-4';
  } else {
    targetUrl = llmSettings.url;
    targetModel = llmSettings.model || 'local-model';
  }
  
  const providerLabels: Record<LLMProvider, string> = {
    local: 'Local LLM',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    'storial-cloud': 'Storial Cloud'
  };
  
  log.info(`Generating stories with ${providerLabels[llmProvider]}`, { 
    type, 
    name, 
    provider: llmProvider,
    model: targetModel,
    url: llmProvider === 'openrouter' ? 'openrouter.ai' : llmProvider === 'openai' ? 'api.openai.com' : llmSettings.url 
  });
  
  if (!currentProjectPath || !cachedScanResult) {
    log.error('No project scanned');
    return res.status(400).json({ message: 'No project scanned. Run a scan first.' });
  }
  
  if (!type || !name) {
    log.error('Type and name are required');
    return res.status(400).json({ message: 'Type and name are required' });
  }
  
  try {
    // Find the item
    let item;
    if (type === 'component') {
      item = cachedScanResult.components.find((c: any) => c.name === name);
    } else if (type === 'page') {
      item = cachedScanResult.pages.find((p: any) => p.route === name || p.fileName === name);
    }
    
    if (!item) {
      log.error('Item not found', { type, name });
      return res.status(404).json({ message: `${type} "${name}" not found` });
    }
    
    // Read source code
    const sourceCode = await fs.readFile(item.filePath, 'utf-8');
    
    // DEBUG: Log source code size
    log.info('Source code size', { 
      bytes: sourceCode.length, 
      lines: sourceCode.split('\n').length,
      filePath: item.filePath 
    });
    
    // Ensure templates exist
    await ensureTemplatesExist(currentProjectPath);
    
    // Generate the prompt
    const prompt = generateStoriesPrompt({
      type,
      item,
      sourceCode,
      projectPath: currentProjectPath
    });
    
    // Prepare log entry using the logger module
    const logEntry: LLMLogEntry = createLogEntry(
      type as 'component' | 'page',
      name,
      item.filePath,
      sourceCode.length,
      prompt.length,
      {
        url: targetUrl,
        model: targetModel || 'unknown',
        temperature: llmSettings.temperature || 0.7,
        maxTokens: llmSettings.maxTokens || 6000
      },
      llmProvider
    );
    logEntry.prompt = prompt;
    
    log.info('Prompt breakdown', { 
      totalChars: prompt.length,
      sourceCodeChars: sourceCode.length,
      overheadChars: prompt.length - sourceCode.length,
      estimatedTokens: logEntry.request.estimatedInputTokens,
      provider: llmProvider
    });
    
    // Build headers based on provider
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (llmProvider === 'openai') {
      const openaiKey = getOpenAIKey();
      if (!openaiKey) {
        log.error('OpenAI API key not configured');
        return res.status(400).json({
          success: false,
          message: 'OpenAI API key not configured',
          error: 'Please add OPENAI_API_KEY to your project\'s .env file',
          hint: 'Create a .env file in your project root and add: STORIAL_OPENAI_API_KEY=your-key-here (or OPENAI_API_KEY=your-key-here)'
        });
      }
      headers['Authorization'] = `Bearer ${openaiKey}`;
    } else if (llmProvider === 'openrouter') {
      const openrouterKey = getOpenRouterKey();
      if (!openrouterKey) {
        log.error('OpenRouter API key not configured');
        return res.status(400).json({
          success: false,
          message: 'OpenRouter API key not configured',
          error: 'Please add OPENROUTER_API_KEY to your project\'s .env file',
          hint: 'Create a .env file in your project root and add: STORIAL_OPENROUTER_API_KEY=your-key-here (or OPENROUTER_API_KEY=your-key-here)'
        });
      }
      headers['Authorization'] = `Bearer ${openrouterKey}`;
      headers['HTTP-Referer'] = 'https://storial.dev'; // Required by OpenRouter
      headers['X-Title'] = 'Storial'; // Optional but recommended
    }
    
    // Call the LLM (local, OpenAI, or OpenRouter)
    const llmStartTime = Date.now();
    
    // Build request body - add usage tracking for OpenRouter
    const requestBody: Record<string, any> = {
      model: targetModel,
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert React/Next.js developer. Generate stories in valid JSON format only. Do not include markdown code blocks or any text outside the JSON.' 
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: llmSettings.maxTokens,
      temperature: llmSettings.temperature
    };
    
    // OpenRouter: Enable usage/cost tracking in response
    if (llmProvider === 'openrouter') {
      requestBody.usage = { include: true };
    }
    
    const llmResponse = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    const llmCallDuration = Date.now() - llmStartTime;
    
    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      log.error(`${providerLabels[llmProvider]} request failed`, { 
        status: llmResponse.status, 
        error: errorText,
        provider: llmProvider 
      });
      
      logEntry.error = errorText;
      setDuration(logEntry, Date.now() - startTime, llmCallDuration);
      await saveLLMLog(currentProjectPath, logEntry);
      
      const hints: Record<LLMProvider, string> = {
        local: 'Make sure LM Studio is running with the local server enabled',
        openai: 'Check your OpenAI API key and billing status',
        openrouter: 'Check your OpenRouter API key and account balance at openrouter.ai',
        'storial-cloud': 'Storial Cloud is coming soon'
      };
      
      return res.status(502).json({ 
        message: `${providerLabels[llmProvider]} request failed`, 
        error: errorText,
        hint: hints[llmProvider]
      });
    }
    
    const llmData = await llmResponse.json();
    const rawContent = llmData.choices?.[0]?.message?.content || '';
    
    // Capture response metadata
    logEntry.rawOutput = rawContent;
    logEntry.response.model = llmData.model || 'unknown';
    logEntry.response.promptTokens = llmData.usage?.prompt_tokens || 0;
    logEntry.response.completionTokens = llmData.usage?.completion_tokens || 0;
    logEntry.response.totalTokens = llmData.usage?.total_tokens || 0;
    logEntry.response.outputLength = rawContent.length;
    
    // Calculate cost (OpenRouter provides this, others we estimate)
    const openRouterCost = llmProvider === 'openrouter' ? {
      total_cost: llmData.usage?.cost || llmData.usage?.total_cost,
      native_tokens_prompt: llmData.usage?.native_tokens_prompt,
      native_tokens_completion: llmData.usage?.native_tokens_completion
    } : undefined;
    
    logEntry.cost = calculateCost(
      llmProvider,
      targetModel,
      logEntry.response.promptTokens,
      logEntry.response.completionTokens,
      openRouterCost
    );
    
    log.info('LLM response received', { 
      length: rawContent.length,
      model: logEntry.response.model,
      tokens: logEntry.response.totalTokens,
      cost: logEntry.cost?.totalCost ? `$${logEntry.cost.totalCost.toFixed(6)}` : 'N/A',
      llmCallDuration: `${llmCallDuration}ms`
    });
    
    // Parse the JSON from the response (handle markdown code blocks if present)
    let storiesJson;
    try {
      // Try to extract JSON from markdown code blocks if present
      let jsonContent = rawContent;
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }
      
      // Also try to find raw JSON object
      const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonContent = jsonObjectMatch[0];
      }
      
      storiesJson = JSON.parse(jsonContent);
      logEntry.response.parseSuccess = true;
      logEntry.response.storiesGenerated = storiesJson.stories?.length || 0;
      log.success('Parsed stories JSON', { storiesCount: logEntry.response.storiesGenerated });
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown';
      log.error('Failed to parse LLM response as JSON', { 
        error: errorMsg,
        rawContent: rawContent.substring(0, 500)
      });
      
      logEntry.error = `JSON parse error: ${errorMsg}`;
      setDuration(logEntry, Date.now() - startTime, llmCallDuration);
      await saveLLMLog(currentProjectPath, logEntry);
      
      return res.status(422).json({ 
        message: 'LLM response was not valid JSON',
        rawResponse: rawContent,
        hint: 'The LLM did not return valid JSON. Try regenerating or use the prompt manually.'
      });
    }
    
    // Save the stories to the correct file
    const storiesDir = path.join(currentProjectPath, '.storial', 'stories', type === 'page' ? 'pages' : 'components');
    await fs.mkdir(storiesDir, { recursive: true });
    
    // Sanitize filename: replace invalid chars like : / \ with safe alternatives
    const safeName = name
      .replace(/^\//, '')           // Remove leading slash
      .replace(/\//g, '_')          // Replace / with _
      .replace(/:/g, '_')           // Replace : with _
      .replace(/[<>:"\\|?*]/g, '_'); // Replace other invalid chars
    const fileName = `${safeName}.stories.json`;
    const filePath = path.join(storiesDir, fileName);
    
    await fs.writeFile(filePath, JSON.stringify(storiesJson, null, 2), 'utf-8');
    log.success('Saved stories file', { path: filePath });
    
    // Mark as success and save log
    logEntry.response.success = true;
    setDuration(logEntry, Date.now() - startTime, llmCallDuration);
    const logFilePath = await saveLLMLog(currentProjectPath, logEntry);
    
    res.json({ 
      success: true,
      message: `Generated ${storiesJson.stories?.length || 0} stories for ${name}`,
      provider: llmProvider,
      model: logEntry.response.model,
      stories: storiesJson,
      filePath: `.storial/stories/${type === 'page' ? 'pages' : 'components'}/${fileName}`,
      logFile: logFilePath.replace(currentProjectPath, '.storial').replace(/.*\.storial/, '.storial'),
      stats: {
        provider: llmProvider,
        model: logEntry.response.model,
        promptTokens: logEntry.response.promptTokens,
        completionTokens: logEntry.response.completionTokens,
        totalTokens: logEntry.response.totalTokens,
        durationMs: logEntry.duration.totalMs,
        durationSeconds: logEntry.duration.totalSeconds,
        llmCallMs: logEntry.duration.llmCallMs,
        llmCallSeconds: logEntry.duration.llmCallSeconds
      },
      cost: logEntry.cost
    });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to generate stories with ${providerLabels[llmProvider]}`, { 
      error: errorMsg,
      provider: llmProvider 
    });
    
    // Check if it's a connection error
    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch failed')) {
      const hints: Record<LLMProvider, string> = {
        local: 'Make sure LM Studio is running with the local server enabled (default: http://localhost:1234)',
        openai: 'Check your internet connection and OpenAI API status',
        openrouter: 'Check your internet connection and OpenRouter API status at openrouter.ai',
        'storial-cloud': 'Storial Cloud is coming soon'
      };
      
      return res.status(503).json({ 
        message: `Cannot connect to ${providerLabels[llmProvider]} server`,
        error: errorMsg,
        hint: hints[llmProvider]
      });
    }
    
    res.status(500).json({ message: 'Failed to generate stories', error: errorMsg });
  }
});

// Get stories for a specific item
app.get('/api/stories/:type/:name', async (req, res) => {
  const { type, name } = req.params;
  log.info('Getting stories', { type, name });
  
  if (!currentProjectPath) {
    log.error('No project configured');
    return res.status(400).json({ message: 'No project configured' });
  }
  
  if (type !== 'component' && type !== 'page') {
    log.error('Invalid type', { type });
    return res.status(400).json({ message: 'Type must be "component" or "page"' });
  }
  
  try {
    const stories = await getStories(currentProjectPath, type, name);
    
    if (!stories) {
      log.info('No stories found');
      return res.status(404).json({ message: 'No stories found' });
    }
    
    log.success('Found stories', { count: stories.stories.length });
    res.json(stories);
  } catch (error) {
    log.error('Failed to get stories', error);
    res.status(500).json({ message: 'Failed to get stories' });
  }
});

// List all stories
app.get('/api/stories', async (_req, res) => {
  log.info('Listing all stories');
  
  if (!currentProjectPath) {
    log.error('No project configured');
    return res.status(400).json({ message: 'No project configured' });
  }
  
  try {
    const stories = await listAllStories(currentProjectPath);
    log.success('Listed stories', stories);
    res.json(stories);
  } catch (error) {
    log.error('Failed to list stories', error);
    res.status(500).json({ message: 'Failed to list stories' });
  }
});

// ==================== PREVIEW ENDPOINTS ====================

// Setup preview in target project
app.post('/api/preview/setup', async (_req, res) => {
  log.info('Setting up preview');
  
  if (!currentProjectPath || !cachedScanResult) {
    log.error('No project scanned');
    return res.status(400).json({ message: 'No project scanned. Run a scan first.' });
  }
  
  try {
    const result = await setupPreview(
      currentProjectPath,
      cachedScanResult.routerType,
      cachedScanResult.components,
      PORT
    );
    
    if (result.success) {
      log.success('Preview setup complete', result);
    } else {
      log.error('Preview setup failed', result);
    }
    
    res.json(result);
  } catch (error) {
    log.error('Failed to setup preview', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to setup preview: ${error}` 
    });
  }
});

// Check preview status
app.get('/api/preview/status', async (_req, res) => {
  log.info('Checking preview status');
  
  if (!currentProjectPath || !cachedScanResult) {
    log.error('No project scanned');
    return res.status(400).json({ message: 'No project scanned' });
  }
  
  try {
    const status = await checkPreviewStatus(currentProjectPath, cachedScanResult.routerType);
    log.success('Preview status', status);
    res.json(status);
  } catch (error) {
    log.error('Failed to check preview status', error);
    res.status(500).json({ message: 'Failed to check preview status' });
  }
});

// Remove preview from target project
app.delete('/api/preview', async (_req, res) => {
  log.info('Removing preview');
  
  if (!currentProjectPath || !cachedScanResult) {
    log.error('No project scanned');
    return res.status(400).json({ message: 'No project scanned' });
  }
  
  try {
    const result = await removePreview(currentProjectPath, cachedScanResult.routerType);
    
    if (result.success) {
      log.success('Preview removed');
    } else {
      log.error('Failed to remove preview', result);
    }
    
    res.json(result);
  } catch (error) {
    log.error('Failed to remove preview', error);
    res.status(500).json({ success: false, message: `Failed to remove preview: ${error}` });
  }
});

// ==================== SERVER ACTION DETECTION (Read-Only) ====================
// Note: Server action MOCKING has been removed due to Next.js/Turbopack limitations.
// We still detect server actions to warn users that preview may not work fully.

// Get server action files detected in the project
app.get('/api/server-actions', async (_req, res) => {
  log.info('Getting server action files');
  
  if (!cachedScanResult) {
    log.error('No scan result available');
    return res.status(404).json({ message: 'No scan result available. Run a scan first.' });
  }
  
  const serverActionFiles = cachedScanResult.serverActionFiles || [];
  log.success('Returning server action files', { count: serverActionFiles.length });
  res.json(serverActionFiles);
});

// ==================== LLM LOGS ENDPOINTS ====================

// List all LLM logs
app.get('/api/llm/logs', async (_req, res) => {
  log.info('Listing LLM logs');
  
  if (!currentProjectPath) {
    return res.status(400).json({ message: 'No project configured' });
  }
  
  const logs = await listLLMLogs(currentProjectPath, 50);
  log.success('Listed LLM logs', { count: logs.length });
  res.json(logs);
});

// Get a specific LLM log
app.get('/api/llm/logs/:filename', async (req, res) => {
  const { filename } = req.params;
  log.info('Getting LLM log', { filename });
  
  if (!currentProjectPath) {
    return res.status(400).json({ message: 'No project configured' });
  }
  
  const logEntry = await getLLMLog(currentProjectPath, filename);
  
  if (!logEntry) {
    return res.status(404).json({ message: 'Log not found' });
  }
  
  res.json(logEntry);
});

app.listen(PORT, () => {
  console.log(`
\x1b[36m╔═══════════════════════════════════════════════════════╗
║              ✨ Storial Server                        ║
║     AI-powered component stories for React/Next.js   ║
╠═══════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}              ║
║                                                       ║
║  Features:                                            ║
║    ✓ Page/Route Detection                             ║
║    ✓ Component Detection & Relationships              ║
║    ✓ Hooks, Contexts, Utilities Detection             ║
║    ✓ AI Stories Generation                            ║
║    ✓ Component Preview with Mock Data                 ║
║                                                       ║
║  Endpoints:                                           ║
║    POST /api/project       - Set project path         ║
║    POST /api/scan          - Scan project             ║
║    GET  /api/component-registry - For Canvas preview  ║
║                                                       ║
║  Stories:                                             ║
║    POST /api/stories/generate-prompt - AI prompt      ║
║    POST /api/stories/generate-with-llm - Generate     ║
║    GET  /api/stories/:type/:name - Get stories        ║
║                                                       ║
║  Preview:                                             ║
║    POST /api/preview/setup - Setup preview route      ║
║    GET  /api/preview/status - Check preview status    ║
║                                                       ║
║  🐛 Debug logging ENABLED                             ║
╚═══════════════════════════════════════════════════════╝\x1b[0m
  `);
});
