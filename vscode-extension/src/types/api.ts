// Types copied from src/lib/api.ts for VSCode extension

export interface PageInfo {
  route: string;
  filePath: string;
  fileName: string;
  isLayout?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  componentName?: string;
  components: string[];
  linksTo: string[];
  dataDependencies: DataDependency[];
}

export interface ServerActionDependency {
  functionName: string;
  importPath: string;
  sourceFilePath: string;
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
  dataDependencies: DataDependency[];
  serverActions: ServerActionDependency[];
}

export interface DataDependency {
  type: 'fetch' | 'prisma' | 'drizzle' | 'useQuery' | 'useSWR' | 'serverAction' | 'unknown';
  source: string;
  line: number;
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

export interface HookInfo {
  name: string;
  filePath: string;
  fileName: string;
  description?: string;
  dependencies: string[];
  usedIn: string[];
}

export interface ContextInfo {
  name: string;
  filePath: string;
  fileName: string;
  providerName: string;
  usedIn: string[];
}

export interface UtilityInfo {
  name: string;
  filePath: string;
  fileName: string;
  exports: string[];
  usedIn: string[];
}

export interface LayoutNode {
  route: string;
  filePath: string;
  children: LayoutNode[];
}

export type RouterType = 'nextjs-app' | 'nextjs-pages' | 'react-router' | 'unknown';

export interface ServerActionFile {
  filePath: string;
  relativePath: string;
  exportedFunctions: string[];
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
  serverActionFiles: ServerActionFile[];
  layoutHierarchy: LayoutNode | null;
  scannedAt: string;
  fromCache?: boolean;
}

export interface ScanOverviewData {
  projectPath: string;
  projectName: string;
  framework: 'nextjs' | 'react' | 'unknown';
  routerType: RouterType;
  scannedAt: string;
  fromCache?: boolean;
  cachedAt?: string;
  counts: {
    pages: number;
    layouts: number;
    components: number;
    hooks: number;
    contexts: number;
    utilities: number;
    serverActionFiles: number;
  };
  stories: {
    pagesWithStories: number;
    componentsWithStories: number;
    totalPageStories: number;
    totalComponentStories: number;
  };
}

export type LLMProvider = 'local' | 'openai' | 'openrouter';

export interface LLMGenerateResult {
  success: boolean;
  message: string;
  provider?: LLMProvider;
  model?: string;
  stories?: {
    stories: Array<{ id: string; name: string }>;
  };
  filePath?: string;
  error?: string;
  hint?: string;
}
