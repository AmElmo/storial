import { useState, useEffect, useRef } from 'react';
import type { PageInfo, ComponentInfo, HookInfo, ContextInfo, UtilityInfo, LLMProvider, LLMCost } from '@/lib/api';
import { generateStoriesPrompt, generateStoriesWithLLM, testLLMConnection, OPENROUTER_MODELS, getProviderColor } from '@/lib/api';
import type { SelectedItem } from './Sidebar';
import { 
  FileText, 
  Layers, 
  Link2, 
  Database,
  ChevronRight,
  ExternalLink,
  Monitor,
  Server,
  Code,
  ArrowRight,
  Anchor,
  Share2,
  Wrench,
  Package,
  Sparkles,
  X,
  BookOpen,
  Loader2,
  Cpu,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Cloud,
  Zap,
  DollarSign
} from 'lucide-react';

// Logging
const log = {
  structure: (msg: string, data?: any) => {
    console.debug(`%c[STRUCTURE]%c ${msg}`, 'color: #06b6d4; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  }
};

// Generate AI investigation prompt
function generateInvestigatePrompt(type: string, name: string, filePath: string): string {
  return `Investigate if this ${type} is truly unused or if it's a false positive:

**${type}:** ${name}
**File:** ${filePath}

Please check:
1. Is it imported via barrel exports (index.ts)?
2. Is it used with dynamic imports?
3. Is it referenced in tests, stories, or config files?
4. Is it an entry point or exported for external use?

If unused, confirm it's safe to delete. If used, explain where.`;
}

// Check if item is potentially unused
function isPotentiallyUnused(item: SelectedItem): boolean {
  if (!item) return false;
  
  switch (item.type) {
    case 'component':
      return item.item.usedInPages.length === 0 && item.item.usedInComponents.length === 0;
    case 'hook':
      return item.item.usedIn.length === 0;
    case 'context':
      return item.item.usedIn.length === 0;
    case 'utility':
      return item.item.usedIn.length === 0;
    default:
      return false;
  }
}

// Modal for showing the copied prompt
function PromptModal({ 
  title,
  subtitle,
  prompt, 
  icon,
  onClose 
}: { 
  title: string;
  subtitle: string;
  prompt: string;
  icon: React.ReactNode;
  onClose: () => void;
}) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card border rounded-lg shadow-xl max-w-2xl w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              {icon}
            </div>
            <div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4">
          <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-auto max-h-96 whitespace-pre-wrap">
            {prompt}
          </pre>
        </div>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t bg-muted/30 rounded-b-lg">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

interface StructureViewProps {
  item: SelectedItem;
  allPages: PageInfo[];
  allComponents: ComponentInfo[];
  allHooks: HookInfo[];
  allContexts: ContextInfo[];
  allUtilities: UtilityInfo[];
  onNavigateToPage: (page: PageInfo) => void;
  onNavigateToComponent: (component: ComponentInfo) => void;
  onNavigateToHook: (hook: HookInfo) => void;
  onNavigateToContext: (context: ContextInfo) => void;
  onNavigateToUtility: (utility: UtilityInfo) => void;
}

export function StructureView({ 
  item, 
  allPages, 
  allComponents,
  allHooks,
  allContexts: _allContexts,
  allUtilities: _allUtilities,
  onNavigateToPage,
  onNavigateToComponent,
  onNavigateToHook,
  onNavigateToContext: _onNavigateToContext,
  onNavigateToUtility: _onNavigateToUtility
}: StructureViewProps) {
  // Note: allContexts, allUtilities, onNavigateToContext, onNavigateToUtility 
  // are available for future cross-navigation features
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [modalType, setModalType] = useState<'investigate' | 'stories' | 'llm-result'>('investigate');
  const [isGeneratingStories, setIsGeneratingStories] = useState(false);
  const [isGeneratingWithLLM, setIsGeneratingWithLLM] = useState(false);
  const [llmResult, setLLMResult] = useState<{ 
    success: boolean; 
    message: string; 
    error?: string; 
    hint?: string; 
    provider?: LLMProvider;
    model?: string;
    cost?: LLMCost;
  } | null>(null);
  
  // Model selection dropdown
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!item) return null;

  log.structure('Render', { type: item.type });

  const isUnused = isPotentiallyUnused(item);
  
  // Can generate stories for pages and components
  const canGenerateStories = item.type === 'page' || item.type === 'component';

  const getIcon = () => {
    switch (item.type) {
      case 'page': return <FileText className="w-5 h-5 text-blue-500" />;
      case 'component': return <Layers className="w-5 h-5 text-purple-500" />;
      case 'hook': return <Anchor className="w-5 h-5 text-cyan-500" />;
      case 'context': return <Share2 className="w-5 h-5 text-orange-500" />;
      case 'utility': return <Wrench className="w-5 h-5 text-slate-500" />;
    }
  };

  const getTitle = () => {
    switch (item.type) {
      case 'page': return item.item.route || '/';
      case 'component': return item.item.name;
      case 'hook': return item.item.name;
      case 'context': return item.item.name;
      case 'utility': return item.item.name;
    }
  };

  const getFilePath = () => {
    return item.item.filePath;
  };

  const handleAskAI = async () => {
    const prompt = generateInvestigatePrompt(item.type, getTitle(), getFilePath());
    await navigator.clipboard.writeText(prompt);
    setAIPrompt(prompt);
    setModalType('investigate');
    setShowAIModal(true);
  };

  const handleGenerateStories = async () => {
    if (!canGenerateStories) return;
    
    setIsGeneratingStories(true);
    try {
      const name = item.type === 'component' 
        ? (item.item as ComponentInfo).name 
        : (item.item as PageInfo).route || (item.item as PageInfo).fileName;
      
      const result = await generateStoriesPrompt(item.type as 'component' | 'page', name);
      await navigator.clipboard.writeText(result.prompt);
      setAIPrompt(result.prompt);
      setModalType('stories');
      setShowAIModal(true);
    } catch (error) {
      console.error('Failed to generate stories prompt:', error);
    } finally {
      setIsGeneratingStories(false);
    }
  };

  const handleAutoGenerate = async (provider: LLMProvider, model?: string) => {
    if (!canGenerateStories) return;
    
    setShowModelDropdown(false);
    setIsGeneratingWithLLM(true);
    setLLMResult(null);
    
    const providerLabels: Record<LLMProvider, string> = {
      local: 'Local LLM',
      openai: 'ChatGPT',
      openrouter: 'OpenRouter'
    };
    const providerLabel = providerLabels[provider] || provider;
    
    try {
      // For local LLM, test the connection first
      if (provider === 'local') {
        const connectionTest = await testLLMConnection();
        
        if (!connectionTest.connected) {
          setLLMResult({
            success: false,
            message: 'Cannot connect to local LLM',
            error: connectionTest.error,
            hint: connectionTest.hint || 'Make sure LM Studio is running with the local server enabled (port 1234)',
            provider: 'local'
          });
          setModalType('llm-result');
          setShowAIModal(true);
          return;
        }
      }
      
      // Generate stories with the selected provider
      const name = item.type === 'component' 
        ? (item.item as ComponentInfo).name 
        : (item.item as PageInfo).route || (item.item as PageInfo).fileName;
      
      const result = await generateStoriesWithLLM(item.type as 'component' | 'page', name, provider, model);
      
      setLLMResult({
        success: result.success,
        message: result.message,
        error: result.error,
        hint: result.hint,
        provider: result.provider,
        model: result.model || result.stats?.model,
        cost: result.cost
      });
      setModalType('llm-result');
      setShowAIModal(true);
      
    } catch (error) {
      console.error(`Failed to generate with ${providerLabel}:`, error);
      setLLMResult({
        success: false,
        message: 'Failed to generate stories',
        error: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check the console for more details',
        provider
      });
      setModalType('llm-result');
      setShowAIModal(true);
    } finally {
      setIsGeneratingWithLLM(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Prompt Modal for copy-to-clipboard */}
      {showAIModal && modalType !== 'llm-result' && (
        <PromptModal 
          title={modalType === 'stories' ? 'Stories Prompt Copied!' : 'Prompt Copied!'}
          subtitle={modalType === 'stories' 
            ? 'Paste into your AI coding tool to generate the stories file' 
            : 'Paste into your AI coding tool'}
          icon={modalType === 'stories' 
            ? <BookOpen className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            : <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
          prompt={aiPrompt} 
          onClose={() => setShowAIModal(false)} 
        />
      )}
      
      {/* LLM Result Modal */}
      {showAIModal && modalType === 'llm-result' && llmResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${llmResult.success ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {llmResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`font-semibold ${llmResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                    {llmResult.success ? 'Stories Generated!' : 'Generation Failed'}
                  </h3>
                  {llmResult.provider && (
                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                      llmResult.provider === 'openai' 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                        : llmResult.provider === 'openrouter'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    }`}>
                      {llmResult.provider === 'openai' ? 'ChatGPT' : llmResult.provider === 'openrouter' ? 'OpenRouter' : 'Local LLM'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{llmResult.message}</p>
                {llmResult.model && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{llmResult.model}</p>
                )}
              </div>
            </div>
            
            {/* Cost information */}
            {llmResult.success && llmResult.cost && llmResult.cost.totalCost > 0 && (
              <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md">
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                  <span className="font-medium">Cost: ${llmResult.cost.totalCost.toFixed(6)}</span>
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                  Input: ${llmResult.cost.inputCost.toFixed(6)} · Output: ${llmResult.cost.outputCost.toFixed(6)}
                </div>
              </div>
            )}
            
            {llmResult.error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-600 dark:text-red-400 font-mono">{llmResult.error}</p>
              </div>
            )}
            
            {llmResult.hint && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <p className="text-sm text-amber-600 dark:text-amber-400">💡 {llmResult.hint}</p>
              </div>
            )}
            
            {llmResult.success && (
              <p className="text-sm text-muted-foreground mb-4">
                Switch to the <strong>Preview</strong> tab to see your new stories and test them.
              </p>
            )}
            
            <button
              onClick={() => setShowAIModal(false)}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {llmResult.success ? 'View Stories' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          {getIcon()}
          <h2 className="text-lg font-semibold flex-1">{getTitle()}</h2>
          {item.type === 'component' && item.item.isClientComponent && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              Client
            </span>
          )}
          {item.type === 'component' && !item.item.isClientComponent && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Server
            </span>
          )}
          {item.type === 'context' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              {item.item.providerName}
            </span>
          )}
          {/* Generate Stories buttons - for pages and components */}
          {canGenerateStories && (
            <>
              {/* Copy Prompt button */}
              <button
                onClick={handleGenerateStories}
                disabled={isGeneratingStories || isGeneratingWithLLM}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                title="Copy AI prompt to clipboard"
              >
                {isGeneratingStories ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5" />
                )}
                Copy Prompt
              </button>
              
              {/* Auto Generate with Model Selection */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  disabled={isGeneratingStories || isGeneratingWithLLM}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                  title="Generate stories using AI"
                >
                  {isGeneratingWithLLM ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Auto Generate
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>
                
                {/* Model Selection Dropdown */}
                {showModelDropdown && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[240px] bg-card border rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-2 border-b bg-muted/50">
                      <p className="text-xs font-medium text-muted-foreground">Select Model</p>
                    </div>
                    <div className="p-1 max-h-[450px] overflow-y-auto">
                      
                      {/* === LOCAL SECTION === */}
                      <div className="px-3 py-1.5 flex items-center gap-1.5 mt-1">
                        <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">LOCAL</span>
                      </div>
                      <button
                        onClick={() => handleAutoGenerate('local')}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                      >
                        <Cpu className="w-4 h-4 text-emerald-500" />
                        <div className="flex-1">
                          <div className="font-medium">Local LLM</div>
                          <div className="text-xs text-muted-foreground">LM Studio (port 1234)</div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">FREE</span>
                      </button>
                      
                      {/* === API SECTION === */}
                      <div className="my-1 mx-2 border-t" />
                      <div className="px-3 py-1.5 flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">API (Direct)</span>
                      </div>
                      <button
                        onClick={() => handleAutoGenerate('openai')}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                      >
                        <Cloud className="w-4 h-4 text-blue-500" />
                        <div className="flex-1">
                          <div className="font-medium">ChatGPT</div>
                          <div className="text-xs text-muted-foreground">GPT-4o-mini (OpenAI)</div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">PAID</span>
                      </button>
                      
                      {/* === FREE MODELS SECTION === */}
                      <div className="my-1 mx-2 border-t" />
                      <div className="px-3 py-1.5 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs font-semibold text-green-600 dark:text-green-400">FREE (Rate Limited)</span>
                      </div>
                      {OPENROUTER_MODELS.filter(m => m.provider === 'free').map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleAutoGenerate('openrouter', model.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                        >
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-green-500 bg-green-500/10">
                            ✓
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{model.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{model.description}</div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">$0</span>
                        </button>
                      ))}
                      
                      {/* === OPENROUTER PAID SECTION === */}
                      <div className="my-1 mx-2 border-t" />
                      <div className="px-3 py-1.5 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-violet-500" />
                        <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">OpenRouter (Paid)</span>
                      </div>
                      {OPENROUTER_MODELS.filter(m => m.provider !== 'free').map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleAutoGenerate('openrouter', model.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                        >
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${getProviderColor(model.provider)} bg-current/10`}>
                            {model.provider.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{model.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{model.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {/* Ask AI button - only show if potentially unused */}
          {isUnused && (
            <button
              onClick={handleAskAI}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask AI
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground font-mono truncate flex-1">
            {getFilePath()}
          </p>
          {isUnused && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Potentially unused
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {item.type === 'page' && (
          <PageStructure 
            page={item.item} 
            allPages={allPages}
            allComponents={allComponents}
            onNavigateToPage={onNavigateToPage}
            onNavigateToComponent={onNavigateToComponent}
          />
        )}
        {item.type === 'component' && (
          <ComponentStructure 
            component={item.item}
            allPages={allPages}
            allComponents={allComponents}
            onNavigateToPage={onNavigateToPage}
            onNavigateToComponent={onNavigateToComponent}
          />
        )}
        {item.type === 'hook' && (
          <HookStructure
            hook={item.item}
            allComponents={allComponents}
            allHooks={allHooks}
            onNavigateToComponent={onNavigateToComponent}
            onNavigateToHook={onNavigateToHook}
          />
        )}
        {item.type === 'context' && (
          <ContextStructure
            context={item.item}
            allComponents={allComponents}
            onNavigateToComponent={onNavigateToComponent}
          />
        )}
        {item.type === 'utility' && (
          <UtilityStructure
            utility={item.item}
            allComponents={allComponents}
            onNavigateToComponent={onNavigateToComponent}
          />
        )}
      </div>
    </div>
  );
}

// ==================== PAGE STRUCTURE ====================
interface PageStructureProps {
  page: PageInfo;
  allPages: PageInfo[];
  allComponents: ComponentInfo[];
  onNavigateToPage: (page: PageInfo) => void;
  onNavigateToComponent: (component: ComponentInfo) => void;
}

function PageStructure({ page, allPages, allComponents, onNavigateToPage, onNavigateToComponent }: PageStructureProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['components', 'links', 'data'])
  );

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  const usedComponents = page.components
    .map(name => allComponents.find(c => c.name === name || c.name.toLowerCase() === name.toLowerCase()))
    .filter((c): c is ComponentInfo => c !== undefined);

  const linkedPages = page.linksTo
    .map(route => allPages.find(p => p.route === route))
    .filter((p): p is PageInfo => p !== undefined);

  return (
    <>
      <Section
        title="Components Used"
        icon={<Layers className="w-4 h-4" />}
        count={usedComponents.length}
        expanded={expandedSections.has('components')}
        onToggle={() => toggleSection('components')}
      >
        {usedComponents.length > 0 ? (
          <div className="space-y-1">
            {usedComponents.map((comp) => (
              <button
                key={comp.filePath}
                onClick={() => onNavigateToComponent(comp)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group"
              >
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="flex-1 text-left">{comp.name}</span>
                {comp.isClientComponent ? (
                  <Monitor className="w-3 h-3 text-blue-500" />
                ) : (
                  <Server className="w-3 h-3 text-green-500" />
                )}
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No imported components detected</p>
        )}
      </Section>

      <Section
        title="Links To"
        icon={<Link2 className="w-4 h-4" />}
        count={page.linksTo.length}
        expanded={expandedSections.has('links')}
        onToggle={() => toggleSection('links')}
      >
        {page.linksTo.length > 0 ? (
          <div className="space-y-1">
            {page.linksTo.map((route, idx) => {
              const linkedPage = linkedPages.find(p => p.route === route);
              return (
                <button
                  key={`${route}-${idx}`}
                  onClick={() => linkedPage && onNavigateToPage(linkedPage)}
                  disabled={!linkedPage}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="flex-1 text-left font-mono text-xs">{route}</span>
                  {linkedPage ? (
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No links detected</p>
        )}
      </Section>

      <Section
        title="Data Dependencies"
        icon={<Database className="w-4 h-4" />}
        count={page.dataDependencies.length}
        expanded={expandedSections.has('data')}
        onToggle={() => toggleSection('data')}
        highlight={page.dataDependencies.length > 0}
      >
        {page.dataDependencies.length > 0 ? (
          <DataDependenciesList dependencies={page.dataDependencies} />
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No data dependencies detected</p>
        )}
      </Section>
    </>
  );
}

// ==================== COMPONENT STRUCTURE ====================
interface ComponentStructureProps {
  component: ComponentInfo;
  allPages: PageInfo[];
  allComponents: ComponentInfo[];
  onNavigateToPage: (page: PageInfo) => void;
  onNavigateToComponent: (component: ComponentInfo) => void;
}

function ComponentStructure({ component, allPages, allComponents, onNavigateToPage, onNavigateToComponent }: ComponentStructureProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['props', 'usedIn', 'uses', 'data'])
  );

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  const usedInPages = component.usedInPages
    .map(route => allPages.find(p => p.route === route))
    .filter((p): p is PageInfo => p !== undefined);

  const usedInComponents = component.usedInComponents
    .map(name => allComponents.find(c => c.name === name))
    .filter((c): c is ComponentInfo => c !== undefined);

  const usesComponents = component.imports
    .map(name => allComponents.find(c => c.name === name || c.name.toLowerCase() === name.toLowerCase()))
    .filter((c): c is ComponentInfo => c !== undefined);

  return (
    <>
      <Section
        title="Props"
        icon={<Code className="w-4 h-4" />}
        count={component.props.length}
        expanded={expandedSections.has('props')}
        onToggle={() => toggleSection('props')}
      >
        {component.props.length > 0 ? (
          <div className="space-y-1">
            {component.props.map((prop) => (
              <div key={prop.name} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
                <span className="font-mono text-sm">{prop.name}</span>
                {!prop.required && <span className="text-xs text-muted-foreground">optional</span>}
                <span className="flex-1" />
                <span className="text-xs font-mono text-muted-foreground">{prop.type}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No props detected</p>
        )}
      </Section>

      <Section
        title="Used In"
        icon={<FileText className="w-4 h-4" />}
        count={usedInPages.length + usedInComponents.length}
        expanded={expandedSections.has('usedIn')}
        onToggle={() => toggleSection('usedIn')}
      >
        {usedInPages.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-muted-foreground px-3 mb-1">Pages</p>
            <div className="space-y-1">
              {usedInPages.map((page) => (
                <button
                  key={page.filePath}
                  onClick={() => onNavigateToPage(page)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group"
                >
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="flex-1 text-left font-mono text-xs">{page.route || '/'}</span>
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}
        {usedInComponents.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground px-3 mb-1">Components</p>
            <div className="space-y-1">
              {usedInComponents.map((comp) => (
                <button
                  key={comp.filePath}
                  onClick={() => onNavigateToComponent(comp)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group"
                >
                  <Layers className="w-4 h-4 text-purple-500" />
                  <span className="flex-1 text-left">{comp.name}</span>
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}
        {usedInPages.length === 0 && usedInComponents.length === 0 && (
          <p className="text-sm text-muted-foreground px-3 py-2">Not used anywhere</p>
        )}
      </Section>

      <Section
        title="Uses"
        icon={<Layers className="w-4 h-4" />}
        count={usesComponents.length}
        expanded={expandedSections.has('uses')}
        onToggle={() => toggleSection('uses')}
      >
        {usesComponents.length > 0 ? (
          <div className="space-y-1">
            {usesComponents.map((comp) => (
              <button
                key={comp.filePath}
                onClick={() => onNavigateToComponent(comp)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group"
              >
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="flex-1 text-left">{comp.name}</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No component imports detected</p>
        )}
      </Section>

      <Section
        title="Data Dependencies"
        icon={<Database className="w-4 h-4" />}
        count={component.dataDependencies.length}
        expanded={expandedSections.has('data')}
        onToggle={() => toggleSection('data')}
        highlight={component.dataDependencies.length > 0}
      >
        {component.dataDependencies.length > 0 ? (
          <DataDependenciesList dependencies={component.dataDependencies} />
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No data dependencies detected</p>
        )}
      </Section>
    </>
  );
}

// ==================== HOOK STRUCTURE ====================
interface HookStructureProps {
  hook: HookInfo;
  allComponents: ComponentInfo[];
  allHooks: HookInfo[];
  onNavigateToComponent: (component: ComponentInfo) => void;
  onNavigateToHook: (hook: HookInfo) => void;
}

function HookStructure({ hook, allComponents, allHooks, onNavigateToComponent, onNavigateToHook }: HookStructureProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['usedIn', 'dependencies'])
  );

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  // Find components that use this hook
  const usedInComponents = hook.usedIn
    .map(name => allComponents.find(c => c.name === name))
    .filter((c): c is ComponentInfo => c !== undefined);

  // Find hooks this hook uses
  const usesHooks = hook.dependencies
    .map(name => allHooks.find(h => h.name === name))
    .filter((h): h is HookInfo => h !== undefined);

  return (
    <>
      <Section
        title="Used In Components"
        icon={<Layers className="w-4 h-4" />}
        count={usedInComponents.length}
        expanded={expandedSections.has('usedIn')}
        onToggle={() => toggleSection('usedIn')}
      >
        {usedInComponents.length > 0 ? (
          <div className="space-y-1">
            {usedInComponents.map((comp) => (
              <button
                key={comp.filePath}
                onClick={() => onNavigateToComponent(comp)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group"
              >
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="flex-1 text-left">{comp.name}</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">Not used in any components</p>
        )}
      </Section>

      <Section
        title="Hook Dependencies"
        icon={<Anchor className="w-4 h-4" />}
        count={hook.dependencies.length}
        expanded={expandedSections.has('dependencies')}
        onToggle={() => toggleSection('dependencies')}
      >
        {hook.dependencies.length > 0 ? (
          <div className="space-y-1">
            {hook.dependencies.map((depName, idx) => {
              const depHook = usesHooks.find(h => h.name === depName);
              return (
                <button
                  key={idx}
                  onClick={() => depHook && onNavigateToHook(depHook)}
                  disabled={!depHook}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group disabled:opacity-50"
                >
                  <Anchor className="w-4 h-4 text-cyan-500" />
                  <span className="flex-1 text-left font-mono text-xs">{depName}</span>
                  {depHook ? (
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <span title="Built-in or external hook">
                      <Package className="w-3 h-3 text-muted-foreground" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No hook dependencies</p>
        )}
      </Section>
    </>
  );
}

// ==================== CONTEXT STRUCTURE ====================
interface ContextStructureProps {
  context: ContextInfo;
  allComponents: ComponentInfo[];
  onNavigateToComponent: (component: ComponentInfo) => void;
}

function ContextStructure({ context, allComponents, onNavigateToComponent }: ContextStructureProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['usedIn']));

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  const usedInComponents = context.usedIn
    .map(name => allComponents.find(c => c.name === name))
    .filter((c): c is ComponentInfo => c !== undefined);

  return (
    <>
      <div className="rounded-lg border border-orange-200 dark:border-orange-800 p-4 bg-orange-50 dark:bg-orange-900/20 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Share2 className="w-4 h-4 text-orange-600" />
          <span className="font-medium">Provider: {context.providerName}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          This context provides global state that can be consumed by child components.
        </p>
      </div>

      <Section
        title="Used In Components"
        icon={<Layers className="w-4 h-4" />}
        count={usedInComponents.length}
        expanded={expandedSections.has('usedIn')}
        onToggle={() => toggleSection('usedIn')}
      >
        {usedInComponents.length > 0 ? (
          <div className="space-y-1">
            {usedInComponents.map((comp) => (
              <button
                key={comp.filePath}
                onClick={() => onNavigateToComponent(comp)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group"
              >
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="flex-1 text-left">{comp.name}</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">Not consumed by any components</p>
        )}
      </Section>
    </>
  );
}

// ==================== UTILITY STRUCTURE ====================
interface UtilityStructureProps {
  utility: UtilityInfo;
  allComponents: ComponentInfo[];
  onNavigateToComponent: (component: ComponentInfo) => void;
}

function UtilityStructure({ utility, allComponents, onNavigateToComponent }: UtilityStructureProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['exports', 'usedIn']));

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  const usedInComponents = utility.usedIn
    .map(name => allComponents.find(c => c.name === name))
    .filter((c): c is ComponentInfo => c !== undefined);

  return (
    <>
      <Section
        title="Exports"
        icon={<Code className="w-4 h-4" />}
        count={utility.exports.length}
        expanded={expandedSections.has('exports')}
        onToggle={() => toggleSection('exports')}
      >
        {utility.exports.length > 0 ? (
          <div className="space-y-1">
            {utility.exports.map((exp, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
                <Code className="w-4 h-4 text-slate-500" />
                <span className="font-mono text-sm">{exp}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">No exports detected</p>
        )}
      </Section>

      <Section
        title="Used In Components"
        icon={<Layers className="w-4 h-4" />}
        count={usedInComponents.length}
        expanded={expandedSections.has('usedIn')}
        onToggle={() => toggleSection('usedIn')}
      >
        {usedInComponents.length > 0 ? (
          <div className="space-y-1">
            {usedInComponents.map((comp) => (
              <button
                key={comp.filePath}
                onClick={() => onNavigateToComponent(comp)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors group"
              >
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="flex-1 text-left">{comp.name}</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-3 py-2">Not used in any components</p>
        )}
      </Section>
    </>
  );
}

// ==================== SHARED COMPONENTS ====================
interface DataDependency {
  type: string;
  source: string;
  line: number;
}

function DataDependenciesList({ dependencies }: { dependencies: DataDependency[] }) {
  return (
    <div className="space-y-2">
      {dependencies.map((dep, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
        >
          <Code className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 font-medium">
                {dep.type}
              </span>
              <span className="text-xs text-muted-foreground">Line {dep.line}</span>
            </div>
            <p className="text-sm font-mono mt-1 truncate">{dep.source}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  highlight?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon, count, expanded, onToggle, highlight, children }: SectionProps) {
  return (
    <div className={`rounded-lg border ${highlight ? 'border-amber-200 dark:border-amber-800' : 'border-border'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className={highlight ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
          {icon}
        </span>
        <span className="font-medium">{title}</span>
        <span className={`ml-auto text-sm px-2 py-0.5 rounded-full ${
          highlight 
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
            : 'bg-muted text-muted-foreground'
        }`}>
          {count}
        </span>
      </button>
      {expanded && (
        <div className="px-2 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

