// Simple AST-like parsing without heavy dependencies
// For production, consider using @babel/parser or ts-morph

// Logging utility
const log = {
  debug: (msg: string, data?: any) => {
    console.log(`\x1b[90m[PARSER 🔍]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  warn: (msg: string, data?: any) => {
    console.log(`\x1b[33m[PARSER ⚠]\x1b[0m ${msg}`, data !== undefined ? data : '');
  }
};

export interface ParsedFile {
  imports: ImportInfo[];
  enhancedImports: EnhancedImportInfo[];
  exports: string[];
  links: string[];
  dataDependencies: DataDependency[];
  props: PropInfo[];
  hasClientDirective: boolean;
  hasServerDirective: boolean;
  content: string;
}

export interface ImportInfo {
  name: string;
  source: string;
  isLocal: boolean;
  isDefault: boolean;
}

// Enhanced import info with more details
export interface EnhancedImportInfo {
  names: string[];           // All imported names
  aliases: Record<string, string>; // name -> alias mapping
  source: string;
  isLocal: boolean;
  isDefault: boolean;
  isNamespace: boolean;      // import * as X
  isTypeOnly: boolean;       // import type { X }
  isSideEffect: boolean;     // import './styles.css'
  namespaceName?: string;    // For import * as X, this is X
}

export interface DataDependency {
  type: 'fetch' | 'prisma' | 'drizzle' | 'useQuery' | 'useSWR' | 'serverAction' | 'trpc' | 'graphql' | 'axios' | 'unknown';
  source: string;
  line: number;
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

export function parseFile(content: string): ParsedFile {
  log.debug(`Parsing file (${content.length} chars)`);

  const imports = parseImports(content);
  log.debug(`Found ${imports.length} imports`);

  const enhancedImports = parseImportsEnhanced(content);
  log.debug(`Found ${enhancedImports.length} enhanced imports`);

  const exports = parseExports(content);
  log.debug(`Found ${exports.length} exports`);

  const links = parseLinks(content);
  log.debug(`Found ${links.length} links`);

  const dataDependencies = parseDataDependencies(content);
  log.debug(`Found ${dataDependencies.length} data dependencies`);

  const hasClientDirective = content.includes("'use client'") || content.includes('"use client"');
  const hasServerDirective = content.includes("'use server'") || content.includes('"use server"');
  log.debug(`Has 'use client' directive: ${hasClientDirective}`);
  log.debug(`Has 'use server' directive: ${hasServerDirective}`);

  return {
    imports,
    enhancedImports,
    exports,
    links,
    dataDependencies,
    props: [], // Will be extracted separately with component name context
    hasClientDirective,
    hasServerDirective,
    content,
  };
}

function parseImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  let match;

  // Default imports: import Something from 'source'
  const importDefaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importDefaultRegex.exec(content)) !== null) {
    const [, name, source] = match;
    if (name && source) {
      const importInfo: ImportInfo = {
        name,
        source,
        isLocal: isLocalImport(source),
        isDefault: true,
      };
      imports.push(importInfo);
      log.debug(`Import (default): ${name} from "${source}" (local: ${importInfo.isLocal})`);
    }
  }

  // Named imports: import { A, B } from 'source'
  const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = namedImportRegex.exec(content)) !== null) {
    const [, names, source] = match;
    if (names && source) {
      const nameList = names.split(',').map(n => {
        const trimmed = n.trim();
        // Handle "Name as Alias" syntax - extract the original name
        const parts = trimmed.split(/\s+as\s+/);
        return parts[0].trim();
      });
      for (const name of nameList) {
        if (name && !name.startsWith('type ')) {
          const importInfo: ImportInfo = {
            name,
            source,
            isLocal: isLocalImport(source),
            isDefault: false,
          };
          imports.push(importInfo);
          log.debug(`Import (named): ${name} from "${source}" (local: ${importInfo.isLocal})`);
        }
      }
    }
  }

  // Namespace imports: import * as X from 'source'
  const namespaceImportRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = namespaceImportRegex.exec(content)) !== null) {
    const [, name, source] = match;
    if (name && source) {
      const importInfo: ImportInfo = {
        name,
        source,
        isLocal: isLocalImport(source),
        isDefault: false,
      };
      imports.push(importInfo);
      log.debug(`Import (namespace): * as ${name} from "${source}" (local: ${importInfo.isLocal})`);
    }
  }

  return imports;
}

// Enhanced import parsing with full details
export function parseImportsEnhanced(content: string): EnhancedImportInfo[] {
  const imports: EnhancedImportInfo[] = [];

  // Comprehensive import regex that handles all cases
  const importRegex = /import\s+(?:(type)\s+)?(?:(\w+)\s*,?\s*)?(?:\*\s+as\s+(\w+)\s*)?(?:\{([^}]*)\})?\s*(?:from\s+)?['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const [fullMatch, typeKeyword, defaultName, namespaceName, namedImports, source] = match;

    // Side-effect import: import './styles.css'
    if (!defaultName && !namespaceName && !namedImports) {
      imports.push({
        names: [],
        aliases: {},
        source,
        isLocal: isLocalImport(source),
        isDefault: false,
        isNamespace: false,
        isTypeOnly: !!typeKeyword,
        isSideEffect: true,
      });
      log.debug(`Import (side-effect): "${source}"`);
      continue;
    }

    const names: string[] = [];
    const aliases: Record<string, string> = {};

    // Default import
    if (defaultName) {
      names.push(defaultName);
    }

    // Namespace import
    if (namespaceName) {
      names.push(namespaceName);
    }

    // Named imports
    if (namedImports) {
      const namedList = namedImports.split(',');
      for (const named of namedList) {
        const trimmed = named.trim();
        if (!trimmed) continue;

        // Handle type imports within named: { type Foo, Bar }
        const isTypeImport = trimmed.startsWith('type ');
        const cleanName = isTypeImport ? trimmed.replace(/^type\s+/, '') : trimmed;

        // Handle aliases: { Foo as Bar }
        const aliasMatch = cleanName.match(/^(\w+)\s+as\s+(\w+)$/);
        if (aliasMatch) {
          names.push(aliasMatch[1]);
          aliases[aliasMatch[1]] = aliasMatch[2];
        } else {
          names.push(cleanName);
        }
      }
    }

    imports.push({
      names,
      aliases,
      source,
      isLocal: isLocalImport(source),
      isDefault: !!defaultName,
      isNamespace: !!namespaceName,
      isTypeOnly: !!typeKeyword,
      isSideEffect: false,
      namespaceName,
    });

    log.debug(`Import (enhanced): [${names.join(', ')}] from "${source}"`);
  }

  return imports;
}

// Check if an import source is local (not from node_modules)
function isLocalImport(source: string): boolean {
  return (
    source.startsWith('.') ||
    source.startsWith('@/') ||
    source.startsWith('~/') ||
    source.startsWith('#') ||
    source.startsWith('$') ||
    // Check for monorepo-style imports that start with @org/
    // but only if they don't look like scoped packages
    false
  );
}

function parseExports(content: string): string[] {
  const exports: string[] = [];

  // export default function Name
  const defaultFuncMatch = content.match(/export\s+default\s+function\s+(\w+)/);
  if (defaultFuncMatch) {
    exports.push(defaultFuncMatch[1]);
    log.debug(`Export (default function): ${defaultFuncMatch[1]}`);
  }

  // export default Name (but not export default function/class/etc)
  const defaultMatch = content.match(/export\s+default\s+(?!function|class|async)(\w+)/);
  if (defaultMatch && !exports.includes(defaultMatch[1])) {
    exports.push(defaultMatch[1]);
    log.debug(`Export (default): ${defaultMatch[1]}`);
  }

  // export default class Name
  const defaultClassMatch = content.match(/export\s+default\s+class\s+(\w+)/);
  if (defaultClassMatch && !exports.includes(defaultClassMatch[1])) {
    exports.push(defaultClassMatch[1]);
    log.debug(`Export (default class): ${defaultClassMatch[1]}`);
  }

  // export function Name / export async function Name
  const funcMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
  for (const match of funcMatches) {
    if (!exports.includes(match[1])) {
      exports.push(match[1]);
      log.debug(`Export (function): ${match[1]}`);
    }
  }

  // export const Name
  const constMatches = content.matchAll(/export\s+const\s+(\w+)/g);
  for (const match of constMatches) {
    if (!exports.includes(match[1])) {
      exports.push(match[1]);
      log.debug(`Export (const): ${match[1]}`);
    }
  }

  // export class Name
  const classMatches = content.matchAll(/export\s+class\s+(\w+)/g);
  for (const match of classMatches) {
    if (!exports.includes(match[1])) {
      exports.push(match[1]);
      log.debug(`Export (class): ${match[1]}`);
    }
  }

  // export let/var Name
  const letVarMatches = content.matchAll(/export\s+(?:let|var)\s+(\w+)/g);
  for (const match of letVarMatches) {
    if (!exports.includes(match[1])) {
      exports.push(match[1]);
      log.debug(`Export (let/var): ${match[1]}`);
    }
  }

  // Named re-exports: export { Name } from './file' or export { Name }
  const reExportMatches = content.matchAll(/export\s+\{([^}]+)\}/g);
  for (const match of reExportMatches) {
    const names = match[1].split(',');
    for (const name of names) {
      const trimmed = name.trim();
      // Handle "Name as Alias" - use the alias as the export name
      const aliasMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
      const exportName = aliasMatch ? aliasMatch[2] : trimmed;
      if (exportName && !exports.includes(exportName)) {
        exports.push(exportName);
        log.debug(`Export (re-export): ${exportName}`);
      }
    }
  }

  return exports;
}

function parseLinks(content: string): string[] {
  const links: string[] = [];
  let match;

  // Match <Link href="..."> patterns (Next.js)
  const linkRegex = /<Link[^>]*href=["'{]([^"'}`]+)["'}`]/g;
  while ((match = linkRegex.exec(content)) !== null) {
    const href = match[1];
    // Filter out external links and dynamic paths we can't resolve
    if (href.startsWith('/') && !href.includes('${')) {
      links.push(href);
      log.debug(`Link found: ${href}`);
    }
  }

  // Match <NavLink to="..."> patterns (React Router)
  const navLinkRegex = /<NavLink[^>]*to=["'{]([^"'}`]+)["'}`]/g;
  while ((match = navLinkRegex.exec(content)) !== null) {
    const to = match[1];
    if (to.startsWith('/') && !to.includes('${')) {
      links.push(to);
      log.debug(`NavLink found: ${to}`);
    }
  }

  // Match <Link to="..."> patterns (React Router - note: different from Next.js)
  const routerLinkRegex = /<Link[^>]*to=["'{]([^"'}`]+)["'}`]/g;
  while ((match = routerLinkRegex.exec(content)) !== null) {
    const to = match[1];
    if (to.startsWith('/') && !to.includes('${')) {
      if (!links.includes(to)) {
        links.push(to);
        log.debug(`Router Link found: ${to}`);
      }
    }
  }

  // Match router.push('...') patterns
  const routerPushRegex = /router\.push\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = routerPushRegex.exec(content)) !== null) {
    const route = match[1];
    if (route.startsWith('/')) {
      links.push(route);
      log.debug(`Router.push found: ${route}`);
    }
  }

  // Match router.replace('...') patterns
  const routerReplaceRegex = /router\.replace\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = routerReplaceRegex.exec(content)) !== null) {
    const route = match[1];
    if (route.startsWith('/')) {
      links.push(route);
      log.debug(`Router.replace found: ${route}`);
    }
  }

  // Match navigate('...') patterns (React Router v6)
  const navigateRegex = /navigate\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = navigateRegex.exec(content)) !== null) {
    const route = match[1];
    if (route.startsWith('/')) {
      links.push(route);
      log.debug(`Navigate found: ${route}`);
    }
  }

  // Match useRouter redirect patterns (Next.js)
  const redirectRegex = /redirect\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = redirectRegex.exec(content)) !== null) {
    const route = match[1];
    if (route.startsWith('/')) {
      links.push(route);
      log.debug(`Redirect found: ${route}`);
    }
  }

  // Match permanentRedirect patterns (Next.js 14+)
  const permRedirectRegex = /permanentRedirect\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((match = permRedirectRegex.exec(content)) !== null) {
    const route = match[1];
    if (route.startsWith('/')) {
      links.push(route);
      log.debug(`PermanentRedirect found: ${route}`);
    }
  }

  const uniqueLinks = [...new Set(links)];
  log.debug(`Total unique links: ${uniqueLinks.length}`);
  return uniqueLinks;
}

function parseDataDependencies(content: string): DataDependency[] {
  const deps: DataDependency[] = [];

  // Multi-line aware parsing - join content and track positions
  const lines = content.split('\n');

  // Track which lines we've already matched to avoid duplicates
  const matchedLines = new Set<number>();

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // fetch() calls - single line
    const fetchMatch = line.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (fetchMatch) {
      deps.push({ type: 'fetch', source: fetchMatch[1], line: lineNum });
      matchedLines.add(lineNum);
      log.debug(`Data dep (fetch): ${fetchMatch[1]} at line ${lineNum}`);
    }

    // fetch() with template literal or variable - just note it exists
    const fetchVarMatch = line.match(/fetch\s*\(\s*(?:`[^`]*\$\{|[\w.]+)/);
    if (fetchVarMatch && !matchedLines.has(lineNum)) {
      deps.push({ type: 'fetch', source: '(dynamic URL)', line: lineNum });
      matchedLines.add(lineNum);
      log.debug(`Data dep (fetch - dynamic): at line ${lineNum}`);
    }

    // Prisma patterns
    const prismaMatch = line.match(/prisma\.(\w+)\.(\w+)/);
    if (prismaMatch) {
      const source = `prisma.${prismaMatch[1]}.${prismaMatch[2]}()`;
      deps.push({ type: 'prisma', source, line: lineNum });
      log.debug(`Data dep (prisma): ${source} at line ${lineNum}`);
    }

    // Drizzle patterns
    const drizzleMatch = line.match(/db\.(?:select|insert|update|delete|query)/);
    if (drizzleMatch) {
      deps.push({ type: 'drizzle', source: line.trim(), line: lineNum });
      log.debug(`Data dep (drizzle): at line ${lineNum}`);
    }

    // React Query / TanStack Query - various patterns
    const useQueryMatch = line.match(/useQuery\s*[<(]/);
    if (useQueryMatch) {
      // Try to extract the query key
      const keyMatch = line.match(/useQuery\s*(?:<[^>]*>)?\s*\(\s*(?:\[?\s*['"`]([^'"`\]]+)['"`]|(\{))/);
      const source = keyMatch?.[1] || '(query)';
      deps.push({ type: 'useQuery', source, line: lineNum });
      log.debug(`Data dep (useQuery): ${source} at line ${lineNum}`);
    }

    // useMutation (TanStack Query)
    const useMutationMatch = line.match(/useMutation\s*[<(]/);
    if (useMutationMatch) {
      deps.push({ type: 'useQuery', source: '(mutation)', line: lineNum });
      log.debug(`Data dep (useMutation): at line ${lineNum}`);
    }

    // useInfiniteQuery (TanStack Query)
    const useInfiniteMatch = line.match(/useInfiniteQuery\s*[<(]/);
    if (useInfiniteMatch) {
      deps.push({ type: 'useQuery', source: '(infinite query)', line: lineNum });
      log.debug(`Data dep (useInfiniteQuery): at line ${lineNum}`);
    }

    // SWR
    const useSWRMatch = line.match(/useSWR\s*[<(]\s*['"`]([^'"`]+)['"`]/);
    if (useSWRMatch) {
      deps.push({ type: 'useSWR', source: useSWRMatch[1], line: lineNum });
      log.debug(`Data dep (useSWR): ${useSWRMatch[1]} at line ${lineNum}`);
    }

    // useSWRMutation
    const useSWRMutationMatch = line.match(/useSWRMutation\s*[<(]\s*['"`]([^'"`]+)['"`]/);
    if (useSWRMutationMatch) {
      deps.push({ type: 'useSWR', source: useSWRMutationMatch[1] + ' (mutation)', line: lineNum });
      log.debug(`Data dep (useSWRMutation): at line ${lineNum}`);
    }

    // tRPC patterns
    const trpcMatch = line.match(/trpc\.(\w+)\.(\w+)\.(?:useQuery|useMutation|query|mutate)/);
    if (trpcMatch) {
      const source = `trpc.${trpcMatch[1]}.${trpcMatch[2]}`;
      deps.push({ type: 'trpc', source, line: lineNum });
      log.debug(`Data dep (trpc): ${source} at line ${lineNum}`);
    }

    // Alternative tRPC pattern: api.router.procedure
    const trpcAltMatch = line.match(/api\.(\w+)\.(\w+)\.(?:useQuery|useMutation)/);
    if (trpcAltMatch) {
      const source = `api.${trpcAltMatch[1]}.${trpcAltMatch[2]}`;
      deps.push({ type: 'trpc', source, line: lineNum });
      log.debug(`Data dep (trpc alt): ${source} at line ${lineNum}`);
    }

    // GraphQL patterns
    const gqlMatch = line.match(/(?:useQuery|useMutation|useLazyQuery|useSubscription)\s*\(\s*(?:gql`|[A-Z_]+_(?:QUERY|MUTATION))/);
    if (gqlMatch) {
      deps.push({ type: 'graphql', source: '(GraphQL operation)', line: lineNum });
      log.debug(`Data dep (graphql): at line ${lineNum}`);
    }

    // Apollo Client patterns
    const apolloMatch = line.match(/client\.(?:query|mutate|subscribe)\s*\(/);
    if (apolloMatch) {
      deps.push({ type: 'graphql', source: '(Apollo operation)', line: lineNum });
      log.debug(`Data dep (apollo): at line ${lineNum}`);
    }

    // Axios patterns
    const axiosMatch = line.match(/axios\.(?:get|post|put|patch|delete|request)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (axiosMatch) {
      deps.push({ type: 'axios', source: axiosMatch[1], line: lineNum });
      log.debug(`Data dep (axios): ${axiosMatch[1]} at line ${lineNum}`);
    }

    // Axios instance patterns
    const axiosInstanceMatch = line.match(/(?:api|client|http|instance)\.(?:get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (axiosInstanceMatch && !axiosMatch) {
      deps.push({ type: 'axios', source: axiosInstanceMatch[1], line: lineNum });
      log.debug(`Data dep (axios instance): ${axiosInstanceMatch[1]} at line ${lineNum}`);
    }

    // Server actions - file-level directive
    if (line.includes("'use server'") || line.includes('"use server"')) {
      deps.push({ type: 'serverAction', source: 'Server Action', line: lineNum });
      log.debug(`Data dep (serverAction): at line ${lineNum}`);
    }
  });

  // Multi-line fetch detection
  const multiLineFetchRegex = /fetch\s*\(\s*\n?\s*['"`]([^'"`]+)['"`]/g;
  let multiMatch;
  while ((multiMatch = multiLineFetchRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, multiMatch.index).split('\n').length;
    if (!matchedLines.has(lineNum)) {
      deps.push({ type: 'fetch', source: multiMatch[1], line: lineNum });
      log.debug(`Data dep (fetch - multiline): ${multiMatch[1]} at line ${lineNum}`);
    }
  }

  // Multi-line useQuery detection
  const multiLineQueryRegex = /useQuery\s*(?:<[^>]*>)?\s*\(\s*\n?\s*\[?\s*['"`]([^'"`\]]+)['"`]/g;
  while ((multiMatch = multiLineQueryRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, multiMatch.index).split('\n').length;
    // Check if we already have this
    if (!deps.some(d => d.type === 'useQuery' && d.line === lineNum)) {
      deps.push({ type: 'useQuery', source: multiMatch[1], line: lineNum });
      log.debug(`Data dep (useQuery - multiline): ${multiMatch[1]} at line ${lineNum}`);
    }
  }

  return deps;
}

export function extractImports(parsed: ParsedFile, localOnly: boolean): string[] {
  const result = parsed.imports
    .filter(imp => !localOnly || imp.isLocal)
    .map(imp => imp.name);
  log.debug(`Extracted ${result.length} imports (localOnly: ${localOnly})`);
  return result;
}

export function extractLinks(parsed: ParsedFile): string[] {
  return parsed.links;
}

export function extractDataDependencies(parsed: ParsedFile): DataDependency[] {
  return parsed.dataDependencies;
}

export function isClientComponent(content: string): boolean {
  // Check for 'use client' directive at the top (within first 500 chars to handle comments)
  const firstLines = content.slice(0, 500);
  const result = firstLines.includes("'use client'") || firstLines.includes('"use client"');
  log.debug(`Is client component: ${result}`);
  return result;
}

export function isServerComponent(content: string): boolean {
  // Check for 'use server' directive at the top
  const firstLines = content.slice(0, 500);
  const result = firstLines.includes("'use server'") || firstLines.includes('"use server"');
  log.debug(`Is server component/action: ${result}`);
  return result;
}

export function extractProps(parsed: ParsedFile, componentName: string): PropInfo[] {
  const props: PropInfo[] = [];
  const content = parsed.content;

  log.debug(`Extracting props for component: ${componentName}`);

  // Try to find interface or type definition for props
  // Pattern 1: interface ComponentNameProps { ... }
  const interfaceRegex = new RegExp(`interface\\s+${componentName}Props\\s*(?:extends[^{]+)?\\{([^}]+)\\}`, 's');
  const interfaceMatch = content.match(interfaceRegex);

  // Pattern 2: type ComponentNameProps = { ... }
  const typeRegex = new RegExp(`type\\s+${componentName}Props\\s*=\\s*\\{([^}]+)\\}`, 's');
  const typeMatch = content.match(typeRegex);

  // Pattern 3: function Component({ prop1, prop2 }: { prop1: Type1, prop2: Type2 })
  const inlinePropsRegex = new RegExp(`function\\s+${componentName}\\s*\\(\\s*\\{([^}]+)\\}\\s*:\\s*\\{([^}]+)\\}`, 's');
  const inlineMatch = content.match(inlinePropsRegex);

  // Pattern 4: const Component = ({ prop1, prop2 }: Props) =>
  const arrowPropsRegex = new RegExp(`(?:const|let)\\s+${componentName}\\s*=\\s*\\(\\s*\\{([^}]+)\\}\\s*:\\s*(\\w+)`, 's');
  const arrowMatch = content.match(arrowPropsRegex);

  // Pattern 5: Generic props interface: interface Props { ... } (common pattern)
  const genericInterfaceRegex = /interface\s+Props\s*(?:extends[^{]+)?\{([^}]+)\}/s;
  const genericInterfaceMatch = content.match(genericInterfaceRegex);

  // Pattern 6: type Props = { ... }
  const genericTypeRegex = /type\s+Props\s*=\s*\{([^}]+)\}/s;
  const genericTypeMatch = content.match(genericTypeRegex);

  const propsDefinition =
    interfaceMatch?.[1] ||
    typeMatch?.[1] ||
    inlineMatch?.[2] ||
    genericInterfaceMatch?.[1] ||
    genericTypeMatch?.[1] ||
    '';

  if (interfaceMatch) log.debug(`Found interface ${componentName}Props`);
  if (typeMatch) log.debug(`Found type ${componentName}Props`);
  if (inlineMatch) log.debug(`Found inline props definition`);
  if (arrowMatch) log.debug(`Found arrow function props`);
  if (genericInterfaceMatch) log.debug(`Found generic Props interface`);
  if (genericTypeMatch) log.debug(`Found generic Props type`);

  if (propsDefinition) {
    // Parse prop definitions
    const propLines = propsDefinition.split(/[;\n]/).filter(line => line.trim());

    for (const line of propLines) {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('/*')) continue;

      const propMatch = line.match(/^\s*(\w+)(\??):\s*(.+?)\s*$/);
      if (propMatch) {
        const [, name, optional, type] = propMatch;
        const propInfo: PropInfo = {
          name,
          type: type.trim(),
          required: optional !== '?',
        };
        props.push(propInfo);
        log.debug(`Prop found: ${name}${optional ? '?' : ''}: ${type.trim()}`);
      }
    }
  }

  log.debug(`Total props extracted: ${props.length}`);
  return props;
}

// ==================== JSX DETECTION ====================

/**
 * Improved JSX detection that reduces false positives
 * Uses multiple heuristics to determine if a file contains React JSX
 */
export function hasReactJSX(content: string): boolean {
  // Quick rejection: if no < at all, definitely no JSX
  if (!content.includes('<')) {
    return false;
  }

  // Check for common React imports (strong signal)
  const hasReactImport = /import\s+(?:React|\{[^}]*\})\s+from\s+['"]react['"]/.test(content);

  // Check for JSX pragma
  const hasJSXPragma = /\/\*\*?\s*@jsx\s/.test(content);

  // Pattern 1: Function/arrow returning JSX - look for return with JSX element
  // This is more precise: must have return followed by ( and then < with capital letter or fragment
  const hasReturnJSX = /return\s*\(\s*<(?:[A-Z]|>)/.test(content);

  // Pattern 2: Arrow function with implicit JSX return: () => <Component or () => <>
  const hasArrowJSX = /=>\s*\(?\s*<(?:[A-Z]|>)/.test(content);

  // Pattern 3: React.createElement (explicit API)
  const hasCreateElement = /React\.createElement\s*\(/.test(content);

  // Pattern 4: forwardRef with JSX
  const hasForwardRefJSX = /forwardRef\s*\([^)]*\)\s*(?:=>|{)/.test(content) && content.includes('<');

  // Pattern 5: JSX in variable assignment: const x = <Component
  const hasJSXAssignment = /(?:const|let|var)\s+\w+\s*=\s*<[A-Z]/.test(content);

  // Pattern 6: JSX spread in element: <Component {...props}
  const hasJSXSpread = /<[A-Z]\w*[^>]*\{\.\.\.\w+\}/.test(content);

  // Negative signals - things that look like JSX but aren't

  // Generic type parameters: Array<T>, Map<K, V>, etc.
  // Count how many < are followed by type parameters vs JSX
  const genericTypeCount = (content.match(/<[A-Z]\w*(?:,\s*[A-Z]\w*)*>/g) || []).length;
  const jsxElementCount = (content.match(/<[A-Z]\w*[\s>\/]/g) || []).length;

  // If most < followed by capital letters are generics, likely not JSX
  if (genericTypeCount > 0 && jsxElementCount === 0) {
    // All capital-letter < are likely generics
    // But still check for other JSX patterns
    if (!hasReturnJSX && !hasArrowJSX && !hasCreateElement) {
      return false;
    }
  }

  // XML/HTML in strings - check if < is inside quotes
  const stringContentRemoved = content.replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
  const jsxInCode = /<[A-Z]/.test(stringContentRemoved);

  // Final decision
  const hasJSX =
    hasReturnJSX ||
    hasArrowJSX ||
    hasCreateElement ||
    hasForwardRefJSX ||
    hasJSXAssignment ||
    (hasReactImport && jsxInCode) ||
    hasJSXPragma ||
    hasJSXSpread;

  log.debug(`JSX detection result: ${hasJSX} (returnJSX: ${hasReturnJSX}, arrowJSX: ${hasArrowJSX}, createElement: ${hasCreateElement})`);

  return hasJSX;
}

/**
 * Extract the actual exported component/function names from a file
 */
export function extractExportedComponentNames(content: string): string[] {
  const names: string[] = [];

  // export default function ComponentName
  const defaultFuncMatch = content.match(/export\s+default\s+function\s+([A-Z]\w*)/);
  if (defaultFuncMatch) {
    names.push(defaultFuncMatch[1]);
  }

  // export default class ComponentName
  const defaultClassMatch = content.match(/export\s+default\s+class\s+([A-Z]\w*)/);
  if (defaultClassMatch) {
    names.push(defaultClassMatch[1]);
  }

  // export function ComponentName (capital letter = likely component)
  const funcMatches = content.matchAll(/export\s+(?:async\s+)?function\s+([A-Z]\w*)/g);
  for (const match of funcMatches) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  // export const ComponentName = (capital letter start)
  const constMatches = content.matchAll(/export\s+const\s+([A-Z]\w*)\s*=/g);
  for (const match of constMatches) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  // const ComponentName = ... ; export default ComponentName
  const defaultExportMatch = content.match(/export\s+default\s+([A-Z]\w*)\s*[;\n]/);
  if (defaultExportMatch && !names.includes(defaultExportMatch[1])) {
    // Verify this name is defined in the file
    const isDefinedRegex = new RegExp(`(?:const|let|var|function|class)\\s+${defaultExportMatch[1]}\\b`);
    if (isDefinedRegex.test(content)) {
      names.push(defaultExportMatch[1]);
    }
  }

  // forwardRef pattern: export const Component = forwardRef(
  const forwardRefMatches = content.matchAll(/export\s+const\s+([A-Z]\w*)\s*=\s*(?:React\.)?forwardRef/g);
  for (const match of forwardRefMatches) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  // memo pattern: export const Component = memo(
  const memoMatches = content.matchAll(/export\s+const\s+([A-Z]\w*)\s*=\s*(?:React\.)?memo/g);
  for (const match of memoMatches) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  return names;
}

// ==================== HOOK DETECTION ====================

/**
 * Extract all hook exports from a file (not just those starting with use*)
 */
export function extractHookExports(content: string): string[] {
  const hooks: string[] = [];

  // export function useSomething
  const funcMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(use[A-Z]\w*)/g);
  for (const match of funcMatches) {
    hooks.push(match[1]);
  }

  // export const useSomething =
  const constMatches = content.matchAll(/export\s+const\s+(use[A-Z]\w*)\s*=/g);
  for (const match of constMatches) {
    if (!hooks.includes(match[1])) {
      hooks.push(match[1]);
    }
  }

  // export default function useSomething
  const defaultMatch = content.match(/export\s+default\s+function\s+(use[A-Z]\w*)/);
  if (defaultMatch && !hooks.includes(defaultMatch[1])) {
    hooks.push(defaultMatch[1]);
  }

  return hooks;
}

/**
 * Check if content defines a custom React hook
 */
export function hasHookDefinition(content: string): boolean {
  // Must export a function starting with 'use' and capital letter
  return /export\s+(?:const|function|default\s+function)\s+use[A-Z]/.test(content);
}
