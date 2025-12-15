import { useState, useMemo } from 'react';
import type { PageInfo, ComponentInfo, HookInfo, ContextInfo, UtilityInfo } from '@/lib/api';
import { 
  FileText, 
  Layers, 
  Search, 
  ChevronRight,
  Layout,
  Loader,
  AlertTriangle,
  Database,
  Monitor,
  Anchor,
  Share2,
  Wrench
} from 'lucide-react';

// Logging
const log = {
  sidebar: (msg: string, data?: any) => {
    console.debug(`%c[SIDEBAR]%c ${msg}`, 'color: #ec4899; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  }
};

export type ViewMode = 'pages' | 'components' | 'hooks' | 'contexts' | 'utilities' | 'health';

export type SelectedItem = 
  | { type: 'page'; item: PageInfo }
  | { type: 'component'; item: ComponentInfo }
  | { type: 'hook'; item: HookInfo }
  | { type: 'context'; item: ContextInfo }
  | { type: 'utility'; item: UtilityInfo }
  | null;

interface SidebarProps {
  viewMode: ViewMode;
  pages: PageInfo[];
  components: ComponentInfo[];
  hooks: HookInfo[];
  contexts: ContextInfo[];
  utilities: UtilityInfo[];
  selectedItem: SelectedItem;
  onSelectPage: (page: PageInfo) => void;
  onSelectComponent: (component: ComponentInfo) => void;
  onSelectHook: (hook: HookInfo) => void;
  onSelectContext: (context: ContextInfo) => void;
  onSelectUtility: (utility: UtilityInfo) => void;
}

export function Sidebar({
  viewMode,
  pages,
  components,
  hooks,
  contexts,
  utilities,
  selectedItem,
  onSelectPage,
  onSelectComponent,
  onSelectHook,
  onSelectContext,
  onSelectUtility,
}: SidebarProps) {
  const [search, setSearch] = useState('');

  log.sidebar('Render', { 
    viewMode, 
    pagesCount: pages.length, 
    componentsCount: components.length,
    hooksCount: hooks.length,
    contextsCount: contexts.length,
    utilitiesCount: utilities.length,
    search 
  });

  const filteredPages = useMemo(() => {
    const filtered = pages.filter(p => !p.isLayout && !p.isLoading && !p.isError);
    if (!search) return filtered;
    return filtered.filter(
      p => p.route.toLowerCase().includes(search.toLowerCase()) ||
           p.fileName.toLowerCase().includes(search.toLowerCase())
    );
  }, [pages, search]);

  const filteredComponents = useMemo(() => {
    if (!search) return components;
    return components.filter(
      c => c.name.toLowerCase().includes(search.toLowerCase()) ||
           c.fileName.toLowerCase().includes(search.toLowerCase())
    );
  }, [components, search]);

  const filteredHooks = useMemo(() => {
    if (!search) return hooks;
    return hooks.filter(
      h => h.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [hooks, search]);

  const filteredContexts = useMemo(() => {
    if (!search) return contexts;
    return contexts.filter(
      c => c.name.toLowerCase().includes(search.toLowerCase()) ||
           c.providerName.toLowerCase().includes(search.toLowerCase())
    );
  }, [contexts, search]);

  const filteredUtilities = useMemo(() => {
    if (!search) return utilities;
    return utilities.filter(
      u => u.name.toLowerCase().includes(search.toLowerCase()) ||
           u.exports.some(e => e.toLowerCase().includes(search.toLowerCase()))
    );
  }, [utilities, search]);

  // Group pages by folder
  const groupedPages = useMemo(() => {
    const groups: Record<string, PageInfo[]> = {};
    for (const page of filteredPages) {
      const parts = page.route.split('/').filter(Boolean);
      const folder = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(page);
    }
    return groups;
  }, [filteredPages]);

  // Group components by folder
  const groupedComponents = useMemo(() => {
    const groups: Record<string, ComponentInfo[]> = {};
    for (const comp of filteredComponents) {
      const pathParts = comp.filePath.split('/');
      const compIdx = pathParts.findIndex(p => p === 'components');
      let folder = 'Other';
      if (compIdx !== -1 && pathParts.length > compIdx + 2) {
        folder = pathParts[compIdx + 1];
      } else if (compIdx !== -1) {
        folder = 'Root';
      }
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(comp);
    }
    return groups;
  }, [filteredComponents]);

  const handleSearch = (value: string) => {
    log.sidebar('Search changed', { value });
    setSearch(value);
  };

  const getPlaceholder = () => {
    switch (viewMode) {
      case 'pages': return 'Search pages...';
      case 'components': return 'Search components...';
      case 'hooks': return 'Search hooks...';
      case 'contexts': return 'Search contexts...';
      case 'utilities': return 'Search utilities...';
      case 'health': return 'Search unused items...';
    }
  };

  // Calculate potentially unused items
  const unusedComponents = components.filter(c => 
    c.usedInPages.length === 0 && c.usedInComponents.length === 0
  );
  const unusedHooks = hooks.filter(h => h.usedIn.length === 0);
  const unusedContexts = contexts.filter(c => c.usedIn.length === 0);
  const unusedUtilities = utilities.filter(u => u.usedIn.length === 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={getPlaceholder()}
            className="w-full pl-9 pr-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-2">
        {viewMode === 'pages' && (
          <PagesList
            groups={groupedPages}
            pages={pages}
            selected={selectedItem?.type === 'page' ? selectedItem.item : null}
            onSelect={onSelectPage}
          />
        )}
        {viewMode === 'components' && (
          <ComponentsList
            groups={groupedComponents}
            selected={selectedItem?.type === 'component' ? selectedItem.item : null}
            onSelect={onSelectComponent}
          />
        )}
        {viewMode === 'hooks' && (
          <HooksList
            hooks={filteredHooks}
            selected={selectedItem?.type === 'hook' ? selectedItem.item : null}
            onSelect={onSelectHook}
          />
        )}
        {viewMode === 'contexts' && (
          <ContextsList
            contexts={filteredContexts}
            selected={selectedItem?.type === 'context' ? selectedItem.item : null}
            onSelect={onSelectContext}
          />
        )}
        {viewMode === 'utilities' && (
          <UtilitiesList
            utilities={filteredUtilities}
            selected={selectedItem?.type === 'utility' ? selectedItem.item : null}
            onSelect={onSelectUtility}
          />
        )}
        {viewMode === 'health' && (
          <CodeHealthList
            unusedComponents={unusedComponents}
            unusedHooks={unusedHooks}
            unusedContexts={unusedContexts}
            unusedUtilities={unusedUtilities}
            selectedItem={selectedItem}
            onSelectComponent={onSelectComponent}
            onSelectHook={onSelectHook}
            onSelectContext={onSelectContext}
            onSelectUtility={onSelectUtility}
          />
        )}
      </div>
    </div>
  );
}

// Export the unused count for use in App.tsx
export function getUnusedCount(
  components: ComponentInfo[],
  hooks: HookInfo[],
  contexts: ContextInfo[],
  utilities: UtilityInfo[]
): number {
  const unusedComponents = components.filter(c => 
    c.usedInPages.length === 0 && c.usedInComponents.length === 0
  );
  const unusedHooks = hooks.filter(h => h.usedIn.length === 0);
  const unusedContexts = contexts.filter(c => c.usedIn.length === 0);
  const unusedUtilities = utilities.filter(u => u.usedIn.length === 0);
  return unusedComponents.length + unusedHooks.length + unusedContexts.length + unusedUtilities.length;
}

// ==================== PAGES LIST ====================
interface PagesListProps {
  groups: Record<string, PageInfo[]>;
  pages: PageInfo[];
  selected: PageInfo | null;
  onSelect: (page: PageInfo) => void;
}

function PagesList({ groups, pages, selected, onSelect }: PagesListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(Object.keys(groups)));

  const toggleGroup = (group: string) => {
    const next = new Set(expandedGroups);
    if (next.has(group)) {
      next.delete(group);
    } else {
      next.add(group);
    }
    setExpandedGroups(next);
  };

  const getRelatedFiles = (route: string) => {
    return {
      layout: pages.find(p => p.isLayout && p.route === route),
      loading: pages.find(p => p.isLoading && p.route === route),
      error: pages.find(p => p.isError && p.route === route),
    };
  };

  return (
    <div className="space-y-1">
      {Object.entries(groups).map(([folder, folderPages]) => (
        <div key={folder}>
          {folder !== '/' && (
            <button
              onClick={() => toggleGroup(folder)}
              className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronRight 
                className={`w-3 h-3 transition-transform ${expandedGroups.has(folder) ? 'rotate-90' : ''}`} 
              />
              {folder}
            </button>
          )}
          {(folder === '/' || expandedGroups.has(folder)) && (
            <div className="space-y-0.5">
              {folderPages.map((page) => {
                const related = getRelatedFiles(page.route);
                const isSelected = selected?.route === page.route;
                const hasData = page.dataDependencies.length > 0;

                return (
                  <button
                    key={page.filePath}
                    onClick={() => onSelect(page)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left truncate font-mono text-xs">
                      {page.route || '/'}
                    </span>
                    <div className="flex items-center gap-1">
                      {hasData && (
                        <Database className={`w-3 h-3 ${isSelected ? 'text-primary-foreground/70' : 'text-amber-500'}`} />
                      )}
                      {related.layout && (
                        <Layout className={`w-3 h-3 ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} />
                      )}
                      {related.loading && (
                        <Loader className={`w-3 h-3 ${isSelected ? 'text-primary-foreground/70' : 'text-blue-500'}`} />
                      )}
                      {related.error && (
                        <AlertTriangle className={`w-3 h-3 ${isSelected ? 'text-primary-foreground/70' : 'text-red-500'}`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ==================== COMPONENTS LIST ====================
interface ComponentsListProps {
  groups: Record<string, ComponentInfo[]>;
  selected: ComponentInfo | null;
  onSelect: (component: ComponentInfo) => void;
}

function ComponentsList({ groups, selected, onSelect }: ComponentsListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(Object.keys(groups)));

  const toggleGroup = (group: string) => {
    const next = new Set(expandedGroups);
    if (next.has(group)) {
      next.delete(group);
    } else {
      next.add(group);
    }
    setExpandedGroups(next);
  };

  return (
    <div className="space-y-1">
      {Object.entries(groups).map(([folder, folderComponents]) => (
        <div key={folder}>
          <button
            onClick={() => toggleGroup(folder)}
            className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronRight 
              className={`w-3 h-3 transition-transform ${expandedGroups.has(folder) ? 'rotate-90' : ''}`} 
            />
            {folder}
            <span className="text-xs text-muted-foreground ml-auto">{folderComponents.length}</span>
          </button>
          {expandedGroups.has(folder) && (
            <div className="space-y-0.5 ml-2">
              {folderComponents.map((component) => {
                const isSelected = selected?.name === component.name;
                const usageCount = component.usedInPages.length + component.usedInComponents.length;

                return (
                  <button
                    key={component.filePath}
                    onClick={() => onSelect(component)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <Layers className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left truncate">
                      {component.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {component.isClientComponent && (
                        <span title="Client Component">
                          <Monitor className={`w-3 h-3 ${isSelected ? 'text-primary-foreground/70' : 'text-blue-500'}`} />
                        </span>
                      )}
                      {usageCount > 0 && (
                        <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {usageCount}×
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ==================== HOOKS LIST ====================
interface HooksListProps {
  hooks: HookInfo[];
  selected: HookInfo | null;
  onSelect: (hook: HookInfo) => void;
}

function HooksList({ hooks, selected, onSelect }: HooksListProps) {
  if (hooks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No custom hooks found
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {hooks.map((hook) => {
        const isSelected = selected?.name === hook.name;
        
        return (
          <button
            key={hook.filePath}
            onClick={() => onSelect(hook)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <Anchor className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left truncate font-mono text-xs">
              {hook.name}
            </span>
            {hook.usedIn.length > 0 && (
              <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {hook.usedIn.length}×
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ==================== CONTEXTS LIST ====================
interface ContextsListProps {
  contexts: ContextInfo[];
  selected: ContextInfo | null;
  onSelect: (context: ContextInfo) => void;
}

function ContextsList({ contexts, selected, onSelect }: ContextsListProps) {
  if (contexts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No contexts/providers found
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {contexts.map((context) => {
        const isSelected = selected?.name === context.name;
        
        return (
          <button
            key={context.filePath}
            onClick={() => onSelect(context)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <Share2 className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left truncate">
              {context.name}
            </span>
            {context.usedIn.length > 0 && (
              <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {context.usedIn.length}×
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ==================== UTILITIES LIST ====================
interface UtilitiesListProps {
  utilities: UtilityInfo[];
  selected: UtilityInfo | null;
  onSelect: (utility: UtilityInfo) => void;
}

function UtilitiesList({ utilities, selected, onSelect }: UtilitiesListProps) {
  if (utilities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No utility files found
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {utilities.map((utility) => {
        const isSelected = selected?.name === utility.name;
        
        return (
          <button
            key={utility.filePath}
            onClick={() => onSelect(utility)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <Wrench className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left truncate font-mono text-xs">
              {utility.name}
            </span>
            <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {utility.exports.length} exports
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ==================== CODE HEALTH LIST ====================
interface CodeHealthListProps {
  unusedComponents: ComponentInfo[];
  unusedHooks: HookInfo[];
  unusedContexts: ContextInfo[];
  unusedUtilities: UtilityInfo[];
  selectedItem: SelectedItem;
  onSelectComponent: (component: ComponentInfo) => void;
  onSelectHook: (hook: HookInfo) => void;
  onSelectContext: (context: ContextInfo) => void;
  onSelectUtility: (utility: UtilityInfo) => void;
}

function CodeHealthList({ 
  unusedComponents, 
  unusedHooks, 
  unusedContexts, 
  unusedUtilities,
  selectedItem,
  onSelectComponent,
  onSelectHook,
  onSelectContext,
  onSelectUtility
}: CodeHealthListProps) {
  const totalUnused = unusedComponents.length + unusedHooks.length + unusedContexts.length + unusedUtilities.length;

  if (totalUnused === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <span className="text-2xl">✓</span>
        </div>
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          All Clear!
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          No potentially unused items detected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="mx-1 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-2">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              Potentially Unused Code
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              These items have no detected imports. Click "Investigate" to copy an AI prompt for verification.
            </p>
          </div>
        </div>
      </div>

      {/* Unused Components */}
      {unusedComponents.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Layers className="w-3 h-3" />
            Components ({unusedComponents.length})
          </div>
          <div className="space-y-0.5">
            {unusedComponents.map((comp) => {
              const isSelected = selectedItem?.type === 'component' && selectedItem.item.name === comp.name;
              return (
                <button
                  key={comp.filePath}
                  onClick={() => onSelectComponent(comp)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span className="flex-1 text-left truncate">{comp.name}</span>
                  <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-amber-500'}`}>
                    0×
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Unused Hooks */}
      {unusedHooks.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Anchor className="w-3 h-3" />
            Hooks ({unusedHooks.length})
          </div>
          <div className="space-y-0.5">
            {unusedHooks.map((hook) => {
              const isSelected = selectedItem?.type === 'hook' && selectedItem.item.name === hook.name;
              return (
                <button
                  key={hook.filePath}
                  onClick={() => onSelectHook(hook)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <Anchor className="w-4 h-4 text-amber-500" />
                  <span className="flex-1 text-left truncate font-mono text-xs">{hook.name}</span>
                  <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-amber-500'}`}>
                    0×
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Unused Contexts */}
      {unusedContexts.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Share2 className="w-3 h-3" />
            Contexts ({unusedContexts.length})
          </div>
          <div className="space-y-0.5">
            {unusedContexts.map((context) => {
              const isSelected = selectedItem?.type === 'context' && selectedItem.item.name === context.name;
              return (
                <button
                  key={context.filePath}
                  onClick={() => onSelectContext(context)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <Share2 className="w-4 h-4 text-amber-500" />
                  <span className="flex-1 text-left truncate">{context.name}</span>
                  <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-amber-500'}`}>
                    0×
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Unused Utilities */}
      {unusedUtilities.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Wrench className="w-3 h-3" />
            Utilities ({unusedUtilities.length})
          </div>
          <div className="space-y-0.5">
            {unusedUtilities.map((utility) => {
              const isSelected = selectedItem?.type === 'utility' && selectedItem.item.name === utility.name;
              return (
                <button
                  key={utility.filePath}
                  onClick={() => onSelectUtility(utility)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <Wrench className="w-4 h-4 text-amber-500" />
                  <span className="flex-1 text-left truncate font-mono text-xs">{utility.name}</span>
                  <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-amber-500'}`}>
                    0×
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
