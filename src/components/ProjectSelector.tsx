import { useState } from 'react';
import { FolderOpen, Loader2, AlertCircle, Sparkles } from 'lucide-react';

// Logging
const log = {
  selector: (msg: string, data?: any) => {
    console.debug(`%c[PROJECT-SELECTOR]%c ${msg}`, 'color: #14b8a6; font-weight: bold', 'color: inherit', data !== undefined ? data : '');
  }
};

interface ProjectSelectorProps {
  onSelect: (path: string) => void;
  loading: boolean;
  error: string | null;
}

export function ProjectSelector({ onSelect, loading, error }: ProjectSelectorProps) {
  const [path, setPath] = useState('');

  log.selector('Render', { loading, error, pathLength: path.length });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (path.trim()) {
      log.selector('Submitting path', { path: path.trim() });
      onSelect(path.trim());
    }
  };

  const handlePathChange = (value: string) => {
    log.selector('Path changed', { value });
    setPath(value);
  };

  return (
    <div className="w-full max-w-lg">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-lg shadow-purple-500/25">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Next.js Explorer</h1>
        <p className="text-slate-400">
          Visualize your pages, components, and their relationships
        </p>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6 shadow-xl">
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Project Path
          </label>
          <div className="relative">
            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={path}
              onChange={(e) => handlePathChange(e.target.value)}
              placeholder="/path/to/your/nextjs-project"
              className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              disabled={loading}
            />
          </div>
          
          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !path.trim()}
            className="mt-4 w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Scan Project
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">
            Enter the absolute path to your Next.js project directory.<br />
            Supports both App Router and Pages Router projects.
          </p>
        </div>
      </div>
    </div>
  );
}
