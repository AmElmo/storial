import { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  Layers,
  LayoutGrid,
  RefreshCw,
  ChevronLeft,
  Filter,
  Loader2
} from 'lucide-react';
import {
  getScanOverview,
  generateStoriesWithLLM,
  type ScanOverviewData,
  type LLMProvider,
  OPENROUTER_MODELS,
  getProviderColor
} from '../lib/api';

interface StoriesManagerProps {
  onBack: () => void;
}

type ItemType = 'page' | 'component';
type TabType = 'pages' | 'components';

interface GeneratingItem {
  type: ItemType;
  name: string;
}

interface GenerationProgress {
  current: number;
  total: number;
  currentItem: GeneratingItem | null;
  results: Array<{ item: GeneratingItem; success: boolean; error?: string }>;
}

export function StoriesManager({ onBack }: StoriesManagerProps) {
  const [data, setData] = useState<ScanOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('components');
  const [filterMissing, setFilterMissing] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  // Provider selection state
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('openrouter');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [pendingGeneration, setPendingGeneration] = useState<GeneratingItem[] | null>(null);
  const [generationError, setGenerationError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await getScanOverview();
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Filtered items based on current tab and filter
  const filteredPages = useMemo(() => {
    if (!data?.details?.pages) return [];
    const pages = data.details.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError);
    return filterMissing ? pages.filter(p => !p.hasStories) : pages;
  }, [data, filterMissing]);

  const filteredComponents = useMemo(() => {
    if (!data?.details?.components) return [];
    return filterMissing
      ? data.details.components.filter(c => !c.hasStories)
      : data.details.components;
  }, [data, filterMissing]);

  // Coverage calculations
  const coverage = useMemo(() => {
    if (!data) return { pages: 0, components: 0 };
    return {
      pages: data.counts.pages > 0
        ? Math.round((data.stories.pagesWithStories / data.counts.pages) * 100)
        : 0,
      components: data.counts.components > 0
        ? Math.round((data.stories.componentsWithStories / data.counts.components) * 100)
        : 0
    };
  }, [data]);

  // Selection helpers
  const getItemKey = (type: ItemType, name: string) => `${type}:${name}`;

  const isSelected = (type: ItemType, name: string) => selectedItems.has(getItemKey(type, name));

  const toggleSelection = (type: ItemType, name: string) => {
    const key = getItemKey(type, name);
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const items = activeTab === 'pages' ? filteredPages : filteredComponents;
    const type: ItemType = activeTab === 'pages' ? 'page' : 'component';
    const allSelected = items.every(item =>
      isSelected(type, activeTab === 'pages' ? (item as any).route : (item as any).name)
    );

    if (allSelected) {
      // Deselect all in current tab
      setSelectedItems(prev => {
        const next = new Set(prev);
        items.forEach(item => {
          const name = activeTab === 'pages' ? (item as any).route : (item as any).name;
          next.delete(getItemKey(type, name));
        });
        return next;
      });
    } else {
      // Select all in current tab
      setSelectedItems(prev => {
        const next = new Set(prev);
        items.forEach(item => {
          const name = activeTab === 'pages' ? (item as any).route : (item as any).name;
          next.add(getItemKey(type, name));
        });
        return next;
      });
    }
  };

  // Generation functions
  const startGeneration = (items: GeneratingItem[]) => {
    setPendingGeneration(items);
    setShowProviderModal(true);
  };

  const confirmGeneration = async () => {
    if (!pendingGeneration) return;

    setShowProviderModal(false);
    setGenerationError(null);
    setGenerating(true);
    setProgress({
      current: 0,
      total: pendingGeneration.length,
      currentItem: null,
      results: []
    });

    const results: GenerationProgress['results'] = [];

    for (let i = 0; i < pendingGeneration.length; i++) {
      const item = pendingGeneration[i];

      setProgress(prev => prev ? {
        ...prev,
        current: i,
        currentItem: item
      } : null);

      try {
        const result = await generateStoriesWithLLM(
          item.type,
          item.name,
          selectedProvider,
          selectedProvider === 'openrouter' ? selectedModel : undefined
        );

        // Check for API key errors - stop immediately and show error
        if (!result.success && (
          result.message?.includes('API key') ||
          result.error?.includes('API key') ||
          result.hint?.includes('API key')
        )) {
          setGenerating(false);
          setProgress(null);
          setGenerationError({
            message: result.message || result.error || 'API key not configured',
            hint: result.hint
          });
          return;
        }

        results.push({
          item,
          success: result.success,
          error: result.error || result.message
        });
      } catch (err) {
        results.push({
          item,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    setProgress({
      current: pendingGeneration.length,
      total: pendingGeneration.length,
      currentItem: null,
      results
    });

    // Clear selection and reload data
    setSelectedItems(new Set());
    setPendingGeneration(null);
    setGenerating(false);
    await loadData();
  };

  const generateSingle = (type: ItemType, name: string) => {
    startGeneration([{ type, name }]);
  };

  const generateSelected = () => {
    const items: GeneratingItem[] = [];
    selectedItems.forEach(key => {
      const [type, name] = key.split(':') as [ItemType, string];
      items.push({ type, name });
    });
    if (items.length > 0) {
      startGeneration(items);
    }
  };

  const generateAllMissing = () => {
    const items: GeneratingItem[] = [];

    if (data?.details) {
      data.details.pages
        .filter(p => !p.hasStories && !p.isLayout && !p.isLoading && !p.isError)
        .forEach(p => items.push({ type: 'page', name: p.route }));

      data.details.components
        .filter(c => !c.hasStories)
        .forEach(c => items.push({ type: 'component', name: c.name }));
    }

    if (items.length > 0) {
      startGeneration(items);
    }
  };

  // Count missing stories
  const missingCount = useMemo(() => {
    if (!data?.details) return 0;
    const missingPages = data.details.pages.filter(
      p => !p.hasStories && !p.isLayout && !p.isLoading && !p.isError
    ).length;
    const missingComponents = data.details.components.filter(c => !c.hasStories).length;
    return missingPages + missingComponents;
  }, [data]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Stories Manager</h2>
                <p className="text-sm text-muted-foreground">
                  Generate and manage component stories
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Coverage Section */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Story Coverage
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Components
                </span>
                <span className="text-sm font-medium">
                  {data?.stories.componentsWithStories} / {data?.counts.components}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${coverage.components}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{coverage.components}% coverage</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4" />
                  Pages
                </span>
                <span className="text-sm font-medium">
                  {data?.stories.pagesWithStories} / {data?.counts.pages}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${coverage.pages}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{coverage.pages}% coverage</p>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={generateAllMissing}
            disabled={generating || missingCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate All Missing ({missingCount})
          </button>

          <button
            onClick={generateSelected}
            disabled={generating || selectedItems.size === 0}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Generate Selected ({selectedItems.size})
          </button>

          <label className="flex items-center gap-2 text-sm cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={filterMissing}
              onChange={(e) => setFilterMissing(e.target.checked)}
              className="rounded"
            />
            <Filter className="w-4 h-4 text-muted-foreground" />
            Without stories only
          </label>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('components')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'components'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Components ({filteredComponents.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('pages')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'pages'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Pages ({filteredPages.length})
            </span>
          </button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    onChange={toggleSelectAll}
                    checked={
                      (activeTab === 'pages' ? filteredPages : filteredComponents).length > 0 &&
                      (activeTab === 'pages' ? filteredPages : filteredComponents).every(item =>
                        isSelected(
                          activeTab === 'pages' ? 'page' : 'component',
                          activeTab === 'pages' ? (item as any).route : (item as any).name
                        )
                      )
                    }
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium">
                  {activeTab === 'pages' ? 'Route' : 'Name'}
                </th>
                {activeTab === 'components' && (
                  <>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-center px-4 py-3 font-medium">Usage</th>
                  </>
                )}
                <th className="text-center px-4 py-3 font-medium">Stories</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeTab === 'pages' ? (
                filteredPages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      {filterMissing ? 'All pages have stories!' : 'No pages found'}
                    </td>
                  </tr>
                ) : (
                  filteredPages.map((page) => (
                    <tr key={page.route} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected('page', page.route)}
                          onChange={() => toggleSelection('page', page.route)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{page.route}</td>
                      <td className="px-4 py-3 text-center">
                        {page.hasStories ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 inline-block" />
                        ) : (
                          <XCircle className="w-5 h-5 text-muted-foreground/40 inline-block" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => generateSingle('page', page.route)}
                          disabled={generating}
                          className="px-3 py-1.5 text-xs border rounded hover:bg-primary hover:text-primary-foreground hover:border-primary disabled:opacity-50 transition-colors"
                        >
                          Generate
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : (
                filteredComponents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      {filterMissing ? 'All components have stories!' : 'No components found'}
                    </td>
                  </tr>
                ) : (
                  filteredComponents.map((comp) => (
                    <tr key={comp.name} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected('component', comp.name)}
                          onChange={() => toggleSelection('component', comp.name)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{comp.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          comp.isClientComponent
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        }`}>
                          {comp.isClientComponent ? 'Client' : 'Server'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {comp.usedInPages + comp.usedInComponents}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {comp.hasStories ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 inline-block" />
                        ) : (
                          <XCircle className="w-5 h-5 text-muted-foreground/40 inline-block" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => generateSingle('component', comp.name)}
                          disabled={generating}
                          className="px-3 py-1.5 text-xs border rounded hover:bg-primary hover:text-primary-foreground hover:border-primary disabled:opacity-50 transition-colors"
                        >
                          Generate
                        </button>
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provider Selection Modal */}
      {showProviderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Select AI Provider</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Generate stories for {pendingGeneration?.length} item(s)
            </p>

            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="provider"
                  value="openrouter"
                  checked={selectedProvider === 'openrouter'}
                  onChange={() => setSelectedProvider('openrouter')}
                />
                <div className="flex-1">
                  <div className="font-medium">OpenRouter</div>
                  <div className="text-xs text-muted-foreground">Access to Claude, GPT-4, Gemini, and more</div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Requires OPENROUTER_API_KEY in .env file or environment
                  </div>
                </div>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Get key →
                </a>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="provider"
                  value="openai"
                  checked={selectedProvider === 'openai'}
                  onChange={() => setSelectedProvider('openai')}
                />
                <div className="flex-1">
                  <div className="font-medium">OpenAI (GPT-4o-mini)</div>
                  <div className="text-xs text-muted-foreground">Fast and affordable</div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Requires OPENAI_API_KEY in .env file or environment
                  </div>
                </div>
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Get key →
                </a>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="provider"
                  value="local"
                  checked={selectedProvider === 'local'}
                  onChange={() => setSelectedProvider('local')}
                />
                <div className="flex-1">
                  <div className="font-medium">Local LLM</div>
                  <div className="text-xs text-muted-foreground">Use your own local model (LM Studio, Ollama, etc.)</div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Requires local server at http://localhost:1234
                  </div>
                </div>
              </label>
            </div>

            {selectedProvider === 'openrouter' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Select Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-background"
                >
                  <option value="">-- Select a model --</option>
                  <optgroup label="Anthropic">
                    {OPENROUTER_MODELS.filter(m => m.provider === 'anthropic').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="OpenAI">
                    {OPENROUTER_MODELS.filter(m => m.provider === 'openai').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Google">
                    {OPENROUTER_MODELS.filter(m => m.provider === 'google').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Other">
                    {OPENROUTER_MODELS.filter(m => !['anthropic', 'openai', 'google', 'free'].includes(m.provider)).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Free (Rate Limited)">
                    {OPENROUTER_MODELS.filter(m => m.provider === 'free').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowProviderModal(false);
                  setPendingGeneration(null);
                }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmGeneration}
                disabled={selectedProvider === 'openrouter' && !selectedModel}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      {generating && progress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-xl p-6 w-full max-w-md mx-4 text-center">
            <h3 className="text-lg font-semibold mb-2">Generating Stories</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {progress.currentItem
                ? `Processing: ${progress.currentItem.name}`
                : 'Preparing...'}
            </p>
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {progress.current} / {progress.total}
            </p>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {generationError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                  Configuration Required
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {generationError.message}
                </p>
              </div>
            </div>

            {generationError.hint && (
              <div className="bg-muted/50 rounded-lg p-4 mb-4">
                <p className="text-sm">
                  <strong>How to fix:</strong> {generationError.hint}
                </p>
              </div>
            )}

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Setup Instructions:</strong>
              </p>
              <ol className="text-sm text-amber-700 dark:text-amber-300 mt-2 space-y-1 list-decimal list-inside">
                <li>Create a <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">.env</code> file in your project root</li>
                <li>Add your API key: <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
                  {selectedProvider === 'openrouter' ? 'OPENROUTER_API_KEY=your-key' : 'OPENAI_API_KEY=your-key'}
                </code></li>
                <li>Restart the Storial server</li>
              </ol>
            </div>

            <div className="flex justify-end gap-3">
              <a
                href={selectedProvider === 'openrouter' ? 'https://openrouter.ai/keys' : 'https://platform.openai.com/api-keys'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
              >
                Get API Key →
              </a>
              <button
                onClick={() => setGenerationError(null)}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
