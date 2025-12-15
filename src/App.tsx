import { useState, useEffect, useCallback } from 'react';
import { Sidebar, type ViewMode, type SelectedItem, getUnusedCount } from './components/Sidebar';
import { StructureView } from './components/StructureView';
import { PreviewPane } from './components/PreviewPane';
import { ProjectSelector } from './components/ProjectSelector';
import { ScanOverview, type ScanOverviewData } from './components/ScanOverview';
import { 
  scanProject, 
  getProjectInfo, 
  getScanOverview,
  type ScanResult, 
  type ScanResultWithCache,
  type PageInfo, 
  type ComponentInfo,
  type HookInfo,
  type ContextInfo,
  type UtilityInfo
} from './lib/api';
import { Layers, LayoutGrid, FolderOpen, Anchor, Share2, Wrench, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';

// Client-side logging
const log = {
  ui: (msg: string, data?: any) => {
    console.debug(`%c[UI]%c ${msg}`, 'color: #3b82f6; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  },
  action: (msg: string, data?: any) => {
    console.debug(`%c[ACTION]%c ${msg}`, 'color: #f59e0b; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  },
  state: (msg: string, data?: any) => {
    console.debug(`%c[STATE]%c ${msg}`, 'color: #10b981; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  }
};

// URL helpers for navigation history
function updateURL(type: string | null, name: string | null, view: ViewMode) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (name) params.set('name', name);
  params.set('view', view);
  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({ type, name, view }, '', newURL);
  log.action('URL updated', { type, name, view });
}

function getURLParams(): { type: string | null; name: string | null; view: ViewMode } {
  const params = new URLSearchParams(window.location.search);
  return {
    type: params.get('type'),
    name: params.get('name'),
    view: (params.get('view') as ViewMode) || 'pages'
  };
}

export default function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResultWithCache | null>(null);
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('pages');
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [overviewData, setOverviewData] = useState<ScanOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  log.ui('App render', { 
    projectPath, 
    hasScanResult: !!scanResult, 
    loading, 
    error,
    viewMode,
    selectedItem: selectedItem ? selectedItem.type : null,
    showOverview
  });

  // Find item by type and name from scan result
  const findItem = useCallback((type: string | null, name: string | null, result: ScanResult): SelectedItem => {
    if (!type || !name) return null;
    
    switch (type) {
      case 'page': {
        const page = result.pages.find(p => p.route === name || p.fileName === name);
        return page ? { type: 'page', item: page } : null;
      }
      case 'component': {
        const component = result.components.find(c => c.name === name);
        return component ? { type: 'component', item: component } : null;
      }
      case 'hook': {
        const hook = result.hooks?.find(h => h.name === name);
        return hook ? { type: 'hook', item: hook } : null;
      }
      case 'context': {
        const context = result.contexts?.find(c => c.name === name);
        return context ? { type: 'context', item: context } : null;
      }
      case 'utility': {
        const utility = result.utilities?.find(u => u.name === name);
        return utility ? { type: 'utility', item: utility } : null;
      }
      default:
        return null;
    }
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      log.action('Browser navigation (popstate)', event.state);
      
      if (event.state && scanResult) {
        const { type, name, view } = event.state;
        setViewMode(view || 'pages');
        const item = findItem(type, name, scanResult);
        setSelectedItem(item);
      } else {
        // No state, try to read from URL
        const { type, name, view } = getURLParams();
        setViewMode(view);
        if (scanResult) {
          const item = findItem(type, name, scanResult);
          setSelectedItem(item);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [scanResult, findItem]);

  // Check for existing project on mount
  useEffect(() => {
    log.ui('App mounted, checking for existing project...');
    async function init() {
      const info = await getProjectInfo();
      if (info?.path) {
        log.ui('Found existing project', info);
        setProjectPath(info.path);
        handleScan(info.path);
      } else {
        log.ui('No existing project found');
      }
    }
    init();
  }, []);

  // Restore selection from URL after scan completes
  useEffect(() => {
    if (scanResult) {
      const { type, name, view } = getURLParams();
      if (type && name) {
        log.ui('Restoring selection from URL', { type, name, view });
        const item = findItem(type, name, scanResult);
        if (item) {
          setSelectedItem(item);
          setViewMode(view);
        }
      }
    }
  }, [scanResult, findItem]);

  const handleScan = async (path: string, forceRescan: boolean = false) => {
    log.action('Scanning project', { path, forceRescan });
    if (forceRescan) {
      setRescanning(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await scanProject(path, forceRescan);
      log.state('Scan result received', {
        pages: result.pages.length,
        components: result.components.length,
        hooks: result.hooks?.length || 0,
        contexts: result.contexts?.length || 0,
        utilities: result.utilities?.length || 0,
        routerType: result.routerType,
        fromCache: result.fromCache
      });
      setScanResult(result);
      setProjectPath(path);
      
      // If this was the first scan (not from cache), show overview
      if (!result.fromCache && !forceRescan) {
        handleShowOverview();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to scan project';
      log.state('Scan failed', { error: errorMsg });
      setError(errorMsg);
    } finally {
      setLoading(false);
      setRescanning(false);
    }
  };

  const handleRescan = () => {
    if (projectPath) {
      handleScan(projectPath, true);
    }
  };

  const handleShowOverview = async () => {
    log.action('Showing overview');
    setLoadingOverview(true);
    try {
      const data = await getScanOverview();
      if (data) {
        setOverviewData(data);
        setShowOverview(true);
      }
    } catch (err) {
      log.state('Failed to load overview', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const handleSelectPage = (page: PageInfo) => {
    log.action('Selected page', { route: page.route });
    setSelectedItem({ type: 'page', item: page });
    setShowOverview(false);
    updateURL('page', page.route, viewMode);
  };

  const handleSelectComponent = (component: ComponentInfo) => {
    log.action('Selected component', { name: component.name });
    setSelectedItem({ type: 'component', item: component });
    setShowOverview(false);
    updateURL('component', component.name, viewMode);
  };

  const handleSelectHook = (hook: HookInfo) => {
    log.action('Selected hook', { name: hook.name });
    setSelectedItem({ type: 'hook', item: hook });
    setShowOverview(false);
    updateURL('hook', hook.name, viewMode);
  };

  const handleSelectContext = (context: ContextInfo) => {
    log.action('Selected context', { name: context.name });
    setSelectedItem({ type: 'context', item: context });
    setShowOverview(false);
    updateURL('context', context.name, viewMode);
  };

  const handleSelectUtility = (utility: UtilityInfo) => {
    log.action('Selected utility', { name: utility.name });
    setSelectedItem({ type: 'utility', item: utility });
    setShowOverview(false);
    updateURL('utility', utility.name, viewMode);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    log.action('Changed view mode', { from: viewMode, to: mode });
    setViewMode(mode);
    // Update URL to reflect view mode change
    if (selectedItem) {
      const name = selectedItem.type === 'page' 
        ? selectedItem.item.route 
        : selectedItem.item.name;
      updateURL(selectedItem.type, name, mode);
    } else {
      updateURL(null, null, mode);
    }
  };

  // No project selected - show project selector
  if (!projectPath || !scanResult) {
    log.ui('Rendering ProjectSelector (no project)');
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
        <ProjectSelector 
          onSelect={handleScan} 
          loading={loading}
          error={error}
        />
      </div>
    );
  }

  // Counts for display
  const pageCount = scanResult.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError).length;
  const componentCount = scanResult.components.length;
  const hookCount = scanResult.hooks?.length || 0;
  const contextCount = scanResult.contexts?.length || 0;
  const utilityCount = scanResult.utilities?.length || 0;
  const unusedCount = getUnusedCount(
    scanResult.components,
    scanResult.hooks || [],
    scanResult.contexts || [],
    scanResult.utilities || []
  );

  log.ui('Rendering main app');
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Layers className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-xl font-semibold">React Explorer</h1>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen className="w-4 h-4" />
              <span className="font-mono">{scanResult.projectName}</span>
              <span className="px-1.5 py-0.5 rounded text-xs bg-muted">
                {scanResult.routerType === 'nextjs-app' ? 'Next.js App Router' : 
                 scanResult.routerType === 'nextjs-pages' ? 'Next.js Pages Router' : 
                 scanResult.routerType === 'react-router' ? 'React Router' : 'Unknown'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground flex items-center gap-3">
              <span>{pageCount} pages</span>
              <span>·</span>
              <span>{componentCount} components</span>
              {hookCount > 0 && <><span>·</span><span>{hookCount} hooks</span></>}
              {contextCount > 0 && <><span>·</span><span>{contextCount} contexts</span></>}
              {utilityCount > 0 && <><span>·</span><span>{utilityCount} utils</span></>}
            </div>
            {scanResult.fromCache && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Cached
              </span>
            )}
            <button
              onClick={handleShowOverview}
              disabled={loadingOverview}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              title="View scan overview"
            >
              <BarChart3 className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              title="Rescan project"
            >
              <RefreshCw className={`w-4 h-4 ${rescanning ? 'animate-spin' : ''}`} />
              {rescanning ? 'Scanning...' : 'Rescan'}
            </button>
            <button
              onClick={() => {
                log.action('Change project clicked');
                setProjectPath(null);
                setScanResult(null);
                setSelectedItem(null);
                setShowOverview(false);
                setOverviewData(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Change Project
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar with tabs */}
        <div className="w-80 border-r bg-card flex flex-col">
          {/* View mode tabs - Primary */}
          <div className="flex border-b">
            <TabButton
              active={viewMode === 'pages'}
              onClick={() => handleViewModeChange('pages')}
              icon={<LayoutGrid className="w-4 h-4" />}
              label="Pages"
              count={pageCount}
            />
            <TabButton
              active={viewMode === 'components'}
              onClick={() => handleViewModeChange('components')}
              icon={<Layers className="w-4 h-4" />}
              label="Components"
              count={componentCount}
            />
          </div>
          
          {/* Secondary tabs - Hooks, Contexts, Utilities, Health */}
          {(hookCount > 0 || contextCount > 0 || utilityCount > 0 || unusedCount > 0) && (
            <div className="flex border-b bg-muted/30">
              {hookCount > 0 && (
                <TabButton
                  active={viewMode === 'hooks'}
                  onClick={() => handleViewModeChange('hooks')}
                  icon={<Anchor className="w-3 h-3" />}
                  label="Hooks"
                  count={hookCount}
                  small
                />
              )}
              {contextCount > 0 && (
                <TabButton
                  active={viewMode === 'contexts'}
                  onClick={() => handleViewModeChange('contexts')}
                  icon={<Share2 className="w-3 h-3" />}
                  label="Contexts"
                  count={contextCount}
                  small
                />
              )}
              {utilityCount > 0 && (
                <TabButton
                  active={viewMode === 'utilities'}
                  onClick={() => handleViewModeChange('utilities')}
                  icon={<Wrench className="w-3 h-3" />}
                  label="Utils"
                  count={utilityCount}
                  small
                />
              )}
              <TabButton
                active={viewMode === 'health'}
                onClick={() => handleViewModeChange('health')}
                icon={<AlertTriangle className="w-3 h-3" />}
                label="Health"
                count={unusedCount}
                small
                highlight={unusedCount > 0}
              />
            </div>
          )}

          {/* List */}
          <Sidebar
            viewMode={viewMode}
            pages={scanResult.pages}
            components={scanResult.components}
            hooks={scanResult.hooks || []}
            contexts={scanResult.contexts || []}
            utilities={scanResult.utilities || []}
            selectedItem={selectedItem}
            onSelectPage={handleSelectPage}
            onSelectComponent={handleSelectComponent}
            onSelectHook={handleSelectHook}
            onSelectContext={handleSelectContext}
            onSelectUtility={handleSelectUtility}
          />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {showOverview && overviewData ? (
            <div className="flex-1 overflow-auto">
              <ScanOverview 
                data={overviewData} 
                onClose={() => setShowOverview(false)} 
              />
            </div>
          ) : selectedItem ? (
            <>
              {/* Structure view */}
              <div className="flex-1 border-r overflow-auto">
                <StructureView
                  item={selectedItem}
                  allPages={scanResult.pages}
                  allComponents={scanResult.components}
                  allHooks={scanResult.hooks || []}
                  allContexts={scanResult.contexts || []}
                  allUtilities={scanResult.utilities || []}
                  onNavigateToPage={handleSelectPage}
                  onNavigateToComponent={handleSelectComponent}
                  onNavigateToHook={handleSelectHook}
                  onNavigateToContext={handleSelectContext}
                  onNavigateToUtility={handleSelectUtility}
                />
              </div>
              
              {/* Preview pane - only for pages and components */}
              {(selectedItem.type === 'page' || selectedItem.type === 'component') && (
                <div className="w-[500px] overflow-auto">
                  <PreviewPane
                    item={selectedItem as { type: 'page'; item: PageInfo } | { type: 'component'; item: ComponentInfo }}
                    projectPath={projectPath}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Select a page or component to explore</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tab button component
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  small?: boolean;
  highlight?: boolean;
}

function TabButton({ active, onClick, icon, label, count, small, highlight }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 ${small ? 'py-2' : 'py-3'} text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
        active
          ? 'text-foreground border-b-2 border-primary bg-muted/50'
          : highlight && count > 0
            ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300'
            : 'text-muted-foreground hover:text-foreground'
      } ${small ? 'text-xs' : ''}`}
    >
      {icon}
      <span className={small ? 'hidden sm:inline' : ''}>{label}</span>
      <span className={`${small ? 'text-[10px]' : 'text-xs'} ${
        highlight && count > 0 
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 rounded-full' 
          : 'opacity-70'
      }`}>
        {highlight && count > 0 ? count : `(${count})`}
      </span>
    </button>
  );
}
