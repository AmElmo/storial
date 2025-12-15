import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
// @ts-ignore - glob types may not be installed yet
import { glob } from 'glob';
import { parseFile, extractImports, extractLinks, extractDataDependencies, extractProps, isClientComponent, hasReactJSX, extractExportedComponentNames, extractHookExports, hasHookDefinition, type EnhancedImportInfo } from './parser.js';

// ==================== PATH ALIAS RESOLUTION ====================
interface PathAliases {
  [alias: string]: string[];  // alias pattern -> resolved paths
}

let cachedPathAliases: PathAliases | null = null;

async function loadPathAliases(projectPath: string): Promise<PathAliases> {
  if (cachedPathAliases) return cachedPathAliases;

  const aliases: PathAliases = {};

  // Try to load tsconfig.json or jsconfig.json
  const configFiles = ['tsconfig.json', 'jsconfig.json'];

  for (const configFile of configFiles) {
    try {
      const configPath = path.join(projectPath, configFile);
      const configContent = await fs.readFile(configPath, 'utf-8');
      // Remove comments from JSON (simple approach for // comments)
      const cleanedContent = configContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const config = JSON.parse(cleanedContent);

      const baseUrl = config.compilerOptions?.baseUrl || '.';
      const paths = config.compilerOptions?.paths || {};

      for (const [aliasPattern, targetPaths] of Object.entries(paths)) {
        // Convert TypeScript path pattern to regex-friendly pattern
        // e.g., "@/*" -> "@/"
        const aliasKey = aliasPattern.replace(/\*$/, '');
        const resolvedPaths = (targetPaths as string[]).map(p => {
          // Remove trailing /* and resolve relative to baseUrl
          const cleanPath = p.replace(/\/\*$/, '');
          return path.join(projectPath, baseUrl, cleanPath);
        });
        aliases[aliasKey] = resolvedPaths;
      }

      log.debug(`Loaded path aliases from ${configFile}:`, Object.keys(aliases));
      break; // Use first found config
    } catch {
      // Config file doesn't exist or is invalid, continue
    }
  }

  // Add common default aliases if not defined
  if (!aliases['@/']) {
    aliases['@/'] = [path.join(projectPath, 'src'), projectPath];
  }
  if (!aliases['~/']) {
    aliases['~/'] = [path.join(projectPath, 'src'), projectPath];
  }

  cachedPathAliases = aliases;
  return aliases;
}

// Resolve an import path using path aliases
function resolveImportPath(importPath: string, fromFilePath: string, projectPath: string, aliases: PathAliases): string | null {
  // Handle relative imports
  if (importPath.startsWith('.')) {
    const fromDir = path.dirname(fromFilePath);
    const resolved = path.resolve(fromDir, importPath);
    return resolved;
  }

  // Handle aliased imports
  for (const [alias, targetPaths] of Object.entries(aliases)) {
    if (importPath.startsWith(alias)) {
      const remainder = importPath.slice(alias.length);
      for (const targetPath of targetPaths) {
        const resolved = path.join(targetPath, remainder);
        // Check if file exists with various extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
        for (const ext of extensions) {
          const fullPath = resolved + ext;
          if (fsSync.existsSync(fullPath)) {
            return fullPath;
          }
        }
        // Try without extension (might already have one)
        if (fsSync.existsSync(resolved)) {
          return resolved;
        }
      }
    }
  }

  return null;
}

// Logging utility
const log = {
  info: (msg: string, data?: any) => {
    console.log(`\x1b[34m[SCANNER]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  success: (msg: string, data?: any) => {
    console.log(`\x1b[32m[SCANNER ✓]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  warn: (msg: string, data?: any) => {
    console.log(`\x1b[33m[SCANNER ⚠]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  error: (msg: string, data?: any) => {
    console.log(`\x1b[31m[SCANNER ✗]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  debug: (msg: string, data?: any) => {
    console.log(`\x1b[90m[SCANNER 🔍]\x1b[0m ${msg}`, data !== undefined ? data : '');
  }
};

export interface PageInfo {
  route: string;
  filePath: string;
  fileName: string;
  // Next.js App Router special file types
  isLayout?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  isTemplate?: boolean;      // template.tsx - re-renders on navigation
  isNotFound?: boolean;      // not-found.tsx - 404 handling
  isGlobalError?: boolean;   // global-error.tsx - root error boundary
  isDefault?: boolean;       // default.tsx - parallel routes fallback
  isApiRoute?: boolean;      // route.ts - API route handler
  // React Router
  componentName?: string;    // For React Router - the component rendered at this route
  // Nested routes (React Router)
  children?: PageInfo[];     // Child routes for nested routing
  // Analysis results
  components: string[];
  linksTo: string[];
  dataDependencies: DataDependency[];
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  fileName: string;
  isClientComponent: boolean;
  props: PropInfo[];
  usedInPages: string[];
  usedInComponents: string[];
  imports: string[];
  exports: string[]; // Export names (for matching imports like DocsSidebarNav from sidebar-nav.tsx)
  dataDependencies: DataDependency[];
  serverActions: ServerActionDependency[]; // Server actions this component uses
  // Transitive dependencies (full dependency chain)
  allDependencies?: {
    components: string[];   // All components this depends on (direct + transitive)
    hooks: string[];        // All hooks this depends on (direct + transitive)
    contexts: string[];     // All contexts this depends on (direct + transitive)
    utilities: string[];    // All utilities this depends on (direct + transitive)
  };
}

export interface DataDependency {
  type: 'fetch' | 'prisma' | 'drizzle' | 'useQuery' | 'useSWR' | 'serverAction' | 'trpc' | 'graphql' | 'axios' | 'unknown';
  source: string;
  line: number;
}

// Server Action dependency tracking
export interface ServerActionDependency {
  functionName: string;    // e.g., "createCart"
  importPath: string;      // e.g., "@/lib/actions" or "./actions"
  sourceFilePath: string;  // Full resolved path to the actions file
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

// Extended router types
export type RouterType = 'nextjs-app' | 'nextjs-pages' | 'react-router' | 'unknown';

export interface HookInfo {
  name: string;
  filePath: string;
  fileName: string;
  description?: string;
  dependencies: string[]; // What other hooks/libs it uses
  usedIn: string[]; // Which components use this hook
}

export interface ContextInfo {
  name: string;
  filePath: string;
  fileName: string;
  providerName: string;
  usedIn: string[]; // Which components use this context
}

export interface UtilityInfo {
  name: string;
  filePath: string;
  fileName: string;
  exports: string[]; // Functions/constants exported
  usedIn: string[]; // Which files import this
}

export interface LayoutNode {
  route: string;
  filePath: string;
  children: LayoutNode[];
}

// Server Action file tracking
export interface ServerActionFile {
  filePath: string;
  relativePath: string;  // Path relative to project (for imports)
  exportedFunctions: string[];  // Functions exported from this file
}

// State management store info
export interface StoreInfo {
  name: string;
  filePath: string;
  fileName: string;
  type: 'redux' | 'zustand' | 'jotai' | 'recoil' | 'mobx' | 'valtio' | 'unknown';
  exports: string[];  // Exported selectors, actions, atoms, etc.
  usedIn: string[];
}

// Middleware info (Next.js)
export interface MiddlewareInfo {
  filePath: string;
  fileName: string;
  matcherPatterns: string[];  // Routes the middleware applies to
  usedIn: string[];
}

// API Route info (for Pages Router)
export interface ApiRouteInfo {
  route: string;
  filePath: string;
  fileName: string;
  methods: string[];  // GET, POST, PUT, DELETE, etc.
}

export interface ScanResult {
  projectPath: string;
  projectName: string;
  routerType: RouterType;
  framework: 'nextjs' | 'react' | 'unknown';
  pages: PageInfo[];
  components: ComponentInfo[];
  hooks: HookInfo[];
  contexts: ContextInfo[];
  utilities: UtilityInfo[];
  stores: StoreInfo[];  // State management stores
  middleware: MiddlewareInfo | null;  // Next.js middleware
  apiRoutes: ApiRouteInfo[];  // API routes (Pages Router)
  serverActionFiles: ServerActionFile[];  // All files with "use server" directive
  layoutHierarchy: LayoutNode | null;
  scannedAt: string;
}

export async function scanNextJsProject(projectPath: string): Promise<ScanResult> {
  const startTime = Date.now();
  log.info('=== STARTING SCAN ===');
  log.info('Project path:', projectPath);

  // Load path aliases for import resolution
  await loadPathAliases(projectPath);

  // Detect framework and router type
  log.info('Detecting framework and router type...');
  const { framework, routerType } = await detectFrameworkAndRouter(projectPath);
  log.success(`Detected: ${framework} with ${routerType} routing`);

  // Scan pages based on router type
  log.info('Scanning pages/routes...');
  const pages = await scanPages(projectPath, routerType);
  log.success(`Found ${pages.length} pages/routes`);
  pages.forEach(p => log.debug(`  Route: ${p.route} -> ${p.componentName || p.fileName}`));

  // Scan components
  log.info('Scanning components...');
  const components = await scanComponents(projectPath);
  log.success(`Found ${components.length} components`);
  components.forEach(c => log.debug(`  Component: ${c.name}`));

  // Scan custom hooks
  log.info('Scanning custom hooks...');
  const hooks = await scanHooks(projectPath);
  log.success(`Found ${hooks.length} custom hooks`);
  hooks.forEach(h => log.debug(`  Hook: ${h.name}`));

  // Scan contexts/providers
  log.info('Scanning contexts/providers...');
  const contexts = await scanContexts(projectPath);
  log.success(`Found ${contexts.length} contexts`);
  contexts.forEach(c => log.debug(`  Context: ${c.name}`));

  // Scan utility files
  log.info('Scanning utility files...');
  const utilities = await scanUtilities(projectPath);
  log.success(`Found ${utilities.length} utility files`);
  utilities.forEach(u => log.debug(`  Utility: ${u.name}`));

  // Scan state management stores
  log.info('Scanning state management stores...');
  const stores = await scanStores(projectPath);
  log.success(`Found ${stores.length} state stores`);
  stores.forEach(s => log.debug(`  Store (${s.type}): ${s.name}`));

  // Scan middleware (Next.js only)
  log.info('Scanning middleware...');
  const middleware = framework === 'nextjs' ? await scanMiddleware(projectPath) : null;
  if (middleware) {
    log.success(`Found middleware: ${middleware.fileName}`);
  } else {
    log.debug('No middleware found');
  }

  // Scan API routes (Pages Router)
  log.info('Scanning API routes...');
  const apiRoutes = routerType === 'nextjs-pages' ? await scanApiRoutes(projectPath) : [];
  log.success(`Found ${apiRoutes.length} API routes`);
  apiRoutes.forEach(r => log.debug(`  API: ${r.route} [${r.methods.join(', ')}]`));

  // Scan server action files (Next.js only)
  log.info('Scanning server action files...');
  const serverActionFiles = framework === 'nextjs' ? await scanServerActionFiles(projectPath) : [];
  log.success(`Found ${serverActionFiles.length} server action files`);
  serverActionFiles.forEach(f => log.debug(`  Server Action: ${f.relativePath} (${f.exportedFunctions.length} functions)`));

  // Build layout hierarchy (Next.js only)
  log.info('Building layout hierarchy...');
  const layoutHierarchy = routerType === 'nextjs-app' ? await buildLayoutHierarchy(projectPath) : null;
  if (layoutHierarchy) {
    log.success('Layout hierarchy built');
  } else {
    log.debug('Layout hierarchy not applicable (not Next.js App Router)');
  }

  // Build relationships (including server action detection)
  log.info('Building relationships...');
  buildRelationships(pages, components, hooks, contexts, utilities, serverActionFiles, projectPath);
  log.success('Relationships built');

  const duration = Date.now() - startTime;
  log.success(`=== SCAN COMPLETE in ${duration}ms ===`);

  return {
    projectPath,
    projectName: path.basename(projectPath),
    routerType,
    framework,
    pages,
    components,
    hooks,
    contexts,
    utilities,
    stores,
    middleware,
    apiRoutes,
    serverActionFiles,
    layoutHierarchy,
    scannedAt: new Date().toISOString(),
  };
}

async function detectFrameworkAndRouter(projectPath: string): Promise<{ framework: 'nextjs' | 'react' | 'unknown', routerType: RouterType }> {
  // Check package.json for framework hints
  let packageJson: any = null;
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    log.debug('Found package.json');
  } catch {
    log.warn('No package.json found');
  }

  const deps: Record<string, string> = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  
  // Check for Next.js
  if (deps['next']) {
    log.debug('Next.js detected in dependencies');
    
    // Check for app or pages directory
    const appDir = path.join(projectPath, 'app');
    const srcAppDir = path.join(projectPath, 'src', 'app');
    const pagesDir = path.join(projectPath, 'pages');
    const srcPagesDir = path.join(projectPath, 'src', 'pages');

    const [hasApp, hasSrcApp, hasPages, hasSrcPages] = await Promise.all([
      fs.access(appDir).then(() => true).catch(() => false),
      fs.access(srcAppDir).then(() => true).catch(() => false),
      fs.access(pagesDir).then(() => true).catch(() => false),
      fs.access(srcPagesDir).then(() => true).catch(() => false),
    ]);

    if (hasApp || hasSrcApp) {
      return { framework: 'nextjs', routerType: 'nextjs-app' };
    }
    if (hasPages || hasSrcPages) {
      return { framework: 'nextjs', routerType: 'nextjs-pages' };
    }
  }

  // Check for React Router
  if (deps['react-router-dom'] || deps['react-router']) {
    log.debug('React Router detected in dependencies');
    return { framework: 'react', routerType: 'react-router' };
  }

  // Check for React (without specific router)
  if (deps['react']) {
    log.debug('React detected, checking for router patterns...');
    
    // Try to find routing file
    const hasReactRouter = await findReactRouterUsage(projectPath);
    if (hasReactRouter) {
      return { framework: 'react', routerType: 'react-router' };
    }
    
    return { framework: 'react', routerType: 'unknown' };
  }

  return { framework: 'unknown', routerType: 'unknown' };
}

async function findReactRouterUsage(projectPath: string): Promise<boolean> {
  // Look for common entry files that might contain router setup
  const possibleFiles = [
    'src/App.tsx', 'src/App.jsx', 'src/App.js',
    'src/main.tsx', 'src/main.jsx', 'src/main.js',
    'src/index.tsx', 'src/index.jsx', 'src/index.js',
    'App.tsx', 'App.jsx', 'App.js',
  ];

  for (const file of possibleFiles) {
    const filePath = path.join(projectPath, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.includes('react-router') || content.includes('<Routes>') || content.includes('<Route')) {
        log.debug(`Found React Router usage in ${file}`);
        return true;
      }
    } catch {
      // File doesn't exist, continue
    }
  }
  return false;
}

async function scanPages(projectPath: string, routerType: RouterType): Promise<PageInfo[]> {
  switch (routerType) {
    case 'nextjs-app':
      return scanNextJsAppRouter(projectPath);
    case 'nextjs-pages':
      return scanNextJsPagesRouter(projectPath);
    case 'react-router':
      return scanReactRouterRoutes(projectPath);
    default:
      log.warn('Unknown router type, attempting React Router scan...');
      return scanReactRouterRoutes(projectPath);
  }
}

// ==================== NEXT.JS APP ROUTER ====================
async function scanNextJsAppRouter(projectPath: string): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];
  const appDirs = [
    path.join(projectPath, 'app'),
    path.join(projectPath, 'src', 'app'),
  ];

  for (const appDir of appDirs) {
    try {
      await fs.access(appDir);
      log.info(`Scanning Next.js App Router: ${appDir}`);

      // Core page files
      const pageFiles = await glob('**/page.{tsx,ts,jsx,js}', { cwd: appDir });
      const layoutFiles = await glob('**/layout.{tsx,ts,jsx,js}', { cwd: appDir });
      const loadingFiles = await glob('**/loading.{tsx,ts,jsx,js}', { cwd: appDir });
      const errorFiles = await glob('**/error.{tsx,ts,jsx,js}', { cwd: appDir });

      // Additional Next.js App Router special files
      const templateFiles = await glob('**/template.{tsx,ts,jsx,js}', { cwd: appDir });
      const notFoundFiles = await glob('**/not-found.{tsx,ts,jsx,js}', { cwd: appDir });
      const globalErrorFiles = await glob('**/global-error.{tsx,ts,jsx,js}', { cwd: appDir });
      const defaultFiles = await glob('**/default.{tsx,ts,jsx,js}', { cwd: appDir });
      const routeFiles = await glob('**/route.{tsx,ts,jsx,js}', { cwd: appDir });

      log.debug(`Found: ${pageFiles.length} pages, ${layoutFiles.length} layouts, ${loadingFiles.length} loading, ${errorFiles.length} error, ${templateFiles.length} templates, ${notFoundFiles.length} not-found, ${routeFiles.length} API routes`);

      for (const file of pageFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file, 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pages.push(pageInfo);
      }

      for (const file of layoutFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('layout.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isLayout = true;
        pages.push(pageInfo);
      }

      for (const file of loadingFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('loading.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isLoading = true;
        pages.push(pageInfo);
      }

      for (const file of errorFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('error.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isError = true;
        pages.push(pageInfo);
      }

      // Template files (re-render on navigation, similar to layouts)
      for (const file of templateFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('template.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isTemplate = true;
        pages.push(pageInfo);
      }

      // Not-found files (404 handling)
      for (const file of notFoundFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('not-found.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isNotFound = true;
        pages.push(pageInfo);
      }

      // Global error files (root error boundary)
      for (const file of globalErrorFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('global-error.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isGlobalError = true;
        pages.push(pageInfo);
      }

      // Default files (parallel routes fallback)
      for (const file of defaultFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('default.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isDefault = true;
        pages.push(pageInfo);
      }

      // API Route handlers (route.ts files)
      for (const file of routeFiles) {
        const filePath = path.join(appDir, file);
        const route = filePathToRoute(file.replace('route.', 'page.'), 'nextjs-app');
        const pageInfo = await analyzePageFile(filePath, route);
        pageInfo.isApiRoute = true;
        pages.push(pageInfo);
      }
    } catch {
      log.debug(`App directory doesn't exist: ${appDir}`);
    }
  }

  return pages;
}

// ==================== NEXT.JS PAGES ROUTER ====================
async function scanNextJsPagesRouter(projectPath: string): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];
  const pagesDirs = [
    path.join(projectPath, 'pages'),
    path.join(projectPath, 'src', 'pages'),
  ];

  for (const pagesDir of pagesDirs) {
    try {
      await fs.access(pagesDir);
      log.info(`Scanning Next.js Pages Router: ${pagesDir}`);
      
      const pageFiles = await glob('**/*.{tsx,ts,jsx,js}', { 
        cwd: pagesDir,
        ignore: ['_app.*', '_document.*', 'api/**']
      });
      
      log.debug(`Found ${pageFiles.length} page files`);

      for (const file of pageFiles) {
        const filePath = path.join(pagesDir, file);
        const route = filePathToRoute(file, 'nextjs-pages');
        const pageInfo = await analyzePageFile(filePath, route);
        pages.push(pageInfo);
      }
    } catch {
      log.debug(`Pages directory doesn't exist: ${pagesDir}`);
    }
  }

  return pages;
}

// ==================== REACT ROUTER ====================
async function scanReactRouterRoutes(projectPath: string): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];

  // Expanded list of files that might contain route definitions
  const possibleRouteFiles = [
    // Standard locations
    'src/App.tsx', 'src/App.jsx', 'src/App.js',
    'src/routes.tsx', 'src/routes.jsx', 'src/routes.js',
    'src/router.tsx', 'src/router.jsx', 'src/router.js',
    'src/Routes.tsx', 'src/Routes.jsx', 'src/Routes.js',
    'src/Router.tsx', 'src/Router.jsx', 'src/Router.js',
    'App.tsx', 'App.jsx', 'App.js',
    // Config/routing directories
    'src/config/routes.tsx', 'src/config/routes.ts',
    'src/routing/index.tsx', 'src/routing/index.ts',
    'src/routing/routes.tsx', 'src/routing/routes.ts',
    'src/app/routes.tsx', 'src/app/routes.ts',
    // Main entry points
    'src/main.tsx', 'src/main.jsx', 'src/main.js',
    'src/index.tsx', 'src/index.jsx', 'src/index.js',
  ];

  for (const file of possibleRouteFiles) {
    const filePath = path.join(projectPath, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check if this file contains React Router routes
      if (content.includes('<Route') ||
          content.includes('createBrowserRouter') ||
          content.includes('createHashRouter') ||
          content.includes('createMemoryRouter') ||
          content.includes('RouteObject') ||
          (content.includes('path:') && content.includes('element:'))) {
        log.info(`Found React Router routes in: ${file}`);
        const routes = parseReactRouterRoutes(content, filePath, projectPath);
        pages.push(...routes);
      }
    } catch {
      // File doesn't exist, continue
    }
  }

  // Also search for route files using glob pattern
  try {
    const routePatterns = await glob('src/**/*{routes,router,Routes,Router}*.{tsx,ts,jsx,js}', {
      cwd: projectPath,
      ignore: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*']
    });

    for (const file of routePatterns) {
      const filePath = path.join(projectPath, file);
      // Skip if already processed
      if (pages.some(p => p.filePath === filePath)) continue;

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.includes('<Route') ||
            content.includes('createBrowserRouter') ||
            content.includes('path:')) {
          log.info(`Found React Router routes via glob in: ${file}`);
          const routes = parseReactRouterRoutes(content, filePath, projectPath);
          pages.push(...routes);
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    log.debug('Glob search for route files failed');
  }

  // Analyze the component files that are used as route elements
  for (const page of pages) {
    if (page.componentName) {
      const componentFile = await findComponentFile(projectPath, page.componentName);
      if (componentFile) {
        page.filePath = componentFile;
        page.fileName = path.basename(componentFile);

        // Re-analyze the actual component file
        try {
          const content = await fs.readFile(componentFile, 'utf-8');
          const parsed = parseFile(content);
          page.components = extractImports(parsed, true);
          page.linksTo = extractLinks(parsed);
          page.dataDependencies = extractDataDependencies(parsed);
        } catch (e) {
          log.debug(`Could not analyze component file: ${componentFile}`);
        }
      }
    }
  }

  return pages;
}

function parseReactRouterRoutes(content: string, filePath: string, _projectPath: string): PageInfo[] {
  const routes: PageInfo[] = [];
  let match: RegExpExecArray | null;

  // ==================== JSX-BASED ROUTES (<Route> elements) ====================

  // Pattern 1: <Route path="..." element={<Component />} />
  const routeRegex = /<Route\s+[^>]*path=["']([^"']+)["'][^>]*element=\{<(\w+)[^}]*\}/g;
  while ((match = routeRegex.exec(content)) !== null) {
    const [, routePath, componentName] = match;
    log.debug(`Found route: ${routePath} -> ${componentName}`);
    routes.push({
      route: routePath,
      filePath: filePath,
      fileName: `${componentName}.tsx`,
      componentName,
      components: [],
      linksTo: [],
      dataDependencies: [],
    });
  }

  // Pattern 2: <Route path="..." element={<Component />}> (multi-line)
  const multilineRegex = /<Route[^>]*\n?\s*path=["']([^"']+)["'][^>]*\n?\s*element=\{<(\w+)/g;
  while ((match = multilineRegex.exec(content)) !== null) {
    const [, routePath, componentName] = match;
    if (!routes.find(r => r.route === routePath)) {
      log.debug(`Found route (multiline): ${routePath} -> ${componentName}`);
      routes.push({
        route: routePath,
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // Pattern 3: path="..." and element on separate attributes (flexible parsing)
  const flexibleRegex = /<Route\s+(?:[^>]*?)path=["']([^"']+)["'](?:[^>]*?)element=\{\s*<(\w+)/gs;
  while ((match = flexibleRegex.exec(content)) !== null) {
    const [, routePath, componentName] = match;
    if (!routes.find(r => r.route === routePath)) {
      log.debug(`Found route (flexible): ${routePath} -> ${componentName}`);
      routes.push({
        route: routePath,
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // Pattern 4: element first, then path
  const reverseRegex = /<Route\s+(?:[^>]*?)element=\{\s*<(\w+)[^}]*\}(?:[^>]*?)path=["']([^"']+)["']/gs;
  while ((match = reverseRegex.exec(content)) !== null) {
    const [, componentName, routePath] = match;
    if (!routes.find(r => r.route === routePath)) {
      log.debug(`Found route (reverse): ${routePath} -> ${componentName}`);
      routes.push({
        route: routePath,
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // ==================== OBJECT-BASED ROUTES (createBrowserRouter, route objects) ====================

  // Pattern 5: createBrowserRouter with route objects
  // { path: "/", element: <Component /> }
  const objectRouteRegex = /\{\s*path:\s*["']([^"']+)["']\s*,\s*element:\s*<(\w+)/g;
  while ((match = objectRouteRegex.exec(content)) !== null) {
    const [, routePath, componentName] = match;
    if (!routes.find(r => r.route === routePath)) {
      log.debug(`Found route (object): ${routePath} -> ${componentName}`);
      routes.push({
        route: routePath,
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // Pattern 6: Object route with element first
  // { element: <Component />, path: "/" }
  const objectReverseRegex = /\{\s*element:\s*<(\w+)[^}]*\/?\s*>\s*,\s*path:\s*["']([^"']+)["']/g;
  while ((match = objectReverseRegex.exec(content)) !== null) {
    const [, componentName, routePath] = match;
    if (!routes.find(r => r.route === routePath)) {
      log.debug(`Found route (object reverse): ${routePath} -> ${componentName}`);
      routes.push({
        route: routePath,
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // Pattern 7: Lazy-loaded routes with lazy()
  // { path: "/", lazy: () => import("./pages/Home") }
  const lazyRouteRegex = /\{\s*path:\s*["']([^"']+)["'][^}]*lazy:\s*\(\)\s*=>\s*import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = lazyRouteRegex.exec(content)) !== null) {
    const [, routePath, importPath] = match;
    const componentName = path.basename(importPath).replace(/\.(tsx?|jsx?)$/, '');
    if (!routes.find(r => r.route === routePath)) {
      log.debug(`Found route (lazy): ${routePath} -> ${componentName}`);
      routes.push({
        route: routePath,
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // Pattern 8: Routes with Component property (React Router 6.4+)
  // { path: "/", Component: HomePage }
  const componentPropertyRegex = /\{\s*path:\s*["']([^"']+)["'][^}]*Component:\s*(\w+)/g;
  while ((match = componentPropertyRegex.exec(content)) !== null) {
    const [, routePath, componentName] = match;
    if (!routes.find(r => r.route === routePath)) {
      log.debug(`Found route (Component property): ${routePath} -> ${componentName}`);
      routes.push({
        route: routePath,
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // Pattern 9: Index routes
  // { index: true, element: <Home /> }
  const indexRouteRegex = /\{\s*index:\s*true\s*,\s*element:\s*<(\w+)/g;
  while ((match = indexRouteRegex.exec(content)) !== null) {
    const [, componentName] = match;
    if (!routes.find(r => r.route === '/' && r.componentName === componentName)) {
      log.debug(`Found index route: / -> ${componentName}`);
      routes.push({
        route: '/',
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // Pattern 10: Catch-all/wildcard routes
  // { path: "*", element: <NotFound /> }
  const wildcardRegex = /\{\s*path:\s*["']\*["']\s*,\s*element:\s*<(\w+)/g;
  while ((match = wildcardRegex.exec(content)) !== null) {
    const [, componentName] = match;
    if (!routes.find(r => r.route === '*')) {
      log.debug(`Found wildcard route: * -> ${componentName}`);
      routes.push({
        route: '*',
        filePath: filePath,
        fileName: `${componentName}.tsx`,
        componentName,
        components: [],
        linksTo: [],
        dataDependencies: [],
      });
    }
  }

  // ==================== NESTED ROUTES (children array) ====================
  // This is a simplified detection - full nested route parsing would need AST

  // Detect if there are children arrays for nested routes
  const hasNestedRoutes = /children:\s*\[/.test(content);
  if (hasNestedRoutes) {
    log.debug('Detected nested routes structure (children arrays)');
  }

  log.success(`Parsed ${routes.length} routes from React Router`);
  return routes;
}

async function findComponentFile(projectPath: string, componentName: string): Promise<string | null> {
  // Common locations for components
  const possiblePaths = [
    `src/components/${componentName}.tsx`,
    `src/components/${componentName}.jsx`,
    `src/components/${componentName}.js`,
    `src/components/${componentName}/${componentName}.tsx`,
    `src/components/${componentName}/index.tsx`,
    `components/${componentName}.tsx`,
    `components/${componentName}.jsx`,
    `src/pages/${componentName}.tsx`,
    `src/views/${componentName}.tsx`,
    `src/screens/${componentName}.tsx`,
    `src/${componentName}.tsx`,
  ];

  for (const relativePath of possiblePaths) {
    const fullPath = path.join(projectPath, relativePath);
    try {
      await fs.access(fullPath);
      log.debug(`Found component file: ${relativePath}`);
      return fullPath;
    } catch {
      // File doesn't exist, continue
    }
  }

  // Try glob search as fallback
  try {
    const matches = await glob(`**/${componentName}.{tsx,jsx,ts,js}`, {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**']
    });
    if (matches.length > 0) {
      const fullPath = path.join(projectPath, matches[0]);
      log.debug(`Found component via glob: ${matches[0]}`);
      return fullPath;
    }
  } catch {
    // Glob failed
  }

  log.debug(`Could not find component file for: ${componentName}`);
  return null;
}

// ==================== SHARED UTILITIES ====================
function filePathToRoute(filePath: string, routerType: RouterType): string {
  let route = filePath
    .replace(/\\/g, '/')
    .replace(/\.(tsx|ts|jsx|js)$/, '')
    .replace(/\/page$/, '')
    .replace(/\/index$/, '');

  // Handle dynamic routes
  route = route.replace(/\[\.\.\.(\w+)\]/g, '*'); // [...slug] -> *
  route = route.replace(/\[(\w+)\]/g, ':$1');      // [id] -> :id

  // Handle route groups (Next.js app router)
  if (routerType === 'nextjs-app') {
    route = route.replace(/\/\([^)]+\)/g, '');
  }

  return '/' + route.replace(/^\/+/, '');
}

async function analyzePageFile(filePath: string, route: string): Promise<PageInfo> {
  log.debug(`Analyzing page file: ${filePath}`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    log.debug(`Read ${content.length} chars from ${path.basename(filePath)}`);
    
    const parsed = parseFile(content);
    
    const pageInfo: PageInfo = {
      route: route || '/',
      filePath,
      fileName: path.basename(filePath),
      components: extractImports(parsed, true),
      linksTo: extractLinks(parsed),
      dataDependencies: extractDataDependencies(parsed),
    };
    
    log.debug(`Page analysis result:`, {
      route: pageInfo.route,
      components: pageInfo.components.length,
      links: pageInfo.linksTo.length,
      dataDeps: pageInfo.dataDependencies.length
    });
    
    return pageInfo;
  } catch (error) {
    log.error(`Failed to analyze page: ${filePath}`, error);
    return {
      route: route || '/',
      filePath,
      fileName: path.basename(filePath),
      components: [],
      linksTo: [],
      dataDependencies: [],
    };
  }
}

async function scanComponents(projectPath: string): Promise<ComponentInfo[]> {
  const components: ComponentInfo[] = [];

  // Expanded list of common component directories
  const componentDirs = [
    // Standard React/Next.js locations
    'components',
    'src/components',
    'app/components',
    'src/app/components',
    'lib/components',
    'src/lib/components',
    // UI/Design system directories
    'src/ui',
    'ui',
    'src/design-system',
    'design-system',
    // Feature-based architecture
    'src/features',
    'features',
    'src/modules',
    'modules',
    // View/Screen directories (common in RN crossover)
    'src/views',
    'views',
    'src/screens',
    'screens',
    // Shared components
    'src/shared/components',
    'shared/components',
    'src/common/components',
    'common/components',
    // Widget directories
    'src/widgets',
    'widgets',
  ];

  for (const dir of componentDirs) {
    const componentDir = path.join(projectPath, dir);
    try {
      await fs.access(componentDir);
      log.info(`Scanning component directory: ${componentDir}`);
      
      const files = await glob('**/*.{tsx,ts,jsx,js}', { 
        cwd: componentDir,
        ignore: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*']
      });
      
      log.debug(`Found ${files.length} potential component files`);

      for (const file of files) {
        const filePath = path.join(componentDir, file);
        log.debug(`Analyzing component file: ${file}`);
        const componentInfo = await analyzeComponentFile(filePath);
        if (componentInfo) {
          components.push(componentInfo);
          log.debug(`  ✓ Component detected: ${componentInfo.name}`);
        } else {
          log.debug(`  ✗ Not a component: ${file}`);
        }
      }
    } catch {
      log.debug(`Component directory doesn't exist: ${componentDir}`);
    }
  }

  return components;
}

async function analyzeComponentFile(filePath: string): Promise<ComponentInfo | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Skip index files that just re-export (they're not components themselves)
    if (fileName === 'index.tsx' || fileName === 'index.ts' || fileName === 'index.jsx' || fileName === 'index.js') {
      // Unless it actually contains component definition
      if (!content.includes('function') && !content.includes('=>') && !content.includes('forwardRef')) {
        log.debug(`Skipping ${fileName} - appears to be re-export file`);
        return null;
      }
    }

    // Use improved JSX detection from parser
    if (!hasReactJSX(content)) {
      log.debug(`Skipping ${fileName} - no JSX detected`);
      return null;
    }

    const parsed = parseFile(content);

    // Try to extract actual component names from exports
    const exportedComponentNames = extractExportedComponentNames(content);
    // Use the first exported component name, or fall back to filename
    const componentName = exportedComponentNames[0] || fileName.replace(/\.(tsx|ts|jsx|js)$/, '');

    const componentInfo: ComponentInfo = {
      name: componentName,
      filePath,
      fileName,
      isClientComponent: isClientComponent(content),
      props: extractProps(parsed, componentName),
      usedInPages: [],
      usedInComponents: [],
      imports: extractImports(parsed, false),
      exports: parsed.exports, // Track what this file exports (for matching DocsSidebarNav etc.)
      dataDependencies: extractDataDependencies(parsed),
      serverActions: [], // Will be populated in buildRelationships
    };

    log.debug(`Component analysis:`, {
      name: componentInfo.name,
      isClient: componentInfo.isClientComponent,
      props: componentInfo.props.length,
      imports: componentInfo.imports.length,
      exports: componentInfo.exports,
      dataDeps: componentInfo.dataDependencies.length
    });

    return componentInfo;
  } catch (error) {
    log.error(`Failed to analyze component: ${filePath}`, error);
    return null;
  }
}

// ==================== CUSTOM HOOKS SCANNER ====================
async function scanHooks(projectPath: string): Promise<HookInfo[]> {
  const hooks: HookInfo[] = [];

  // Common hook locations
  const hookDirs = [
    'hooks',
    'src/hooks',
    'lib/hooks',
    'src/lib/hooks',
    'app/hooks',
    'src/app/hooks',
    'src/common/hooks',
    'common/hooks',
    'src/shared/hooks',
    'shared/hooks',
    'src/utils/hooks',
    'utils/hooks',
  ];

  for (const dir of hookDirs) {
    const hookDir = path.join(projectPath, dir);
    try {
      await fs.access(hookDir);
      log.info(`Scanning hooks directory: ${hookDir}`);

      // Scan ALL files in hook directories, not just use*.ts
      // Many projects have files like auth-hooks.ts, form-hooks.ts, etc.
      const files = await glob('**/*.{ts,tsx,js,jsx}', {
        cwd: hookDir,
        ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts', '**/index.*']
      });

      log.debug(`Found ${files.length} potential hook files in ${dir}`);

      for (const file of files) {
        const filePath = path.join(hookDir, file);
        const hookInfos = await analyzeHookFile(filePath);
        if (hookInfos) {
          // analyzeHookFile now can return multiple hooks from a single file
          if (Array.isArray(hookInfos)) {
            hooks.push(...hookInfos);
          } else {
            hooks.push(hookInfos);
          }
        }
      }
    } catch {
      log.debug(`Hook directory doesn't exist: ${hookDir}`);
    }
  }

  // Also scan for hooks in lib directories (common pattern)
  const libDirs = ['lib', 'src/lib'];
  for (const dir of libDirs) {
    const libDir = path.join(projectPath, dir);
    try {
      await fs.access(libDir);
      // Look for files with "hook" in the name OR files starting with "use"
      const files = await glob('{use*.{ts,tsx,js,jsx},*hook*.{ts,tsx,js,jsx},*hooks*.{ts,tsx,js,jsx}}', {
        cwd: libDir,
        ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts']
      });

      for (const file of files) {
        const filePath = path.join(libDir, file);
        // Check if already added
        if (!hooks.find(h => h.filePath === filePath)) {
          const hookInfos = await analyzeHookFile(filePath);
          if (hookInfos) {
            if (Array.isArray(hookInfos)) {
              hooks.push(...hookInfos);
            } else {
              hooks.push(hookInfos);
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return hooks;
}

async function analyzeHookFile(filePath: string): Promise<HookInfo | HookInfo[] | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Use the improved hook detection from parser
    const hookExports = extractHookExports(content);

    if (hookExports.length === 0) {
      // Fallback: check with regex if it might be a hook file
      const hasHookExport = /export\s+(?:const|function)\s+use[A-Z]\w*/.test(content) ||
                            /export\s+default\s+function\s+use[A-Z]\w*/.test(content);

      if (!hasHookExport) {
        log.debug(`Skipping ${fileName} - no hook export detected`);
        return null;
      }
    }

    // If multiple hooks are exported from one file, return them all
    if (hookExports.length > 1) {
      const hooks: HookInfo[] = [];
      for (const hookName of hookExports) {
        // Find what other hooks/libs this hook uses
        const dependencies: string[] = [];
        const useMatches = content.match(/use[A-Z]\w+/g);
        if (useMatches) {
          const uniqueHooks = [...new Set(useMatches)].filter(h => h !== hookName);
          dependencies.push(...uniqueHooks.slice(0, 10));
        }

        hooks.push({
          name: hookName,
          filePath,
          fileName,
          dependencies,
          usedIn: [],
        });
      }
      log.debug(`Found ${hooks.length} hooks in ${fileName}: ${hookExports.join(', ')}`);
      return hooks;
    }

    // Single hook (or from fallback detection)
    const hookName = hookExports[0] || fileName.replace(/\.(tsx?|jsx?)$/, '');

    // Find what other hooks/libs this hook uses
    const dependencies: string[] = [];
    const useMatches = content.match(/use[A-Z]\w+/g);
    if (useMatches) {
      const uniqueHooks = [...new Set(useMatches)].filter(h => h !== hookName);
      dependencies.push(...uniqueHooks.slice(0, 10));
    }

    return {
      name: hookName,
      filePath,
      fileName,
      dependencies,
      usedIn: [],
    };
  } catch (error) {
    log.error(`Failed to analyze hook: ${filePath}`, error);
    return null;
  }
}

// ==================== CONTEXT/PROVIDERS SCANNER ====================
async function scanContexts(projectPath: string): Promise<ContextInfo[]> {
  const contexts: ContextInfo[] = [];
  
  // Common context locations
  const contextDirs = [
    'context',
    'contexts',
    'src/context',
    'src/contexts',
    'providers',
    'src/providers',
    'lib',
    'src/lib',
  ];

  for (const dir of contextDirs) {
    const contextDir = path.join(projectPath, dir);
    try {
      await fs.access(contextDir);
      log.info(`Scanning context directory: ${contextDir}`);
      
      const files = await glob('**/*.{ts,tsx,js,jsx}', { 
        cwd: contextDir,
        ignore: ['**/*.test.*', '**/*.spec.*']
      });

      for (const file of files) {
        const filePath = path.join(contextDir, file);
        const contextInfo = await analyzeContextFile(filePath);
        if (contextInfo) {
          if (Array.isArray(contextInfo)) {
            contexts.push(...contextInfo);
          } else {
            contexts.push(contextInfo);
          }
        }
      }
    } catch {
      log.debug(`Context directory doesn't exist: ${contextDir}`);
    }
  }

  // Also check components directory for providers
  const componentDirs = ['components', 'src/components'];
  for (const dir of componentDirs) {
    const compDir = path.join(projectPath, dir);
    try {
      await fs.access(compDir);
      const files = await glob('**/*{Provider,Context}*.{ts,tsx,js,jsx}', {
        cwd: compDir,
        ignore: ['**/*.test.*', '**/*.spec.*']
      });

      for (const file of files) {
        const filePath = path.join(compDir, file);
        if (!contexts.find(c => c.filePath === filePath)) {
          const contextInfo = await analyzeContextFile(filePath);
          if (contextInfo) {
            if (Array.isArray(contextInfo)) {
              contexts.push(...contextInfo);
            } else {
              contexts.push(contextInfo);
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return contexts;
}

async function analyzeContextFile(filePath: string): Promise<ContextInfo | ContextInfo[] | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Must have createContext (React.createContext or just createContext)
    if (!content.includes('createContext')) {
      return null;
    }

    const contexts: ContextInfo[] = [];

    // Pattern 1: const XxxContext = createContext(...) or React.createContext(...)
    const contextMatches = content.matchAll(/(?:const|export\s+const|let|export\s+let)\s+(\w+)\s*=\s*(?:React\.)?createContext/g);
    for (const match of contextMatches) {
      const contextName = match[1];
      // Look for associated provider
      const providerRegex = new RegExp(`(?:const|export\\s+const|export\\s+function|function)\\s+(${contextName.replace('Context', '')}Provider|\\w*Provider)`, 'g');
      const providerMatch = content.match(providerRegex);
      const providerName = providerMatch?.[0]?.match(/(\w+Provider)/)?.[1] || `${contextName}Provider`;

      contexts.push({
        name: contextName,
        filePath,
        fileName,
        providerName,
        usedIn: [],
      });
      log.debug(`Found context: ${contextName} with provider: ${providerName}`);
    }

    // Pattern 2: createContext<Type>() - generic version
    const genericContextMatches = content.matchAll(/(?:const|export\s+const)\s+(\w+)\s*=\s*(?:React\.)?createContext<[^>]+>/g);
    for (const match of genericContextMatches) {
      const contextName = match[1];
      if (!contexts.find(c => c.name === contextName)) {
        const providerName = `${contextName.replace('Context', '')}Provider`;
        contexts.push({
          name: contextName,
          filePath,
          fileName,
          providerName,
          usedIn: [],
        });
        log.debug(`Found generic context: ${contextName}`);
      }
    }

    // Pattern 3: Look for useXxx hooks that use useContext (associated hooks)
    const contextHookMatches = content.matchAll(/export\s+(?:const|function)\s+(use\w+)\s*[=:]/g);
    for (const match of contextHookMatches) {
      // These are context hooks, but we track them in the context info
      log.debug(`Found context hook: ${match[1]}`);
    }

    if (contexts.length === 0) {
      // Fallback: use filename-based detection
      const contextName = fileName.replace(/\.(tsx?|jsx?)$/, '');
      const providerMatch = content.match(/(?:const|export\s+const|export\s+function|function)\s+(\w+Provider)/);
      const providerName = providerMatch?.[1] || `${contextName}Provider`;

      return {
        name: contextName,
        filePath,
        fileName,
        providerName,
        usedIn: [],
      };
    }

    return contexts.length === 1 ? contexts[0] : contexts;
  } catch (error) {
    log.error(`Failed to analyze context: ${filePath}`, error);
    return null;
  }
}

// ==================== UTILITIES SCANNER ====================
async function scanUtilities(projectPath: string): Promise<UtilityInfo[]> {
  const utilities: UtilityInfo[] = [];
  
  // Common utility locations
  const utilDirs = [
    'utils',
    'src/utils',
    'lib',
    'src/lib',
    'helpers',
    'src/helpers',
  ];

  for (const dir of utilDirs) {
    const utilDir = path.join(projectPath, dir);
    try {
      await fs.access(utilDir);
      log.info(`Scanning utility directory: ${utilDir}`);
      
      const files = await glob('**/*.{ts,tsx,js,jsx}', { 
        cwd: utilDir,
        ignore: ['**/*.test.*', '**/*.spec.*', '**/use*.{ts,tsx,js,jsx}'] // Exclude hooks
      });

      for (const file of files) {
        const filePath = path.join(utilDir, file);
        const utilInfo = await analyzeUtilityFile(filePath);
        if (utilInfo) {
          utilities.push(utilInfo);
        }
      }
    } catch {
      log.debug(`Utility directory doesn't exist: ${utilDir}`);
    }
  }

  return utilities;
}

async function analyzeUtilityFile(filePath: string): Promise<UtilityInfo | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    
    // Skip if it's a React component (has JSX)
    if (/=>\s*\(?\s*</.test(content) || (content.includes('return') && /<[A-Z]/.test(content))) {
      return null;
    }
    
    // Skip if it's a hook
    if (/export\s+(?:const|function)\s+use[A-Z]/.test(content)) {
      return null;
    }
    
    // Skip if it's a context
    if (content.includes('createContext')) {
      return null;
    }

    // Extract exports
    const exports: string[] = [];
    const exportMatches = content.matchAll(/export\s+(?:const|function|class|type|interface)\s+(\w+)/g);
    for (const match of exportMatches) {
      exports.push(match[1]);
    }
    
    // Also check for export default
    const defaultMatch = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    if (defaultMatch && !exports.includes(defaultMatch[1])) {
      exports.push(defaultMatch[1]);
    }

    if (exports.length === 0) {
      return null;
    }

    return {
      name: fileName.replace(/\.(tsx?|jsx?)$/, ''),
      filePath,
      fileName,
      exports,
      usedIn: [], // Will be populated in buildRelationships
    };
  } catch (error) {
    log.error(`Failed to analyze utility: ${filePath}`, error);
    return null;
  }
}

// ==================== SERVER ACTIONS SCANNER ====================
async function scanServerActionFiles(projectPath: string): Promise<ServerActionFile[]> {
  const serverActionFiles: ServerActionFile[] = [];
  
  log.debug('Scanning for server action files across entire project...');
  
  // Scan ALL TypeScript/JavaScript files in the project for "use server" directive
  // This catches server actions in any directory (components/cart/actions.ts, lib/actions.ts, etc.)
  const pattern = `${projectPath}/**/*.{ts,tsx,js,jsx}`;
  const files = await glob(pattern, {
    ignore: [
      '**/node_modules/**', 
      '**/.next/**', 
      '**/dist/**',
      '**/.explorer/**',
      '**/build/**',
      '**/.git/**'
    ],
  });
  
  log.debug(`Found ${files.length} source files to check for server actions`);
  
  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check if file has "use server" directive (at top of file or in function)
      // Server actions can be:
      // 1. Entire file with "use server" at top
      // 2. Individual functions with "use server" inside
      if (content.includes('"use server"') || content.includes("'use server'")) {
        const exportedFunctions = extractServerActionExports(content);
        
        if (exportedFunctions.length > 0) {
          // Calculate relative path for import resolution
          const relativePath = path.relative(projectPath, filePath);
          
          serverActionFiles.push({
            filePath,
            relativePath,
            exportedFunctions,
          });
          
          log.debug(`Found server action file: ${relativePath} with ${exportedFunctions.length} exports: [${exportedFunctions.join(', ')}]`);
        }
      }
    } catch (error) {
      // Silently skip files that can't be read
    }
  }
  
  log.info(`Server action scan complete: found ${serverActionFiles.length} files`);
  return serverActionFiles;
}

// Extract exported function names from a server action file
function extractServerActionExports(content: string): string[] {
  const exports: string[] = [];
  
  // Match various export patterns:
  // export async function functionName()
  // export const functionName = async () =>
  // export function functionName()
  
  // Pattern 1: export async function name / export function name
  const funcPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  // Pattern 2: export const name = async / export const name = function
  const constPattern = /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  while ((match = constPattern.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  // Pattern 3: export const name = async () => / export const name = () =>
  const arrowPattern = /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w]+)\s*=>/g;
  while ((match = arrowPattern.exec(content)) !== null) {
    if (!exports.includes(match[1])) {
      exports.push(match[1]);
    }
  }
  
  return exports;
}

// ==================== LAYOUT HIERARCHY (Next.js App Router) ====================
async function buildLayoutHierarchy(projectPath: string): Promise<LayoutNode | null> {
  const appDirs = [
    path.join(projectPath, 'app'),
    path.join(projectPath, 'src', 'app'),
  ];

  for (const appDir of appDirs) {
    try {
      await fs.access(appDir);
      log.info(`Building layout hierarchy from: ${appDir}`);
      
      // Find all layout files
      const layoutFiles = await glob('**/layout.{tsx,ts,jsx,js}', { cwd: appDir });
      
      if (layoutFiles.length === 0) {
        return null;
      }

      // Build hierarchy
      const root: LayoutNode = {
        route: '/',
        filePath: '',
        children: [],
      };

      // Sort by path depth (root first)
      layoutFiles.sort((a, b) => a.split('/').length - b.split('/').length);

      for (const file of layoutFiles) {
        const route = '/' + file.replace(/\/layout\.(tsx?|jsx?|js)$/, '').replace(/^\/?/, '');
        const filePath = path.join(appDir, file);
        
        const node: LayoutNode = {
          route: route === '/' ? '/' : route,
          filePath,
          children: [],
        };

        // Find parent and add as child
        if (route === '/' || route === '') {
          root.filePath = filePath;
          root.route = '/';
        } else {
          insertLayoutNode(root, node);
        }
      }

      return root.filePath ? root : null;
    } catch {
      // App directory doesn't exist
    }
  }

  return null;
}

function insertLayoutNode(parent: LayoutNode, node: LayoutNode): boolean {
  // Check if this node should be a direct child of parent
  const parentRoute = parent.route === '/' ? '' : parent.route;
  const nodeRoute = node.route;
  
  // Check if node is under parent
  if (!nodeRoute.startsWith(parentRoute)) {
    return false;
  }

  // Check children first (deeper match)
  for (const child of parent.children) {
    if (insertLayoutNode(child, node)) {
      return true;
    }
  }

  // If no child matched, add to parent
  const remaining = nodeRoute.slice(parentRoute.length);
  const depth = remaining.split('/').filter(Boolean).length;
  
  if (depth === 1 || parent.children.length === 0) {
    parent.children.push(node);
    return true;
  }

  return false;
}

function buildRelationships(
  pages: PageInfo[], 
  components: ComponentInfo[],
  hooks: HookInfo[],
  contexts: ContextInfo[],
  utilities: UtilityInfo[],
  serverActionFiles: ServerActionFile[],
  projectPath: string
): void {
  log.info('Building relationships...');
  
  // Helper to normalize names for matching (handles kebab-case, PascalCase, etc.)
  function normalizeForLookup(name: string): string {
    // Remove hyphens and underscores, convert to lowercase
    return name.replace(/[-_]/g, '').toLowerCase();
  }
  
  // Create maps for quick lookup
  const componentMap = new Map<string, ComponentInfo>();
  for (const component of components) {
    // Register by filename
    componentMap.set(component.name, component);
    componentMap.set(component.name.toLowerCase(), component);
    componentMap.set(normalizeForLookup(component.name), component);
    
    // ALSO register by export names (e.g., DocsSidebarNav from sidebar-nav.tsx)
    // This handles cases where the import name differs from the filename
    for (const exportName of component.exports) {
      componentMap.set(exportName, component);
      componentMap.set(exportName.toLowerCase(), component);
      componentMap.set(normalizeForLookup(exportName), component);
    }
  }
  
  const hookMap = new Map<string, HookInfo>();
  for (const hook of hooks) {
    hookMap.set(hook.name, hook);
    hookMap.set(hook.name.toLowerCase(), hook);
    hookMap.set(normalizeForLookup(hook.name), hook);
  }
  
  const contextMap = new Map<string, ContextInfo>();
  for (const context of contexts) {
    contextMap.set(context.name, context);
    contextMap.set(context.name.toLowerCase(), context);
    contextMap.set(normalizeForLookup(context.name), context);
    contextMap.set(context.providerName, context);
    contextMap.set(context.providerName.toLowerCase(), context);
    contextMap.set(normalizeForLookup(context.providerName), context);
  }
  
  const utilityMap = new Map<string, UtilityInfo>();
  for (const utility of utilities) {
    utilityMap.set(utility.name, utility);
    utilityMap.set(utility.name.toLowerCase(), utility);
    utilityMap.set(normalizeForLookup(utility.name), utility);
    for (const exp of utility.exports) {
      utilityMap.set(exp, utility);
      utilityMap.set(exp.toLowerCase(), utility);
      utilityMap.set(normalizeForLookup(exp), utility);
    }
  }
  
  // Create a map of server action functions to their source files
  // Maps import path patterns to ServerActionFile
  const serverActionMap = new Map<string, ServerActionFile>();
  for (const actionFile of serverActionFiles) {
    // Register by full relative path variations
    serverActionMap.set(actionFile.relativePath, actionFile);
    // Register by common import patterns
    // e.g., "@/lib/actions" -> actions file
    const fileName = path.basename(actionFile.relativePath, path.extname(actionFile.relativePath));
    serverActionMap.set(fileName, actionFile);
    serverActionMap.set(fileName.toLowerCase(), actionFile);
  }

  log.debug(`Maps created: ${componentMap.size} components, ${hookMap.size} hooks, ${contextMap.size} contexts, ${utilityMap.size} utilities, ${serverActionMap.size} server actions`);

  // Find which pages use which components
  let pageComponentLinks = 0;
  for (const page of pages) {
    if (page.componentName) {
      const component = componentMap.get(page.componentName) 
        || componentMap.get(page.componentName.toLowerCase())
        || componentMap.get(normalizeForLookup(page.componentName));
      if (component && !component.usedInPages.includes(page.route)) {
        component.usedInPages.push(page.route);
        pageComponentLinks++;
      }
    }
    
    for (const importName of page.components) {
      const component = componentMap.get(importName) 
        || componentMap.get(importName.toLowerCase())
        || componentMap.get(normalizeForLookup(importName));
      if (component && !component.usedInPages.includes(page.route)) {
        component.usedInPages.push(page.route);
        pageComponentLinks++;
      }
    }
  }
  log.debug(`Found ${pageComponentLinks} page->component links`);

  // Find component relationships
  let componentLinks = 0;
  let hookLinks = 0;
  let contextLinks = 0;
  let utilityLinks = 0;
  
  for (const component of components) {
    for (const importName of component.imports) {
      // Component -> Component
      const usedComponent = componentMap.get(importName) 
        || componentMap.get(importName.toLowerCase())
        || componentMap.get(normalizeForLookup(importName));
      if (usedComponent && usedComponent.name !== component.name) {
        if (!usedComponent.usedInComponents.includes(component.name)) {
          usedComponent.usedInComponents.push(component.name);
          componentLinks++;
        }
      }
      
      // Component -> Hook
      const usedHook = hookMap.get(importName) 
        || hookMap.get(importName.toLowerCase())
        || hookMap.get(normalizeForLookup(importName));
      if (usedHook && !usedHook.usedIn.includes(component.name)) {
        usedHook.usedIn.push(component.name);
        hookLinks++;
      }
      
      // Component -> Context
      const usedContext = contextMap.get(importName)
        || contextMap.get(importName.toLowerCase())
        || contextMap.get(normalizeForLookup(importName));
      if (usedContext && !usedContext.usedIn.includes(component.name)) {
        usedContext.usedIn.push(component.name);
        contextLinks++;
      }
      
      // Component -> Utility
      const usedUtility = utilityMap.get(importName)
        || utilityMap.get(importName.toLowerCase())
        || utilityMap.get(normalizeForLookup(importName));
      if (usedUtility && !usedUtility.usedIn.includes(component.name)) {
        usedUtility.usedIn.push(component.name);
        utilityLinks++;
      }
    }
  }
  
  // Detect server action usage by analyzing component source files
  let serverActionLinks = 0;
  for (const component of components) {
    // Initialize serverActions array if not already
    if (!component.serverActions) {
      component.serverActions = [];
    }
    
    // Check if any of the component's imports reference server action files
    for (const actionFile of serverActionFiles) {
      // Check if component imports from this action file
      const importedActions = findServerActionImports(component.filePath, actionFile, projectPath);
      for (const importedFn of importedActions) {
        if (!component.serverActions.some(sa => sa.functionName === importedFn && sa.sourceFilePath === actionFile.filePath)) {
          component.serverActions.push({
            functionName: importedFn,
            importPath: actionFile.relativePath,
            sourceFilePath: actionFile.filePath,
          });
          serverActionLinks++;
        }
      }
    }
  }
  
  log.debug(`Found ${componentLinks} component->component links`);
  log.debug(`Found ${hookLinks} component->hook links`);
  log.debug(`Found ${contextLinks} component->context links`);
  log.debug(`Found ${utilityLinks} component->utility links`);
  log.debug(`Found ${serverActionLinks} component->serverAction links`);

  // Build transitive dependencies for each component
  log.info('Building transitive dependencies...');
  buildTransitiveDependencies(components, hooks, contexts, utilities);

  log.success(`Relationships built: ${pageComponentLinks} page, ${componentLinks} component, ${hookLinks} hook, ${contextLinks} context, ${utilityLinks} utility, ${serverActionLinks} serverAction links`);
}

// Build transitive dependency chains for components
function buildTransitiveDependencies(
  components: ComponentInfo[],
  hooks: HookInfo[],
  contexts: ContextInfo[],
  utilities: UtilityInfo[]
): void {
  // Create lookup maps
  const componentByName = new Map<string, ComponentInfo>();
  for (const c of components) {
    componentByName.set(c.name, c);
    componentByName.set(c.name.toLowerCase(), c);
    for (const exp of c.exports) {
      componentByName.set(exp, c);
      componentByName.set(exp.toLowerCase(), c);
    }
  }

  const hookByName = new Map<string, HookInfo>();
  for (const h of hooks) {
    hookByName.set(h.name, h);
    hookByName.set(h.name.toLowerCase(), h);
  }

  const contextByName = new Map<string, ContextInfo>();
  for (const c of contexts) {
    contextByName.set(c.name, c);
    contextByName.set(c.providerName, c);
  }

  const utilityByName = new Map<string, UtilityInfo>();
  for (const u of utilities) {
    utilityByName.set(u.name, u);
    for (const exp of u.exports) {
      utilityByName.set(exp, u);
    }
  }

  // Helper function to recursively gather dependencies
  function gatherComponentDeps(
    component: ComponentInfo,
    visited: Set<string>,
    result: { components: Set<string>; hooks: Set<string>; contexts: Set<string>; utilities: Set<string> }
  ): void {
    if (visited.has(component.name)) return;
    visited.add(component.name);

    for (const importName of component.imports) {
      // Check if it's a component
      const depComponent = componentByName.get(importName) || componentByName.get(importName.toLowerCase());
      if (depComponent && depComponent.name !== component.name) {
        result.components.add(depComponent.name);
        // Recursively gather its dependencies
        gatherComponentDeps(depComponent, visited, result);
      }

      // Check if it's a hook
      const depHook = hookByName.get(importName) || hookByName.get(importName.toLowerCase());
      if (depHook) {
        result.hooks.add(depHook.name);
        // Hooks can depend on other hooks
        for (const hookDep of depHook.dependencies) {
          const nestedHook = hookByName.get(hookDep);
          if (nestedHook) {
            result.hooks.add(nestedHook.name);
          }
        }
      }

      // Check if it's a context
      const depContext = contextByName.get(importName);
      if (depContext) {
        result.contexts.add(depContext.name);
      }

      // Check if it's a utility
      const depUtility = utilityByName.get(importName);
      if (depUtility) {
        result.utilities.add(depUtility.name);
      }
    }
  }

  // Build transitive deps for each component
  for (const component of components) {
    const visited = new Set<string>();
    const result = {
      components: new Set<string>(),
      hooks: new Set<string>(),
      contexts: new Set<string>(),
      utilities: new Set<string>(),
    };

    gatherComponentDeps(component, visited, result);

    component.allDependencies = {
      components: [...result.components],
      hooks: [...result.hooks],
      contexts: [...result.contexts],
      utilities: [...result.utilities],
    };
  }

  log.debug(`Built transitive dependencies for ${components.length} components`);
}

// Helper to find which server actions a component imports
function findServerActionImports(componentFilePath: string, actionFile: ServerActionFile, projectPath: string): string[] {
  const imported: string[] = [];
  
  try {
    const content = fsSync.readFileSync(componentFilePath, 'utf-8');
    
    // Look for imports from the action file
    // Handle various import patterns:
    // import { createCart } from "@/lib/actions"
    // import { createCart } from "./actions"
    // import { createCart } from "../lib/actions"
    
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const importedNames = match[1].split(',').map(s => s.trim().split(' as ')[0].trim());
      const importPath = match[2];
      
      // Check if this import could be pointing to our action file
      const isMatchingImport = isImportMatchingActionFile(importPath, actionFile, componentFilePath, projectPath);
      
      if (isMatchingImport) {
        // Check which of the imported names are server actions
        for (const name of importedNames) {
          if (actionFile.exportedFunctions.includes(name)) {
            imported.push(name);
          }
        }
      }
    }
  } catch (error) {
    // Ignore errors reading files
  }
  
  return imported;
}

// Check if an import path resolves to a given action file
function isImportMatchingActionFile(
  importPath: string, 
  actionFile: ServerActionFile, 
  componentFilePath: string, 
  projectPath: string
): boolean {
  // Normalize action file path (remove extension)
  const actionFilePathWithoutExt = actionFile.filePath.replace(/\.(tsx?|jsx?)$/, '');
  const actionFileRelativeWithoutExt = actionFile.relativePath.replace(/\.(tsx?|jsx?)$/, '');
  
  // Handle alias imports like @/lib/actions or ~/lib/actions
  if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
    const aliasPath = importPath.replace(/^[@~]\//, '');
    // Check if the action file's relative path ends with this alias path
    const matches = actionFileRelativeWithoutExt.endsWith(aliasPath) || 
           actionFileRelativeWithoutExt === aliasPath ||
           actionFileRelativeWithoutExt.replace(/^(src\/|app\/|lib\/)/, '').endsWith(aliasPath);
    
    if (matches) {
      log.debug(`Server action import match (alias): ${importPath} → ${actionFile.relativePath}`);
    }
    return matches;
  }
  
  // Handle relative imports like ./actions or ../lib/actions
  if (importPath.startsWith('.')) {
    try {
      const componentDir = path.dirname(componentFilePath);
      const resolvedImport = path.resolve(componentDir, importPath);
      const resolvedImportWithoutExt = resolvedImport.replace(/\.(tsx?|jsx?)$/, '');
      
      const matches = actionFilePathWithoutExt === resolvedImportWithoutExt;
      
      if (matches) {
        log.debug(`Server action import match (relative): ${importPath} → ${actionFile.relativePath}`);
      }
      return matches;
    } catch {
      return false;
    }
  }
  
  // Handle bare imports (from node_modules or path aliases configured elsewhere)
  // e.g., import { action } from 'lib/actions' where tsconfig has paths
  const bareImportWithoutExt = importPath.replace(/\.(tsx?|jsx?)$/, '');
  if (actionFileRelativeWithoutExt.endsWith(bareImportWithoutExt)) {
    log.debug(`Server action import match (bare): ${importPath} → ${actionFile.relativePath}`);
    return true;
  }

  return false;
}

// ==================== STATE MANAGEMENT SCANNER ====================
async function scanStores(projectPath: string): Promise<StoreInfo[]> {
  const stores: StoreInfo[] = [];

  // Common store locations
  const storeDirs = [
    'store',
    'stores',
    'src/store',
    'src/stores',
    'src/state',
    'state',
    'src/redux',
    'redux',
    'src/lib/store',
    'lib/store',
    'src/features', // Redux Toolkit slices often here
    'features',
  ];

  for (const dir of storeDirs) {
    const storeDir = path.join(projectPath, dir);
    try {
      await fs.access(storeDir);
      log.info(`Scanning store directory: ${storeDir}`);

      const files = await glob('**/*.{ts,tsx,js,jsx}', {
        cwd: storeDir,
        ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts']
      });

      for (const file of files) {
        const filePath = path.join(storeDir, file);
        const storeInfo = await analyzeStoreFile(filePath);
        if (storeInfo) {
          stores.push(storeInfo);
        }
      }
    } catch {
      log.debug(`Store directory doesn't exist: ${storeDir}`);
    }
  }

  // Also look for specific store patterns in lib/src directories
  const libDirs = ['lib', 'src/lib', 'src'];
  for (const dir of libDirs) {
    const libDir = path.join(projectPath, dir);
    try {
      await fs.access(libDir);
      // Look for files with store-related names
      const files = await glob('{*store*.{ts,tsx,js,jsx},*slice*.{ts,tsx,js,jsx},*atoms*.{ts,tsx,js,jsx}}', {
        cwd: libDir,
        ignore: ['**/*.test.*', '**/*.spec.*']
      });

      for (const file of files) {
        const filePath = path.join(libDir, file);
        if (!stores.find(s => s.filePath === filePath)) {
          const storeInfo = await analyzeStoreFile(filePath);
          if (storeInfo) {
            stores.push(storeInfo);
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return stores;
}

async function analyzeStoreFile(filePath: string): Promise<StoreInfo | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    let storeType: StoreInfo['type'] = 'unknown';
    const exports: string[] = [];

    // Detect Redux / Redux Toolkit
    if (content.includes('createSlice') || content.includes('configureStore') ||
        content.includes('createStore') || content.includes('combineReducers')) {
      storeType = 'redux';

      // Extract slice name
      const sliceMatch = content.match(/createSlice\s*\(\s*\{[^}]*name:\s*['"](\w+)['"]/);
      if (sliceMatch) {
        exports.push(sliceMatch[1] + 'Slice');
      }

      // Extract exported actions/selectors
      const actionMatches = content.matchAll(/export\s+const\s+(\w+)\s*=/g);
      for (const match of actionMatches) {
        exports.push(match[1]);
      }
    }
    // Detect Zustand
    else if (content.includes('create(') && content.includes('zustand') ||
             content.includes("from 'zustand'") || content.includes('from "zustand"')) {
      storeType = 'zustand';

      // Extract store name
      const storeMatch = content.match(/(?:export\s+)?const\s+(\w+(?:Store|State)?)\s*=\s*create/);
      if (storeMatch) {
        exports.push(storeMatch[1]);
      }
    }
    // Detect Jotai
    else if (content.includes('atom(') ||
             content.includes("from 'jotai'") || content.includes('from "jotai"')) {
      storeType = 'jotai';

      // Extract atom names
      const atomMatches = content.matchAll(/(?:export\s+)?const\s+(\w+(?:Atom)?)\s*=\s*atom/g);
      for (const match of atomMatches) {
        exports.push(match[1]);
      }
    }
    // Detect Recoil
    else if (content.includes('atom({') || content.includes('selector({') ||
             content.includes("from 'recoil'") || content.includes('from "recoil"')) {
      storeType = 'recoil';

      // Extract atom/selector names
      const recoilMatches = content.matchAll(/(?:export\s+)?const\s+(\w+(?:State|Selector)?)\s*=\s*(?:atom|selector)\s*\(/g);
      for (const match of recoilMatches) {
        exports.push(match[1]);
      }
    }
    // Detect MobX
    else if (content.includes('makeObservable') || content.includes('makeAutoObservable') ||
             content.includes('@observable') ||
             content.includes("from 'mobx'") || content.includes('from "mobx"')) {
      storeType = 'mobx';

      // Extract store class names
      const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+Store)/g);
      for (const match of classMatches) {
        exports.push(match[1]);
      }
    }
    // Detect Valtio
    else if (content.includes('proxy(') ||
             content.includes("from 'valtio'") || content.includes('from "valtio"')) {
      storeType = 'valtio';

      // Extract state names
      const proxyMatches = content.matchAll(/(?:export\s+)?const\s+(\w+(?:State|Store)?)\s*=\s*proxy\s*\(/g);
      for (const match of proxyMatches) {
        exports.push(match[1]);
      }
    }

    // If no state management detected, skip this file
    if (storeType === 'unknown') {
      return null;
    }

    const storeName = fileName.replace(/\.(tsx?|jsx?)$/, '');

    return {
      name: storeName,
      filePath,
      fileName,
      type: storeType,
      exports,
      usedIn: [],
    };
  } catch (error) {
    log.error(`Failed to analyze store: ${filePath}`, error);
    return null;
  }
}

// ==================== MIDDLEWARE SCANNER (Next.js) ====================
async function scanMiddleware(projectPath: string): Promise<MiddlewareInfo | null> {
  // Next.js middleware can be at root or in src/
  const possiblePaths = [
    path.join(projectPath, 'middleware.ts'),
    path.join(projectPath, 'middleware.tsx'),
    path.join(projectPath, 'middleware.js'),
    path.join(projectPath, 'middleware.jsx'),
    path.join(projectPath, 'src', 'middleware.ts'),
    path.join(projectPath, 'src', 'middleware.tsx'),
    path.join(projectPath, 'src', 'middleware.js'),
    path.join(projectPath, 'src', 'middleware.jsx'),
  ];

  for (const filePath of possiblePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);

      // Extract matcher patterns
      const matcherPatterns: string[] = [];

      // Pattern 1: export const config = { matcher: [...] }
      const matcherArrayMatch = content.match(/matcher:\s*\[([^\]]+)\]/s);
      if (matcherArrayMatch) {
        const patterns = matcherArrayMatch[1].match(/['"]([^'"]+)['"]/g);
        if (patterns) {
          matcherPatterns.push(...patterns.map(p => p.replace(/['"]/g, '')));
        }
      }

      // Pattern 2: export const config = { matcher: "..." }
      const matcherStringMatch = content.match(/matcher:\s*['"]([^'"]+)['"]/);
      if (matcherStringMatch) {
        matcherPatterns.push(matcherStringMatch[1]);
      }

      log.debug(`Found middleware with ${matcherPatterns.length} matcher patterns`);

      return {
        filePath,
        fileName,
        matcherPatterns,
        usedIn: [],
      };
    } catch {
      // File doesn't exist, continue
    }
  }

  return null;
}

// ==================== API ROUTES SCANNER (Pages Router) ====================
async function scanApiRoutes(projectPath: string): Promise<ApiRouteInfo[]> {
  const apiRoutes: ApiRouteInfo[] = [];

  // API routes in Pages Router are in pages/api or src/pages/api
  const apiDirs = [
    path.join(projectPath, 'pages', 'api'),
    path.join(projectPath, 'src', 'pages', 'api'),
  ];

  for (const apiDir of apiDirs) {
    try {
      await fs.access(apiDir);
      log.info(`Scanning API routes: ${apiDir}`);

      const files = await glob('**/*.{ts,tsx,js,jsx}', {
        cwd: apiDir,
        ignore: ['**/*.test.*', '**/*.spec.*']
      });

      for (const file of files) {
        const filePath = path.join(apiDir, file);
        const apiInfo = await analyzeApiRoute(filePath, file);
        if (apiInfo) {
          apiRoutes.push(apiInfo);
        }
      }
    } catch {
      log.debug(`API directory doesn't exist: ${apiDir}`);
    }
  }

  return apiRoutes;
}

async function analyzeApiRoute(filePath: string, relativePath: string): Promise<ApiRouteInfo | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Convert file path to API route
    let route = '/api/' + relativePath
      .replace(/\.(tsx?|jsx?)$/, '')
      .replace(/\/index$/, '')
      .replace(/\[\.\.\.(\w+)\]/g, '*')  // Catch-all routes
      .replace(/\[(\w+)\]/g, ':$1');      // Dynamic routes

    // Detect HTTP methods used
    const methods: string[] = [];

    // Check for default export handler (handles all methods)
    if (/export\s+default\s+(?:async\s+)?function/.test(content) ||
        /export\s+default\s+handler/.test(content)) {
      // Try to detect method checks inside
      if (content.includes("req.method === 'GET'") || content.includes('req.method === "GET"')) {
        methods.push('GET');
      }
      if (content.includes("req.method === 'POST'") || content.includes('req.method === "POST"')) {
        methods.push('POST');
      }
      if (content.includes("req.method === 'PUT'") || content.includes('req.method === "PUT"')) {
        methods.push('PUT');
      }
      if (content.includes("req.method === 'DELETE'") || content.includes('req.method === "DELETE"')) {
        methods.push('DELETE');
      }
      if (content.includes("req.method === 'PATCH'") || content.includes('req.method === "PATCH"')) {
        methods.push('PATCH');
      }

      // If no specific methods detected, assume all
      if (methods.length === 0) {
        methods.push('*');
      }
    }

    // Check for named exports (Next.js 13+ API routes style)
    if (/export\s+(?:async\s+)?function\s+GET/.test(content)) methods.push('GET');
    if (/export\s+(?:async\s+)?function\s+POST/.test(content)) methods.push('POST');
    if (/export\s+(?:async\s+)?function\s+PUT/.test(content)) methods.push('PUT');
    if (/export\s+(?:async\s+)?function\s+DELETE/.test(content)) methods.push('DELETE');
    if (/export\s+(?:async\s+)?function\s+PATCH/.test(content)) methods.push('PATCH');
    if (/export\s+(?:async\s+)?function\s+HEAD/.test(content)) methods.push('HEAD');
    if (/export\s+(?:async\s+)?function\s+OPTIONS/.test(content)) methods.push('OPTIONS');

    // Deduplicate methods
    const uniqueMethods = [...new Set(methods)];

    return {
      route,
      filePath,
      fileName,
      methods: uniqueMethods.length > 0 ? uniqueMethods : ['*'],
    };
  } catch (error) {
    log.error(`Failed to analyze API route: ${filePath}`, error);
    return null;
  }
}
