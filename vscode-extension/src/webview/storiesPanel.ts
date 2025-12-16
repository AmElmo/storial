import * as vscode from 'vscode';
import { ApiClient } from '../server/apiClient';
import type { ScanOverviewData } from '../types/api';

export class StoriesPanel {
  public static currentPanel: StoriesPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _apiClient: ApiClient | null = null;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, apiClient: ApiClient) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, show it
    if (StoriesPanel.currentPanel) {
      StoriesPanel.currentPanel._panel.reveal(column);
      StoriesPanel.currentPanel._apiClient = apiClient;
      StoriesPanel.currentPanel._loadData();
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'storialStories',
      'Storial - Stories Manager',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
      }
    );

    StoriesPanel.currentPanel = new StoriesPanel(panel, extensionUri, apiClient);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, apiClient: ApiClient) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._apiClient = apiClient;

    // Set initial HTML
    this._panel.webview.html = this._getHtmlContent();

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'refresh':
            await this._loadData();
            break;
          case 'generateStory':
            await this._generateStory(message.type, message.name);
            break;
          case 'generateBulk':
            await this._generateBulk(message.items);
            break;
          case 'generateAllMissing':
            await this._generateAllMissing(message.itemType);
            break;
          case 'selectProvider':
            await this._selectProvider();
            break;
        }
      },
      null,
      this._disposables
    );

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Load initial data
    this._loadData();
  }

  private async _loadData() {
    if (!this._apiClient) return;

    try {
      const overview = await this._apiClient.getOverview();
      this._panel.webview.postMessage({
        command: 'setData',
        data: overview
      });
    } catch (error) {
      this._panel.webview.postMessage({
        command: 'setError',
        error: error instanceof Error ? error.message : 'Failed to load data'
      });
    }
  }

  private async _selectProvider(): Promise<{ provider: string; model?: string } | null> {
    const providerChoice = await vscode.window.showQuickPick([
      {
        label: '$(globe) OpenRouter',
        description: 'Access to Claude, GPT-4, Gemini, and 20+ models',
        detail: 'Requires OPENROUTER_API_KEY environment variable',
        provider: 'openrouter'
      },
      {
        label: '$(key) OpenAI',
        description: 'Uses GPT-4o-mini',
        detail: 'Requires OPENAI_API_KEY environment variable',
        provider: 'openai'
      },
      {
        label: '$(server) Local LLM',
        description: 'Use your own local model (LM Studio, Ollama, etc.)',
        detail: 'Requires local server running (default: http://localhost:1234)',
        provider: 'local'
      }
    ], {
      placeHolder: 'Select AI provider for story generation',
      title: 'Select Provider'
    });

    if (!providerChoice) return null;

    // Handle configuration based on provider
    if (providerChoice.provider === 'openrouter') {
      const configured = await this._ensureOpenRouterKey();
      if (!configured) return null;
    } else if (providerChoice.provider === 'openai') {
      const configured = await this._ensureOpenAIKey();
      if (!configured) return null;
    } else if (providerChoice.provider === 'local') {
      const configured = await this._ensureLocalEndpoint();
      if (!configured) return null;
    }

    // Store selection and return
    this._panel.webview.postMessage({
      command: 'setProvider',
      provider: providerChoice.provider
    });

    return { provider: providerChoice.provider };
  }

  private async _ensureOpenRouterKey(): Promise<boolean> {
    // Check if key is already set by testing the API
    const hasKey = await this._checkEnvVar('OPENROUTER_API_KEY');
    if (hasKey) return true;

    const action = await vscode.window.showInformationMessage(
      'OpenRouter requires an API key. You can get one at openrouter.ai/keys',
      'I have a key',
      'Get API key',
      'Cancel'
    );

    if (action === 'Get API key') {
      vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
      return false;
    }

    if (action === 'I have a key') {
      await vscode.window.showInformationMessage(
        'Add OPENROUTER_API_KEY to your environment variables, then restart VSCode. You can also add it to a .env file in your project root.',
        'OK'
      );
      return false;
    }

    return false;
  }

  private async _ensureOpenAIKey(): Promise<boolean> {
    const hasKey = await this._checkEnvVar('OPENAI_API_KEY');
    if (hasKey) return true;

    const action = await vscode.window.showInformationMessage(
      'OpenAI requires an API key. You can get one at platform.openai.com/api-keys',
      'I have a key',
      'Get API key',
      'Cancel'
    );

    if (action === 'Get API key') {
      vscode.env.openExternal(vscode.Uri.parse('https://platform.openai.com/api-keys'));
      return false;
    }

    if (action === 'I have a key') {
      await vscode.window.showInformationMessage(
        'Add OPENAI_API_KEY to your environment variables, then restart VSCode. You can also add it to a .env file in your project root.',
        'OK'
      );
      return false;
    }

    return false;
  }

  private async _ensureLocalEndpoint(): Promise<boolean> {
    const action = await vscode.window.showInformationMessage(
      'Local LLM requires a server running locally (e.g., LM Studio, Ollama). Default endpoint: http://localhost:1234/v1/chat/completions',
      'Use default endpoint',
      'Configure endpoint',
      'Cancel'
    );

    if (action === 'Use default endpoint') {
      return true;
    }

    if (action === 'Configure endpoint') {
      const endpoint = await vscode.window.showInputBox({
        prompt: 'Enter your local LLM API endpoint URL',
        value: 'http://localhost:1234/v1/chat/completions',
        placeHolder: 'http://localhost:1234/v1/chat/completions',
        validateInput: (value) => {
          try {
            new URL(value);
            return null;
          } catch {
            return 'Please enter a valid URL';
          }
        }
      });

      if (endpoint) {
        // Update LLM settings via API
        try {
          await this._apiClient?.updateLLMSettings({ url: endpoint });
          return true;
        } catch {
          vscode.window.showErrorMessage('Failed to update endpoint settings');
          return false;
        }
      }
      return false;
    }

    return false;
  }

  private async _checkEnvVar(_varName: string): Promise<boolean> {
    // We can't directly check env vars from the extension
    // The server will return an error if the key is missing
    // Just return true and let the actual generation fail with a clear message if key is missing
    return this._apiClient !== null;
  }

  private async _handleGenerationError(errorMessage: string, provider: string): Promise<void> {
    const lowerError = errorMessage.toLowerCase();
    const isApiKeyError = lowerError.includes('api key') ||
                          lowerError.includes('apikey') ||
                          lowerError.includes('unauthorized') ||
                          lowerError.includes('authentication') ||
                          lowerError.includes('not configured') ||
                          lowerError.includes('missing');

    if (isApiKeyError) {
      const providerInfo = this._getProviderInfo(provider);
      const action = await vscode.window.showErrorMessage(
        `${providerInfo.name} API key not configured. ${errorMessage}`,
        'Setup Instructions',
        providerInfo.getKeyLabel,
        'Cancel'
      );

      if (action === 'Setup Instructions') {
        await vscode.window.showInformationMessage(
          `To configure ${providerInfo.name}:\n\n` +
          `1. Create a .env file in your project root\n` +
          `2. Add: ${providerInfo.envVar}=your_api_key_here\n` +
          `3. Re-select your project in Storial (to reload .env)`,
          { modal: true },
          'OK'
        );
      } else if (action === providerInfo.getKeyLabel) {
        vscode.env.openExternal(vscode.Uri.parse(providerInfo.keyUrl));
      }
    } else {
      vscode.window.showErrorMessage(`Generation failed: ${errorMessage}`);
    }
  }

  private _getProviderInfo(provider: string): { name: string; envVar: string; keyUrl: string; getKeyLabel: string } {
    switch (provider) {
      case 'openrouter':
        return {
          name: 'OpenRouter',
          envVar: 'OPENROUTER_API_KEY',
          keyUrl: 'https://openrouter.ai/keys',
          getKeyLabel: 'Get OpenRouter Key'
        };
      case 'openai':
        return {
          name: 'OpenAI',
          envVar: 'OPENAI_API_KEY',
          keyUrl: 'https://platform.openai.com/api-keys',
          getKeyLabel: 'Get OpenAI Key'
        };
      case 'local':
      default:
        return {
          name: 'Local LLM',
          envVar: 'N/A',
          keyUrl: 'https://lmstudio.ai/',
          getKeyLabel: 'Get LM Studio'
        };
    }
  }

  private async _generateStory(type: 'component' | 'page', name: string) {
    if (!this._apiClient) return;

    const providerSelection = await this._selectProvider();
    if (!providerSelection) return;

    const item = { type, name };

    this._panel.webview.postMessage({
      command: 'generatingStart',
      items: [item],
      total: 1
    });

    // Mark as processing
    this._panel.webview.postMessage({
      command: 'generatingProgress',
      current: 1,
      total: 1,
      currentItem: item
    });

    try {
      const result = await this._apiClient.generateStory(type, name, providerSelection.provider as any);

      // Send result
      this._panel.webview.postMessage({
        command: 'generatingProgress',
        current: 1,
        total: 1,
        currentItem: item,
        result: {
          success: result.success,
          error: result.success ? undefined : (result.error || result.message)
        }
      });

      if (result.success) {
        vscode.window.showInformationMessage(
          `Generated ${result.stories?.stories?.length || 0} stories for ${name}`
        );
      } else if (result.comingSoon) {
        vscode.window.showInformationMessage('Storial Cloud is coming soon!');
      } else {
        // Check if it's an API key error
        await this._handleGenerationError(result.error || result.message, providerSelection.provider);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Send error result
      this._panel.webview.postMessage({
        command: 'generatingProgress',
        current: 1,
        total: 1,
        currentItem: item,
        result: {
          success: false,
          error: errorMessage
        }
      });

      await this._handleGenerationError(errorMessage, providerSelection.provider);
    }

    this._panel.webview.postMessage({ command: 'generatingEnd' });
    await this._loadData();
  }

  private async _generateBulk(items: Array<{ type: 'component' | 'page'; name: string }>) {
    if (!this._apiClient || items.length === 0) return;

    const providerSelection = await this._selectProvider();
    if (!providerSelection) return;

    this._panel.webview.postMessage({
      command: 'generatingStart',
      items,
      total: items.length
    });

    let successCount = 0;
    let failCount = 0;
    let apiKeyError = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Send progress update - item is now processing
      this._panel.webview.postMessage({
        command: 'generatingProgress',
        current: i + 1,
        total: items.length,
        currentItem: item
      });

      try {
        const result = await this._apiClient.generateStory(
          item.type,
          item.name,
          providerSelection.provider as any
        );

        // Send result update for this item
        this._panel.webview.postMessage({
          command: 'generatingProgress',
          current: i + 1,
          total: items.length,
          currentItem: item,
          result: {
            success: result.success,
            error: result.success ? undefined : (result.error || result.message)
          }
        });

        if (result.success) {
          successCount++;
        } else {
          // Check if it's an API key error - stop bulk operation
          const errorMsg = result.error || result.message || '';
          if (this._isApiKeyError(errorMsg)) {
            apiKeyError = true;
            await this._handleGenerationError(errorMsg, providerSelection.provider);
            break;
          }
          failCount++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';

        // Send error result for this item
        this._panel.webview.postMessage({
          command: 'generatingProgress',
          current: i + 1,
          total: items.length,
          currentItem: item,
          result: {
            success: false,
            error: errorMsg
          }
        });

        if (this._isApiKeyError(errorMsg)) {
          apiKeyError = true;
          await this._handleGenerationError(errorMsg, providerSelection.provider);
          break;
        }
        failCount++;
      }
    }

    this._panel.webview.postMessage({ command: 'generatingEnd' });

    if (!apiKeyError) {
      vscode.window.showInformationMessage(
        `Generated stories: ${successCount} succeeded, ${failCount} failed`
      );
    } else if (successCount > 0) {
      vscode.window.showInformationMessage(
        `Generated ${successCount} stories before API key error`
      );
    }

    await this._loadData();
  }

  private _isApiKeyError(errorMessage: string): boolean {
    const lowerError = errorMessage.toLowerCase();
    return lowerError.includes('api key') ||
           lowerError.includes('apikey') ||
           lowerError.includes('unauthorized') ||
           lowerError.includes('authentication') ||
           lowerError.includes('not configured') ||
           lowerError.includes('missing');
  }

  private async _generateAllMissing(itemType: 'components' | 'pages' | 'all') {
    if (!this._apiClient) return;

    const overview = await this._apiClient.getOverview();
    if (!overview?.details) return;

    const items: Array<{ type: 'component' | 'page'; name: string }> = [];

    if (itemType === 'pages' || itemType === 'all') {
      const missingPages = overview.details.pages.filter(
        p => !p.hasStories && !p.isLayout && !p.isLoading && !p.isError
      );
      items.push(...missingPages.map(p => ({ type: 'page' as const, name: p.route })));
    }

    if (itemType === 'components' || itemType === 'all') {
      const missingComponents = overview.details.components.filter(c => !c.hasStories);
      items.push(...missingComponents.map(c => ({ type: 'component' as const, name: c.name })));
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage('All items already have stories!');
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Generate stories for ${items.length} items?`,
      'Generate',
      'Cancel'
    );

    if (confirm !== 'Generate') return;

    await this._generateBulk(items);
  }

  private _getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stories Manager</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --card-bg: var(--vscode-sideBar-background);
      --muted: var(--vscode-descriptionForeground);
      --success: #22c55e;
      --warning: #f59e0b;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      padding: 20px;
      line-height: 1.5;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 1.5em;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      padding: 6px 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }

    .btn-primary {
      background: var(--accent);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }

    .btn-secondary:hover {
      background: var(--card-bg);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .coverage-section {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .coverage-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .coverage-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .coverage-label {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }

    .coverage-bar {
      height: 8px;
      background: var(--border);
      border-radius: 4px;
      overflow: hidden;
    }

    .coverage-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .coverage-fill.pages {
      background: #3b82f6;
    }

    .coverage-fill.components {
      background: #8b5cf6;
    }

    .coverage-percent {
      font-size: 11px;
      color: var(--muted);
    }

    .actions-bar {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .filter-group label {
      font-size: 13px;
      color: var(--muted);
    }

    select {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 13px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      cursor: pointer;
    }

    .selection-info {
      margin-left: auto;
      font-size: 13px;
      color: var(--muted);
    }

    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .table-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 14px;
    }

    .table-header .checkbox-cell {
      margin-right: 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      text-align: left;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
    }

    th {
      font-weight: 500;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
      background: rgba(0,0,0,0.1);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover {
      background: rgba(255,255,255,0.02);
    }

    .checkbox-cell {
      width: 32px;
    }

    .name-cell {
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
    }

    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }

    .type-badge.client {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }

    .type-badge.server {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
    }

    .type-badge.page {
      background: rgba(139, 92, 246, 0.2);
      color: #a78bfa;
    }

    .status-icon {
      width: 18px;
      height: 18px;
    }

    .status-icon.has-stories {
      color: var(--success);
    }

    .status-icon.no-stories {
      color: var(--muted);
      opacity: 0.4;
    }

    .action-btn {
      padding: 4px 10px;
      font-size: 12px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      border-radius: 4px;
      cursor: pointer;
    }

    .action-btn:hover {
      background: var(--accent);
      border-color: var(--accent);
    }

    .progress-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes scaleIn {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .progress-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      min-width: 480px;
      max-width: 520px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.2s ease;
    }

    .progress-card.minimized {
      display: none;
    }

    .progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: rgba(0,0,0,0.1);
    }

    .progress-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(var(--accent-rgb, 75, 85, 99), 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .progress-icon svg {
      width: 16px;
      height: 16px;
      color: var(--accent);
      animation: pulse 2s ease-in-out infinite;
    }

    .progress-header-info h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
    }

    .progress-header-info p {
      font-size: 12px;
      color: var(--muted);
      margin: 2px 0 0 0;
    }

    .progress-minimize-btn {
      padding: 6px;
      background: transparent;
      border: none;
      color: var(--muted);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .progress-minimize-btn:hover {
      background: rgba(255,255,255,0.1);
      color: var(--fg);
    }

    .progress-bar-section {
      padding: 12px 20px;
      background: rgba(0,0,0,0.05);
    }

    .progress-bar-container {
      height: 6px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), #8b5cf6);
      border-radius: 3px;
      transition: width 0.5s ease;
    }

    .progress-items-list {
      max-height: 240px;
      overflow-y: auto;
    }

    .progress-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
      transition: background 0.2s;
    }

    .progress-item:last-child {
      border-bottom: none;
    }

    .progress-item.processing {
      background: rgba(var(--accent-rgb, 75, 85, 99), 0.05);
    }

    .progress-item-status {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .progress-item-status.pending {
      width: 18px;
      height: 18px;
      border: 2px solid var(--border);
      border-radius: 50%;
    }

    .progress-item-status.processing svg {
      width: 18px;
      height: 18px;
      color: var(--accent);
      animation: spin 1s linear infinite;
    }

    .progress-item-status.success svg {
      width: 18px;
      height: 18px;
      color: var(--success);
      animation: scaleIn 0.2s ease;
    }

    .progress-item-status.error svg {
      width: 18px;
      height: 18px;
      color: #ef4444;
      animation: scaleIn 0.2s ease;
    }

    .progress-item-info {
      flex: 1;
      min-width: 0;
    }

    .progress-item-name {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-item-type {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }

    .progress-item-type.page {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
    }

    .progress-item-type.component {
      background: rgba(139, 92, 246, 0.2);
      color: #a78bfa;
    }

    .progress-item-name span {
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .progress-item-error {
      font-size: 11px;
      color: #f87171;
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .progress-item-status-text {
      font-size: 11px;
      flex-shrink: 0;
    }

    .progress-item-status-text.pending { color: var(--muted); }
    .progress-item-status-text.processing { color: var(--accent); }
    .progress-item-status-text.success { color: var(--success); }
    .progress-item-status-text.error { color: #f87171; }

    .progress-footer {
      padding: 12px 20px;
      background: rgba(0,0,0,0.1);
      border-top: 1px solid var(--border);
      text-align: center;
    }

    .progress-footer p {
      font-size: 12px;
      color: var(--muted);
      margin: 0;
    }

    /* Minimized floating indicator */
    .progress-minimized {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 101;
      animation: slideUp 0.2s ease;
    }

    .progress-minimized-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px 8px 16px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 24px;
      cursor: pointer;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      transition: all 0.15s;
    }

    .progress-minimized-btn:hover {
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4);
      transform: translateY(-1px);
    }

    .progress-minimized-spinner {
      width: 16px;
      height: 16px;
      color: var(--accent);
      animation: spin 1s linear infinite;
    }

    .progress-minimized-count {
      font-size: 13px;
      font-weight: 500;
    }

    .progress-minimized-bar {
      width: 48px;
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-minimized-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), #8b5cf6);
      border-radius: 2px;
      transition: width 0.5s ease;
    }

    .progress-minimized-expand {
      width: 16px;
      height: 16px;
      color: var(--muted);
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px;
      color: var(--muted);
    }

    .error-message {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .tab {
      padding: 10px 16px;
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 14px;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }

    .tab:hover {
      color: var(--fg);
    }

    .tab.active {
      color: var(--fg);
      border-bottom-color: var(--accent);
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--muted);
    }

    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>
      Stories Manager
    </h1>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick="refresh()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
        </svg>
        Refresh
      </button>
    </div>
  </div>

  <div id="loading" class="loading">Loading...</div>

  <div id="error" class="error-message hidden"></div>

  <div id="content" class="hidden">
    <div class="coverage-section">
      <div class="coverage-grid">
        <div class="coverage-item">
          <div class="coverage-label">
            <span>Components</span>
            <span id="components-count">0 / 0</span>
          </div>
          <div class="coverage-bar">
            <div id="components-fill" class="coverage-fill components" style="width: 0%"></div>
          </div>
          <span id="components-percent" class="coverage-percent">0% coverage</span>
        </div>
        <div class="coverage-item">
          <div class="coverage-label">
            <span>Pages</span>
            <span id="pages-count">0 / 0</span>
          </div>
          <div class="coverage-bar">
            <div id="pages-fill" class="coverage-fill pages" style="width: 0%"></div>
          </div>
          <span id="pages-percent" class="coverage-percent">0% coverage</span>
        </div>
      </div>
    </div>

    <div class="actions-bar">
      <button class="btn btn-primary" onclick="generateAllMissing('all')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
        </svg>
        Generate All Missing
      </button>
      <button class="btn btn-secondary" onclick="generateSelected()" id="generate-selected-btn" disabled>
        Generate Selected (<span id="selected-count">0</span>)
      </button>

      <div class="filter-group">
        <label>
          <input type="checkbox" id="filter-missing" onchange="applyFilters()">
          Without stories only
        </label>
      </div>

      <span class="selection-info" id="selection-info"></span>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="components" onclick="switchTab('components')">Components</button>
      <button class="tab" data-tab="pages" onclick="switchTab('pages')">Pages</button>
    </div>

    <div id="components-table" class="table-container">
      <div class="table-header">
        <span class="checkbox-cell">
          <input type="checkbox" id="select-all-components" onchange="toggleSelectAll('components')">
        </span>
        <span>Components</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="checkbox-cell"></th>
            <th>Name</th>
            <th>Type</th>
            <th>Usage</th>
            <th>Stories</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="components-tbody"></tbody>
      </table>
    </div>

    <div id="pages-table" class="table-container hidden">
      <div class="table-header">
        <span class="checkbox-cell">
          <input type="checkbox" id="select-all-pages" onchange="toggleSelectAll('pages')">
        </span>
        <span>Pages</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="checkbox-cell"></th>
            <th>Route</th>
            <th>Stories</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="pages-tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- Progress Modal - Expanded -->
  <div id="progress-overlay" class="progress-overlay hidden">
    <div class="progress-card" id="progress-card">
      <div class="progress-header">
        <div class="progress-header-left">
          <div class="progress-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
            </svg>
          </div>
          <div class="progress-header-info">
            <h3>Generating Stories</h3>
            <p id="progress-count">0 of 0 completed</p>
          </div>
        </div>
        <button class="progress-minimize-btn" onclick="minimizeProgress()" title="Minimize">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
            <line x1="14" y1="10" x2="21" y2="3"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </div>
      <div class="progress-bar-section">
        <div class="progress-bar-container">
          <div class="progress-bar-fill" id="progress-fill" style="width: 0%"></div>
        </div>
      </div>
      <div class="progress-items-list" id="progress-items-list">
        <!-- Items will be rendered here -->
      </div>
      <div class="progress-footer">
        <p id="progress-status">Preparing...</p>
      </div>
    </div>
  </div>

  <!-- Progress Indicator - Minimized (floating) -->
  <div id="progress-minimized" class="progress-minimized hidden">
    <button class="progress-minimized-btn" onclick="maximizeProgress()">
      <svg class="progress-minimized-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span class="progress-minimized-count" id="progress-minimized-count">0/0</span>
      <div class="progress-minimized-bar">
        <div class="progress-minimized-bar-fill" id="progress-minimized-fill" style="width: 0%"></div>
      </div>
      <svg class="progress-minimized-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
    </button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let data = null;
    let currentTab = 'components';
    let selectedItems = { pages: new Set(), components: new Set() };
    let filterMissing = false;
    let progressItems = [];
    let isProgressMinimized = false;

    // Listen for messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.command) {
        case 'setData':
          data = message.data;
          renderData();
          break;
        case 'setError':
          showError(message.error);
          break;
        case 'generatingStart':
          showProgress(message.items || [], message.total || message.items?.length || 0);
          break;
        case 'generatingProgress':
          updateProgress(message.current, message.total, message.currentItem, message.result);
          break;
        case 'generatingEnd':
          hideProgress();
          break;
      }
    });

    function refresh() {
      document.getElementById('loading').classList.remove('hidden');
      document.getElementById('content').classList.add('hidden');
      document.getElementById('error').classList.add('hidden');
      vscode.postMessage({ command: 'refresh' });
    }

    function showError(error) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('content').classList.add('hidden');
      document.getElementById('error').classList.remove('hidden');
      document.getElementById('error').textContent = error;
    }

    function renderData() {
      if (!data) return;

      document.getElementById('loading').classList.add('hidden');
      document.getElementById('error').classList.add('hidden');
      document.getElementById('content').classList.remove('hidden');

      // Update coverage
      const pagesCoverage = data.counts.pages > 0
        ? Math.round((data.stories.pagesWithStories / data.counts.pages) * 100)
        : 0;
      const componentsCoverage = data.counts.components > 0
        ? Math.round((data.stories.componentsWithStories / data.counts.components) * 100)
        : 0;

      document.getElementById('pages-count').textContent =
        \`\${data.stories.pagesWithStories} / \${data.counts.pages}\`;
      document.getElementById('pages-fill').style.width = \`\${pagesCoverage}%\`;
      document.getElementById('pages-percent').textContent = \`\${pagesCoverage}% coverage\`;

      document.getElementById('components-count').textContent =
        \`\${data.stories.componentsWithStories} / \${data.counts.components}\`;
      document.getElementById('components-fill').style.width = \`\${componentsCoverage}%\`;
      document.getElementById('components-percent').textContent = \`\${componentsCoverage}% coverage\`;

      // Render tables
      renderPages();
      renderComponents();
      updateSelectionInfo();
    }

    function renderPages() {
      if (!data?.details?.pages) return;

      const tbody = document.getElementById('pages-tbody');
      const pages = data.details.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError);
      const filtered = filterMissing ? pages.filter(p => !p.hasStories) : pages;

      tbody.innerHTML = filtered.map(page => \`
        <tr>
          <td class="checkbox-cell">
            <input type="checkbox"
              data-type="page"
              data-name="\${page.route}"
              \${selectedItems.pages.has(page.route) ? 'checked' : ''}
              onchange="toggleItem('pages', '\${page.route}')">
          </td>
          <td class="name-cell">\${page.route}</td>
          <td>
            \${page.hasStories
              ? '<svg class="status-icon has-stories" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
              : '<svg class="status-icon no-stories" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            }
          </td>
          <td>
            <button class="action-btn" onclick="generateSingle('page', '\${page.route}')">Generate</button>
          </td>
        </tr>
      \`).join('');
    }

    function renderComponents() {
      if (!data?.details?.components) return;

      const tbody = document.getElementById('components-tbody');
      const components = data.details.components;
      const filtered = filterMissing ? components.filter(c => !c.hasStories) : components;

      tbody.innerHTML = filtered.map(comp => \`
        <tr>
          <td class="checkbox-cell">
            <input type="checkbox"
              data-type="component"
              data-name="\${comp.name}"
              \${selectedItems.components.has(comp.name) ? 'checked' : ''}
              onchange="toggleItem('components', '\${comp.name}')">
          </td>
          <td class="name-cell">\${comp.name}</td>
          <td>
            <span class="type-badge \${comp.isClientComponent ? 'client' : 'server'}">
              \${comp.isClientComponent ? 'Client' : 'Server'}
            </span>
          </td>
          <td>\${comp.usedInPages + comp.usedInComponents}</td>
          <td>
            \${comp.hasStories
              ? '<svg class="status-icon has-stories" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
              : '<svg class="status-icon no-stories" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            }
          </td>
          <td>
            <button class="action-btn" onclick="generateSingle('component', '\${comp.name}')">Generate</button>
          </td>
        </tr>
      \`).join('');
    }

    function switchTab(tab) {
      currentTab = tab;

      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
      });

      document.getElementById('pages-table').classList.toggle('hidden', tab !== 'pages');
      document.getElementById('components-table').classList.toggle('hidden', tab !== 'components');
    }

    function toggleSelectAll(type) {
      const checkbox = document.getElementById(\`select-all-\${type}\`);
      const checkboxes = document.querySelectorAll(\`input[data-type="\${type === 'pages' ? 'page' : 'component'}"]\`);

      checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const name = cb.dataset.name;
        if (checkbox.checked) {
          selectedItems[type].add(name);
        } else {
          selectedItems[type].delete(name);
        }
      });

      updateSelectionInfo();
    }

    function toggleItem(type, name) {
      if (selectedItems[type].has(name)) {
        selectedItems[type].delete(name);
      } else {
        selectedItems[type].add(name);
      }
      updateSelectionInfo();
    }

    function updateSelectionInfo() {
      const total = selectedItems.pages.size + selectedItems.components.size;
      document.getElementById('selected-count').textContent = total;
      document.getElementById('generate-selected-btn').disabled = total === 0;

      const info = [];
      if (selectedItems.pages.size > 0) info.push(\`\${selectedItems.pages.size} pages\`);
      if (selectedItems.components.size > 0) info.push(\`\${selectedItems.components.size} components\`);
      document.getElementById('selection-info').textContent = info.length > 0 ? \`Selected: \${info.join(', ')}\` : '';
    }

    function applyFilters() {
      filterMissing = document.getElementById('filter-missing').checked;
      renderPages();
      renderComponents();
    }

    function generateSingle(type, name) {
      vscode.postMessage({ command: 'generateStory', type, name });
    }

    function generateSelected() {
      const items = [];
      selectedItems.pages.forEach(name => items.push({ type: 'page', name }));
      selectedItems.components.forEach(name => items.push({ type: 'component', name }));

      if (items.length > 0) {
        vscode.postMessage({ command: 'generateBulk', items });
      }
    }

    function generateAllMissing(itemType) {
      vscode.postMessage({ command: 'generateAllMissing', itemType });
    }

    function showProgress(items, total) {
      // Initialize progress items with pending status
      progressItems = items.map(item => ({
        ...item,
        status: 'pending',
        error: null
      }));
      isProgressMinimized = false;

      document.getElementById('progress-overlay').classList.remove('hidden');
      document.getElementById('progress-minimized').classList.add('hidden');
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-minimized-fill').style.width = '0%';
      document.getElementById('progress-count').textContent = \`0 of \${total} completed\`;
      document.getElementById('progress-minimized-count').textContent = \`0/\${total}\`;
      document.getElementById('progress-status').textContent = 'Starting...';

      renderProgressItems();
    }

    function updateProgress(current, total, currentItem, result) {
      // Update the current item status
      if (currentItem) {
        const idx = progressItems.findIndex(
          p => p.type === currentItem.type && p.name === currentItem.name
        );
        if (idx !== -1) {
          if (result) {
            // Result received - update status
            progressItems[idx].status = result.success ? 'success' : 'error';
            progressItems[idx].error = result.error;
          } else {
            // Currently processing
            progressItems[idx].status = 'processing';
          }
        }
      }

      const completed = progressItems.filter(p => p.status === 'success' || p.status === 'error').length;
      const percent = Math.round((completed / total) * 100);

      document.getElementById('progress-fill').style.width = \`\${percent}%\`;
      document.getElementById('progress-minimized-fill').style.width = \`\${percent}%\`;
      document.getElementById('progress-count').textContent = \`\${completed} of \${total} completed\`;
      document.getElementById('progress-minimized-count').textContent = \`\${completed}/\${total}\`;
      document.getElementById('progress-status').textContent = currentItem
        ? \`Currently processing: \${currentItem.name}\`
        : completed === total
          ? 'Generation complete!'
          : 'Processing...';

      renderProgressItems();
    }

    function renderProgressItems() {
      const container = document.getElementById('progress-items-list');
      container.innerHTML = progressItems.map(item => \`
        <div class="progress-item \${item.status === 'processing' ? 'processing' : ''}">
          <div class="progress-item-status \${item.status}">
            \${item.status === 'pending' ? '' :
              item.status === 'processing' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>' :
              item.status === 'success' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' :
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            }
          </div>
          <div class="progress-item-info">
            <div class="progress-item-name">
              <span class="progress-item-type \${item.type}">\${item.type}</span>
              <span>\${item.name}</span>
            </div>
            \${item.error ? \`<div class="progress-item-error">\${item.error}</div>\` : ''}
          </div>
          <span class="progress-item-status-text \${item.status}">
            \${item.status === 'pending' ? 'Waiting' :
              item.status === 'processing' ? 'Generating...' :
              item.status === 'success' ? 'Done' : 'Failed'}
          </span>
        </div>
      \`).join('');

      // Auto-scroll to show the current processing item
      const processingItem = container.querySelector('.progress-item.processing');
      if (processingItem) {
        processingItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function minimizeProgress() {
      isProgressMinimized = true;
      document.getElementById('progress-overlay').classList.add('hidden');
      document.getElementById('progress-minimized').classList.remove('hidden');
    }

    function maximizeProgress() {
      isProgressMinimized = false;
      document.getElementById('progress-overlay').classList.remove('hidden');
      document.getElementById('progress-minimized').classList.add('hidden');
    }

    function hideProgress() {
      document.getElementById('progress-overlay').classList.add('hidden');
      document.getElementById('progress-minimized').classList.add('hidden');
      progressItems = [];
      isProgressMinimized = false;
      // Clear selections after bulk operation
      selectedItems.pages.clear();
      selectedItems.components.clear();
      updateSelectionInfo();
    }
  </script>
</body>
</html>`;
  }

  public dispose() {
    StoriesPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
