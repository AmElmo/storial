import { useState, useEffect } from 'react';
import type { 
  PageInfo, 
  ComponentInfo, 
  StoriesFile, 
  StoryDefinition, 
  PreviewStatus
} from '@/lib/api';
import { 
  getFileContent, 
  getStories, 
  setupPreview, 
  getPreviewStatus
} from '@/lib/api';
import { 
  Layers,
  FileCode,
  Database,
  Eye,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  BookOpen,
  ChevronDown,
  Play,
  Settings,
  RefreshCw,
  Zap,
  X
} from 'lucide-react';

// Logging
const log = {
  preview: (msg: string, data?: any) => {
    console.debug(`%c[PREVIEW]%c ${msg}`, 'color: #f97316; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  }
};

interface PreviewPaneProps {
  item: { type: 'page'; item: PageInfo } | { type: 'component'; item: ComponentInfo };
  projectPath: string;
}

type TabType = 'structure' | 'preview' | 'source';

export function PreviewPane({ item }: PreviewPaneProps) {
  const [activeTab, setActiveTab] = useState<TabType>('structure');
  const [sourceCode, setSourceCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [devServerPort, setDevServerPort] = useState('5173');
  const [showIframe, setShowIframe] = useState(false);

  const filePath = item.type === 'page' ? item.item.filePath : item.item.filePath;
  const hasDataDeps = item.type === 'page' 
    ? item.item.dataDependencies.length > 0 
    : item.item.dataDependencies.length > 0;

  log.preview('Render', { 
    type: item.type, 
    name: item.type === 'page' ? item.item.route : item.item.name,
    activeTab,
    hasDataDeps
  });

  // Load source code when tab changes or item changes
  useEffect(() => {
    if (activeTab === 'source') {
      log.preview('Loading source code for:', filePath);
      loadSourceCode();
    }
  }, [activeTab, filePath]);

  const loadSourceCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const content = await getFileContent(filePath);
      log.preview('Source code loaded', { length: content.length });
      setSourceCode(content);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load source';
      log.preview('Source code load failed', { error: errorMsg });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    log.preview('Copying source to clipboard');
    await navigator.clipboard.writeText(sourceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTabChange = (tab: TabType) => {
    log.preview('Tab changed', { from: activeTab, to: tab });
    setActiveTab(tab);
  };

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Tabs */}
      <div className="flex border-b">
        <TabButton
          active={activeTab === 'structure'}
          onClick={() => handleTabChange('structure')}
          icon={<Layers className="w-4 h-4" />}
          label="Structure"
        />
        <TabButton
          active={activeTab === 'preview'}
          onClick={() => handleTabChange('preview')}
          icon={<Eye className="w-4 h-4" />}
          label="Preview"
          badge={hasDataDeps ? (
            <Database className="w-3 h-3 text-amber-500" />
          ) : undefined}
        />
        <TabButton
          active={activeTab === 'source'}
          onClick={() => handleTabChange('source')}
          icon={<FileCode className="w-4 h-4" />}
          label="Source"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'structure' && (
          <StructureTab item={item} />
        )}
        
        {activeTab === 'preview' && (
          <PreviewTab 
            item={item}
            devServerPort={devServerPort}
            onDevServerPortChange={setDevServerPort}
            showIframe={showIframe}
            onShowIframe={setShowIframe}
          />
        )}

        {activeTab === 'source' && (
          <div className="relative">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 p-4 text-red-500">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            ) : (
              <>
                <button
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <pre className="p-4 text-xs font-mono overflow-auto">
                  <code>{sourceCode}</code>
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}

function TabButton({ active, onClick, icon, label, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? 'text-foreground border-b-2 border-primary bg-muted/50'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      {badge}
    </button>
  );
}

interface StructureTabProps {
  item: { type: 'page'; item: PageInfo } | { type: 'component'; item: ComponentInfo };
}

function StructureTab({ item }: StructureTabProps) {
  log.preview('StructureTab render', { type: item.type });

  if (item.type === 'page') {
    const page = item.item;
    return (
      <div className="p-4 space-y-4">
        <InfoRow label="Route" value={page.route || '/'} mono />
        <InfoRow label="File" value={page.fileName} mono />
        {page.componentName && <InfoRow label="Component" value={page.componentName} />}
        
        {/* Components used */}
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Components ({page.components.length})</div>
          {page.components.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {page.components.map((comp, i) => (
                <span key={i} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded-md font-mono">
                  {comp}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No components detected</div>
          )}
        </div>
        
        {/* Links */}
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Links to ({page.linksTo.length})</div>
          {page.linksTo.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {page.linksTo.map((link, i) => (
                <span key={i} className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded-md font-mono">
                  {link}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No links detected</div>
          )}
        </div>

        {/* Data Dependencies */}
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            Data Dependencies ({page.dataDependencies.length})
            {page.dataDependencies.length > 0 && <Database className="w-3 h-3 text-amber-500" />}
          </div>
          {page.dataDependencies.length > 0 ? (
            <div className="space-y-1">
              {page.dataDependencies.map((dep, i) => (
                <div key={i} className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs rounded-md font-mono flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-amber-200 dark:bg-amber-800 rounded text-[10px] uppercase">{dep.type}</span>
                  <span className="truncate">{dep.source}</span>
                  <span className="text-muted-foreground">L{dep.line}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No data dependencies detected</div>
          )}
        </div>
        
        {page.isLayout && (
          <div className="px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm">
            This is a <strong>Layout</strong> file
          </div>
        )}
        {page.isLoading && (
          <div className="px-3 py-2 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm">
            This is a <strong>Loading</strong> state
          </div>
        )}
        {page.isError && (
          <div className="px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm">
            This is an <strong>Error</strong> boundary
          </div>
        )}
      </div>
    );
  }

  const component = item.item;
  return (
    <div className="p-4 space-y-4">
      <InfoRow label="Name" value={component.name} />
      <InfoRow label="File" value={component.fileName} mono />
      <InfoRow 
        label="Type" 
        value={component.isClientComponent ? 'Client Component' : 'Server Component'}
        highlight={component.isClientComponent}
      />
      
      {/* Props */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Props ({component.props.length})</div>
        {component.props.length > 0 ? (
          <div className="space-y-1">
            {component.props.map((prop, i) => (
              <div key={i} className="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs rounded-md font-mono flex items-center gap-2">
                <span>{prop.name}</span>
                <span className="text-muted-foreground">: {prop.type}</span>
                {prop.required && <span className="text-red-500">*</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No props detected</div>
        )}
      </div>
      
      {/* Imports */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Imports ({component.imports.length})</div>
        {component.imports.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {component.imports.slice(0, 10).map((imp, i) => (
              <span key={i} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs rounded-md font-mono">
                {imp}
              </span>
            ))}
            {component.imports.length > 10 && (
              <span className="px-2 py-1 text-xs text-muted-foreground">
                +{component.imports.length - 10} more
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No imports detected</div>
        )}
      </div>
      
      {/* Used in pages */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Used in Pages ({component.usedInPages.length})</div>
        {component.usedInPages.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {component.usedInPages.map((page, i) => (
              <span key={i} className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded-md font-mono">
                {page}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">Not used in any pages</div>
        )}
      </div>
      
      {/* Used in components */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Used in Components ({component.usedInComponents.length})</div>
        {component.usedInComponents.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {component.usedInComponents.map((comp, i) => (
              <span key={i} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded-md font-mono">
                {comp}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">Not used in any components</div>
        )}
      </div>
      
      {/* Data Dependencies */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          Data Dependencies ({component.dataDependencies.length})
          {component.dataDependencies.length > 0 && <Database className="w-3 h-3 text-amber-500" />}
        </div>
        {component.dataDependencies.length > 0 ? (
          <div className="space-y-1">
            {component.dataDependencies.map((dep, i) => (
              <div key={i} className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs rounded-md font-mono flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-amber-200 dark:bg-amber-800 rounded text-[10px] uppercase">{dep.type}</span>
                <span className="truncate">{dep.source}</span>
                <span className="text-muted-foreground">L{dep.line}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No data dependencies detected</div>
        )}
      </div>

      {/* Server Actions */}
      {component.serverActions && component.serverActions.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            Server Actions ({component.serverActions.length})
            <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-[10px] uppercase">
              Not Mockable
            </span>
          </div>
          <div className="space-y-1">
            {component.serverActions.map((action, i) => (
              <div key={i} className="px-2 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs rounded-md font-mono flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-orange-200 dark:bg-orange-800 rounded text-[10px] uppercase">action</span>
                <span className="font-semibold">{action.functionName}</span>
                <span className="text-muted-foreground text-[10px]">from {action.importPath}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
            ⚠️ Server Actions cannot be mocked - preview will call your real backend.
          </div>
        </div>
      )}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}

function InfoRow({ label, value, mono, highlight }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''} ${highlight ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
        {value}
      </span>
    </div>
  );
}

interface PreviewTabProps {
  item: { type: 'page'; item: PageInfo } | { type: 'component'; item: ComponentInfo };
  devServerPort: string;
  onDevServerPortChange: (port: string) => void;
  showIframe: boolean;
  onShowIframe: (show: boolean) => void;
}

function PreviewTab({ 
  item, 
  devServerPort,
  onDevServerPortChange,
  showIframe,
  onShowIframe
}: PreviewTabProps) {
  const [storiesFile, setStoriesFile] = useState<StoriesFile | null>(null);
  const [selectedStory, setSelectedStory] = useState<StoryDefinition | null>(null);
  const [loadingStories, setLoadingStories] = useState(false);
  const [showStoryDropdown, setShowStoryDropdown] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus | null>(null);
  const [settingUpPreview, setSettingUpPreview] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  
  // Setup modal state
  const [showSetupModal, setShowSetupModal] = useState(false);

  const itemName = item.type === 'component' 
    ? item.item.name 
    : item.item.fileName.replace(/\.(tsx?|jsx?)$/, '');
    
  // Check if component has server actions
  const hasServerActions = item.type === 'component' && 
    item.item.serverActions && 
    item.item.serverActions.length > 0;

  // Load stories and preview status when item changes
  useEffect(() => {
    const loadData = async () => {
      setLoadingStories(true);
      try {
        // Load stories
        const stories = await getStories(item.type, itemName);
        log.preview('Loaded stories', { found: !!stories, count: stories?.stories.length });
        setStoriesFile(stories);
        if (stories?.stories.length) {
          setSelectedStory(stories.stories[0]);
        } else {
          setSelectedStory(null);
        }
        
        // Check preview status
        try {
          const status = await getPreviewStatus();
          setPreviewStatus(status);
          log.preview('Preview status', status);
        } catch {
          setPreviewStatus(null);
        }
        
      } catch (error) {
        log.preview('Failed to load stories', error);
        setStoriesFile(null);
        setSelectedStory(null);
      } finally {
        setLoadingStories(false);
      }
    };
    loadData();
  }, [item.type, itemName]);


  const handleSetupPreview = async () => {
    // Show confirmation modal for server actions warning
    if (hasServerActions) {
      setShowSetupModal(true);
      return;
    }
    
    // Otherwise, just setup preview normally
    await doSetupPreview();
  };
  
  const doSetupPreview = async () => {
    setSettingUpPreview(true);
    setSetupError(null);
    setShowSetupModal(false);
    
    try {
      const result = await setupPreview();
      if (result.success) {
        setPreviewStatus({
          isSetup: true,
          previewFileExists: true,
          routeExists: true,
          previewFilePath: result.filesCreated[0] || null
        });
        log.preview('Preview setup successful', result);
      } else {
        setSetupError(result.message);
      }
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Failed to setup preview');
    } finally {
      setSettingUpPreview(false);
    }
  };

  log.preview('PreviewTab render', { 
    type: item.type, 
    hasStories: !!storiesFile, 
    previewSetup: previewStatus?.isSetup,
    hasServerActions
  });

  // Build the preview URL with component/page name and story ID
  const buildPreviewUrl = (storyId?: string, usePreviewRoute: boolean = true) => {
    // For pages WITHOUT stories, show the actual route
    if (item.type === 'page' && !usePreviewRoute) {
      return `http://localhost:${devServerPort}${item.item.route}`;
    }
    
    // For components OR pages WITH stories, use the preview route with query params
    const params = new URLSearchParams();
    if (item.type === 'page') {
      // Pages use ?page=Name
      params.set('page', item.item.fileName.replace(/\.(tsx?|jsx?)$/, ''));
    } else {
      // Components use ?component=Name
      params.set('component', item.item.name);
    }
    if (storyId) params.set('story', storyId);
    return `http://localhost:${devServerPort}/storial-preview?${params.toString()}`;
  };

  // ==================== SETUP MODAL FOR SERVER ACTIONS ====================
  const SetupConfirmationModal = () => {
    if (!showSetupModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Settings className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Preview Setup</h2>
                  <p className="text-sm text-muted-foreground">Configure preview with mock data</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSetupModal(false)}
                className="p-1 hover:bg-muted rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Changes List */}
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4 bg-muted/30">
                <div className="text-sm font-medium mb-2">We'll make the following changes:</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Create: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">src/__Canvas.tsx</code> (preview component)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Modify: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">src/App.tsx</code> (add preview route)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Create: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">.explorer/</code> folder (stories & mocks)</span>
                  </div>
                </div>
              </div>
              
              {/* Server Actions Warning */}
              {hasServerActions && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 p-4 bg-orange-50 dark:bg-orange-900/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-300">Server Actions Detected</span>
                  </div>
                  <p className="text-sm text-orange-600 dark:text-orange-400">
                    This component uses Server Actions which cannot be mocked. 
                    The preview will call your real backend, so it may show errors 
                    if your backend is not running or properly configured.
                  </p>
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowSetupModal(false)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doSetupPreview()}
                disabled={settingUpPreview}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {settingUpPreview ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4" />
                )}
                Setup Preview
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==================== STORIES FOUND - SHOW PREVIEW WITH STORY SELECTOR ====================
  if (storiesFile && storiesFile.stories.length > 0) {
    const previewUrl = buildPreviewUrl(selectedStory?.id);

    return (
      <div className="p-4 space-y-4">
        {/* Setup Confirmation Modal */}
        <SetupConfirmationModal />
        
        {/* Stories Found Banner */}
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-3 bg-emerald-50 dark:bg-emerald-900/20">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {storiesFile.stories.length} {storiesFile.stories.length === 1 ? 'story' : 'stories'} available
            </span>
            {hasServerActions && (
              <span className="ml-2 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Has Server Actions
              </span>
            )}
          </div>
        </div>

        {/* Preview Setup Status - Required for both components AND pages with stories */}
        {!previewStatus?.isSetup && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-4 bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <Settings className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-amber-800 dark:text-amber-200">Preview Route Required</div>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  To preview {item.type === 'page' ? 'pages' : 'components'} with stories (including API mocking), 
                  we need to add a preview route to your project.
                  {hasServerActions && (
                    <span className="block mt-1 text-orange-600 dark:text-orange-400">
                      <Zap className="w-3 h-3 inline mr-1" />
                      This component uses Server Actions which will call your real backend during preview.
                    </span>
                  )}
                </p>
                <button
                  onClick={handleSetupPreview}
                  disabled={settingUpPreview}
                  className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {settingUpPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Settings className="w-4 h-4" />
                  )}
                  Setup Preview Route
                </button>
                {setupError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{setupError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview Setup Success */}
        {previewStatus?.isSetup && (
          <div className="rounded-lg border border-green-200 dark:border-green-800 p-3 bg-green-50 dark:bg-green-900/20">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                Preview route ready
              </span>
            </div>
            {/* Server Actions warning */}
            {hasServerActions && (
              <div className="mt-2 p-2 rounded bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-orange-500 mt-0.5" />
                  <div className="text-xs text-orange-600 dark:text-orange-400">
                    <span className="font-medium">Note:</span> Server actions will call your real backend during preview.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Story Selector */}
        <div className="rounded-lg border border-border p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Play className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Story Preview</span>
          </div>

          <div className="space-y-4">
            {/* Story Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowStoryDropdown(!showStoryDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-background hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium">{selectedStory?.name || 'Select a story'}</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${showStoryDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showStoryDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg z-10 max-h-60 overflow-auto">
                  {storiesFile.stories.map((story) => (
                    <button
                      key={story.id}
                      onClick={() => {
                        setSelectedStory(story);
                        setShowStoryDropdown(false);
                        // Refresh iframe if visible
                        if (showIframe) {
                          onShowIframe(false);
                          setTimeout(() => onShowIframe(true), 50);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                        selectedStory?.id === story.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="font-medium">{story.name}</div>
                      {story.description && (
                        <div className="text-xs text-muted-foreground truncate">{story.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Story Details */}
            {selectedStory && (
              <div className="space-y-2">
                {selectedStory.description && (
                  <p className="text-sm text-muted-foreground">{selectedStory.description}</p>
                )}
                
                {/* Props Preview */}
                {selectedStory.props && Object.keys(selectedStory.props).length > 0 && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Props:</div>
                    <div className="bg-muted/50 rounded p-2 font-mono">
                      {Object.entries(selectedStory.props).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-purple-600 dark:text-purple-400">{key}:</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Mock API Preview */}
                {selectedStory.mockApi && Object.keys(selectedStory.mockApi).length > 0 && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Mocked APIs:</div>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(selectedStory.mockApi).map((endpoint, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-mono">
                          {endpoint}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Server Actions Warning */}
                {hasServerActions && (
                  <div className="text-xs p-2 rounded bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                      <Zap className="w-3 h-3" />
                      <span className="font-medium">Uses Server Actions</span>
                    </div>
                    <p className="mt-1 text-orange-500 dark:text-orange-400/80">
                      Server actions will call your real backend (not mocked).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dev Server Port */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Dev server port:</label>
              <input
                type="text"
                value={devServerPort}
                onChange={(e) => onDevServerPortChange(e.target.value)}
                className="w-20 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>

            {/* Preview Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onShowIframe(!showIframe)}
                disabled={!previewStatus?.isSetup}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye className="w-4 h-4" />
                {showIframe ? 'Hide Preview' : 'Show Preview'}
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-muted text-foreground rounded-md text-sm hover:bg-muted/80 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Browser
              </a>
              {showIframe && (
                <button
                  onClick={() => {
                    onShowIframe(false);
                    setTimeout(() => onShowIframe(true), 50);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-muted text-foreground rounded-md text-sm hover:bg-muted/80 transition-colors"
                  title="Refresh preview"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Iframe Preview */}
            {showIframe && previewStatus?.isSetup && (
              <div className="rounded-md border border-border overflow-hidden bg-white">
                <div className="bg-muted/50 px-3 py-1.5 border-b flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono truncate">{previewUrl}</span>
                </div>
                <iframe
                  src={previewUrl}
                  className="w-full h-[400px]"
                  title={`Preview: ${itemName}`}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== PAGE PREVIEW (No Stories) ====================
  if (item.type === 'page') {
    const pageUrl = `http://localhost:${devServerPort}${item.item.route}`;
    
    return (
      <div className="p-4 space-y-4">
        <div className="rounded-lg border border-border p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Page Preview</span>
            {loadingStories && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Dev server port:</label>
              <input
                type="text"
                value={devServerPort}
                onChange={(e) => onDevServerPortChange(e.target.value)}
                className="w-20 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>

            <div className="text-sm text-muted-foreground">
              Make sure your dev server is running with <code className="px-1.5 py-0.5 bg-muted rounded text-xs">npm run dev</code>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onShowIframe(!showIframe)}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Eye className="w-4 h-4" />
                {showIframe ? 'Hide Preview' : 'Show Preview'}
              </button>
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-muted text-foreground rounded-md text-sm hover:bg-muted/80 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Browser
              </a>
            </div>

            {/* No Stories Hint */}
            {!loadingStories && !storiesFile && item.item.dataDependencies.length > 0 && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-amber-700 dark:text-amber-300">This page has data dependencies</div>
                    <div className="text-amber-600 dark:text-amber-400">
                      Use <strong>Generate Stories</strong> to create mock data for previewing different states.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showIframe && (
              <div className="rounded-md border border-border overflow-hidden bg-white">
                <iframe
                  src={pageUrl}
                  className="w-full h-[400px]"
                  title={`Preview: ${item.item.route}`}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== COMPONENT PREVIEW (No Stories - Coming Soon) ====================
  return (
    <div className="p-4">
      {loadingStories ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-purple-200 dark:border-purple-800 p-6 bg-purple-50 dark:bg-purple-900/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
              <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-purple-800 dark:text-purple-200">
                No Stories Found
              </h3>
              <p className="text-sm text-purple-600 dark:text-purple-400">
                Generate stories to preview this component
              </p>
            </div>
          </div>
          
          <div className="space-y-3 text-sm text-purple-700 dark:text-purple-300">
            <p>
              Click <strong>Generate Stories</strong> in the header to create preview stories for this component.
            </p>
            <p>
              The AI will analyze the component and generate:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Default state</strong> - Normal view with typical data</li>
              <li><strong>Loading state</strong> - While data is being fetched</li>
              <li><strong>Error state</strong> - When something goes wrong</li>
              <li><strong>Variants</strong> - Different prop combinations</li>
            </ul>
          </div>

          <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 text-xs text-purple-500 dark:text-purple-400">
              <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 rounded">1. Generate Stories</span>
              <span>→</span>
              <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/40 rounded">2. AI Creates File</span>
              <span>→</span>
              <span className="px-2 py-1 bg-purple-300 dark:bg-purple-700/40 rounded">3. Preview Here</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
