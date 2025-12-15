import {
  LayoutGrid,
  Layers,
  Anchor,
  Share2,
  Wrench,
  FileCode,
  BookOpen,
  Clock,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Zap
} from 'lucide-react';
import { type ScanOverviewData } from '../lib/api';

export type { ScanOverviewData };

interface ScanOverviewProps {
  data: ScanOverviewData;
  onClose?: () => void;
}

export function ScanOverview({ data, onClose }: ScanOverviewProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFrameworkLabel = () => {
    if (data.framework === 'nextjs') {
      if (data.routerType === 'nextjs-app') return 'Next.js (App Router)';
      if (data.routerType === 'nextjs-pages') return 'Next.js (Pages Router)';
      return 'Next.js';
    }
    if (data.framework === 'react') {
      if (data.routerType === 'react-router') return 'React (React Router)';
      return 'React';
    }
    return 'Unknown Framework';
  };

  const storyCoverage = {
    pages: data.counts.pages > 0 
      ? Math.round((data.stories.pagesWithStories / data.counts.pages) * 100) 
      : 0,
    components: data.counts.components > 0 
      ? Math.round((data.stories.componentsWithStories / data.counts.components) * 100) 
      : 0
  };

  return (
    <div className="h-full overflow-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Scan Overview</h2>
              <p className="text-sm text-muted-foreground">{data.projectName}</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Project Info */}
        <div className="bg-card rounded-xl border p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-lg">{data.projectName}</h3>
              <p className="text-sm text-muted-foreground font-mono truncate mt-1">
                {data.projectPath}
              </p>
              <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">
                  {getFrameworkLabel()}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Scanned {formatDate(data.scannedAt)}
                </span>
                {data.fromCache && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    From cache
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            icon={<LayoutGrid className="w-5 h-5" />}
            label="Pages"
            value={data.counts.pages}
            sublabel={data.counts.layouts > 0 ? `+ ${data.counts.layouts} layouts` : undefined}
            color="blue"
          />
          <StatCard
            icon={<Layers className="w-5 h-5" />}
            label="Components"
            value={data.counts.components}
            color="purple"
          />
          <StatCard
            icon={<Anchor className="w-5 h-5" />}
            label="Hooks"
            value={data.counts.hooks}
            color="cyan"
          />
          <StatCard
            icon={<Share2 className="w-5 h-5" />}
            label="Contexts"
            value={data.counts.contexts}
            color="orange"
          />
          <StatCard
            icon={<Wrench className="w-5 h-5" />}
            label="Utilities"
            value={data.counts.utilities}
            color="slate"
          />
          <StatCard
            icon={<FileCode className="w-5 h-5" />}
            label="Server Actions"
            value={data.counts.serverActionFiles}
            color="emerald"
          />
        </div>

        {/* Stories Coverage */}
        <div className="bg-card rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Stories Coverage</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Pages</span>
                <span className="text-sm font-medium">
                  {data.stories.pagesWithStories} / {data.counts.pages}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${storyCoverage.pages}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {storyCoverage.pages}% coverage
              </p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Components</span>
                <span className="text-sm font-medium">
                  {data.stories.componentsWithStories} / {data.counts.components}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${storyCoverage.components}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {storyCoverage.components}% coverage
              </p>
            </div>
          </div>
        </div>

        {/* Details Tables */}
        {data.details && (
          <>
            {/* Pages Table */}
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="px-5 py-4 border-b bg-muted/30">
                <h3 className="font-semibold flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4" />
                  Pages ({data.counts.pages})
                </h3>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Route</th>
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-center px-4 py-2 font-medium">Stories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.details.pages.filter(p => !p.isLayout && !p.isLoading && !p.isError).map((page, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-xs">{page.route}</td>
                        <td className="px-4 py-2 text-muted-foreground">Page</td>
                        <td className="px-4 py-2 text-center">
                          {page.hasStories ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 inline-block" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground/40 inline-block" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Components Table */}
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="px-5 py-4 border-b bg-muted/30">
                <h3 className="font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Components ({data.counts.components})
                </h3>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Name</th>
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-center px-4 py-2 font-medium">Usage</th>
                      <th className="text-center px-4 py-2 font-medium">Stories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.details.components.map((comp, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-xs">{comp.name}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            comp.isClientComponent 
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          }`}>
                            {comp.isClientComponent ? 'Client' : 'Server'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-muted-foreground">
                          {comp.usedInPages + comp.usedInComponents}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {comp.hasStories ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 inline-block" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground/40 inline-block" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel?: string;
  color: 'blue' | 'purple' | 'cyan' | 'orange' | 'slate' | 'emerald';
}

function StatCard({ icon, label, value, sublabel, color }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-500/5 text-blue-600 dark:text-blue-400',
    purple: 'from-purple-500/20 to-purple-500/5 text-purple-600 dark:text-purple-400',
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-600 dark:text-cyan-400',
    orange: 'from-orange-500/20 to-orange-500/5 text-orange-600 dark:text-orange-400',
    slate: 'from-slate-500/20 to-slate-500/5 text-slate-600 dark:text-slate-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
  };

  const iconColorClasses = {
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    cyan: 'text-cyan-500',
    orange: 'text-orange-500',
    slate: 'text-slate-500',
    emerald: 'text-emerald-500',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl border p-4`}>
      <div className="flex items-center gap-3">
        <div className={iconColorClasses[color]}>{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {sublabel && (
            <p className="text-xs text-muted-foreground/70">{sublabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}

