/**
 * Build Config Injector - Modifies build configs to enable server action mocking
 * 
 * This module handles the injection of module aliases into build configurations
 * (vite.config.ts, next.config.js, etc.) to redirect server action imports to
 * mock implementations during preview mode.
 */

import fs from 'fs/promises';
import path from 'path';
import { RouterType } from './scanner.js';
import { getMockFilePath, MockServerActionsConfig } from './mock-generator.js';

// Logging utility
const log = {
  info: (msg: string, data?: any) => {
    console.log(`\x1b[34m[BUILD-CONFIG]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  success: (msg: string, data?: any) => {
    console.log(`\x1b[32m[BUILD-CONFIG ✓]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  warn: (msg: string, data?: any) => {
    console.log(`\x1b[33m[BUILD-CONFIG ⚠]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  error: (msg: string, data?: any) => {
    console.log(`\x1b[31m[BUILD-CONFIG ✗]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  debug: (msg: string, data?: any) => {
    console.log(`\x1b[90m[BUILD-CONFIG 🔍]\x1b[0m ${msg}`, data !== undefined ? data : '');
  }
};

// Marker comments to identify our injected code
const EXPLORER_START_MARKER = '// === EXPLORER SERVER ACTION MOCKING START ===';
const EXPLORER_END_MARKER = '// === EXPLORER SERVER ACTION MOCKING END ===';

export interface BuildConfigResult {
  success: boolean;
  message: string;
  configFile?: string;
  backupFile?: string;
  aliasesAdded?: string[];
}

/**
 * Inject server action mocking into the build configuration
 */
export async function injectBuildConfig(
  projectPath: string,
  routerType: RouterType,
  mockServerActions: MockServerActionsConfig
): Promise<BuildConfigResult> {
  log.info('Injecting build config for server action mocking', { routerType });
  
  // Determine which config file to modify based on router type
  if (routerType === 'nextjs-app' || routerType === 'nextjs-pages') {
    return await injectNextConfig(projectPath, mockServerActions);
  } else if (routerType === 'react-router' || routerType === 'unknown') {
    return await injectViteConfig(projectPath, mockServerActions);
  }
  
  return {
    success: false,
    message: `Unsupported router type: ${routerType}`,
  };
}

/**
 * Inject into vite.config.ts
 */
async function injectViteConfig(
  projectPath: string,
  mockServerActions: MockServerActionsConfig
): Promise<BuildConfigResult> {
  // Find vite config file
  const configFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts'];
  let configPath: string | null = null;
  
  for (const file of configFiles) {
    const fullPath = path.join(projectPath, file);
    try {
      await fs.access(fullPath);
      configPath = fullPath;
      break;
    } catch {
      continue;
    }
  }
  
  if (!configPath) {
    return {
      success: false,
      message: 'No vite.config file found. Server action mocking requires Vite.',
    };
  }
  
  log.debug(`Found Vite config: ${configPath}`);
  
  try {
    // Read current config
    let content = await fs.readFile(configPath, 'utf-8');
    
    // Check if we've already injected
    if (content.includes(EXPLORER_START_MARKER)) {
      // Remove existing injection first
      content = removeInjectedCode(content);
    }
    
    // Generate alias configuration
    const aliasEntries = generateViteAliases(projectPath, mockServerActions);
    const aliasCode = generateViteAliasCode(aliasEntries);
    
    // Find where to inject (look for resolve.alias or create new)
    const injectedContent = injectViteAliasCode(content, aliasCode);
    
    // Create backup
    const backupPath = configPath + '.storial-backup';
    await fs.writeFile(backupPath, content, 'utf-8');

    // Write modified config
    await fs.writeFile(configPath, injectedContent, 'utf-8');

    log.success(`Injected Vite config with ${Object.keys(aliasEntries).length} aliases`);
    
    return {
      success: true,
      message: 'Vite config updated with server action mocking',
      configFile: configPath,
      backupFile: backupPath,
      aliasesAdded: Object.keys(aliasEntries),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('Failed to inject Vite config', error);
    return {
      success: false,
      message: `Failed to modify Vite config: ${errMsg}`,
    };
  }
}

/**
 * Inject into next.config.js/mjs/ts
 * 
 * Next.js 15+ uses Turbopack by default, which requires experimental.turbo.resolveAlias
 * Older Next.js uses webpack config
 * 
 * Strategy:
 * 1. Create a separate explorer-aliases.js file with the alias config
 * 2. Inject a one-line import/merge into next.config that conditionally applies
 * 3. This avoids complex merging of existing experimental configs
 */
async function injectNextConfig(
  projectPath: string,
  mockServerActions: MockServerActionsConfig
): Promise<BuildConfigResult> {
  // Find next config file
  const configFiles = ['next.config.ts', 'next.config.js', 'next.config.mjs'];
  let configPath: string | null = null;
  let configFileName: string | null = null;
  
  for (const file of configFiles) {
    const fullPath = path.join(projectPath, file);
    try {
      await fs.access(fullPath);
      configPath = fullPath;
      configFileName = file;
      break;
    } catch {
      continue;
    }
  }
  
  if (!configPath || !configFileName) {
    return {
      success: false,
      message: 'No next.config file found.',
    };
  }
  
  log.debug(`Found Next.js config: ${configPath}`);
  
  try {
    // Generate alias entries
    const aliasEntries = generateNextAliases(projectPath, mockServerActions);
    
    // Step 1: Create the storial-aliases helper file
    const aliasHelperPath = path.join(projectPath, '.storial', 'next-aliases.js');
    const aliasHelperContent = generateNextAliasHelperFile(aliasEntries);
    await fs.mkdir(path.dirname(aliasHelperPath), { recursive: true });
    await fs.writeFile(aliasHelperPath, aliasHelperContent, 'utf-8');
    log.debug(`Created alias helper: ${aliasHelperPath}`);
    
    // Step 2: Read and modify next.config
    let content = await fs.readFile(configPath, 'utf-8');
    
    // Check if we've already injected
    if (content.includes(EXPLORER_START_MARKER)) {
      content = removeInjectedCode(content);
    }
    
    // Inject the import and merge logic
    const injectedContent = injectNextConfigWithHelper(content, configFileName);
    
    // Create backup
    const backupPath = configPath + '.storial-backup';
    await fs.writeFile(backupPath, content, 'utf-8');

    // Write modified config
    await fs.writeFile(configPath, injectedContent, 'utf-8');

    log.success(`Injected Next.js config with ${Object.keys(aliasEntries).length} aliases`);
    
    return {
      success: true,
      message: 'Next.js config updated. Restart dev server with: STORIAL_PREVIEW=true npm run dev',
      configFile: configPath,
      backupFile: backupPath,
      aliasesAdded: Object.keys(aliasEntries),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('Failed to inject Next.js config', error);
    return {
      success: false,
      message: `Failed to modify Next.js config: ${errMsg}`,
    };
  }
}

/**
 * Generate a helper file that exports the alias configuration
 * This file is imported by next.config when STORIAL_PREVIEW is set
 */
function generateNextAliasHelperFile(aliases: Record<string, string>): string {
  const turboAliasLines = Object.entries(aliases)
    .map(([from, to]) => `    '${from}': '${to}'`)
    .join(',\n');
  
  // For webpack, we need absolute paths resolved at runtime
  const webpackAliasLines = Object.entries(aliases)
    .map(([from, to]) => {
      return `      '${from}': require('path').resolve(__dirname, '..', '${to}')`;
    })
    .join(',\n');
  
  return `/**
 * Storial Server Action Mocking - Auto-generated
 *
 * This file provides alias configuration for mocking server actions in preview mode.
 * It is only active when STORIAL_PREVIEW=true environment variable is set.
 *
 * Mock files are located at: __storial_mocks__/
 *
 * DO NOT EDIT - This file is regenerated when you setup preview
 */

const isPreview = process.env.STORIAL_PREVIEW === 'true';

// Turbopack aliases (Next.js 15+ dev server)
// Source uses @/ (matching user imports), target is bare path from project root
const turboAliases = isPreview ? {
${turboAliasLines}
} : {};

// Webpack aliases (production build / older Next.js) - use absolute paths
const webpackAliases = isPreview ? {
${webpackAliasLines}
} : {};

/**
 * Merges Storial mocking config into your Next.js config
 * Call this in your next.config: mergeStorialConfig(yourConfig)
 *
 * Note: Next.js 15+ uses top-level 'turbopack' key instead of 'experimental.turbo'
 */
function mergeStorialConfig(config) {
  if (!isPreview) {
    return config;
  }

  console.log('[Storial] Preview mode enabled - applying server action mocks');
  console.log('[Storial] Mock location: __storial_mocks__/');
  console.log('[Storial] Aliases:', Object.entries(turboAliases).map(([k,v]) => k + ' -> ' + v));
  
  return {
    ...config,
    // Next.js 15+ uses top-level turbopack config
    turbopack: {
      ...config.turbopack,
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        ...turboAliases,
      },
    },
    // Webpack config for production builds
    webpack: (webpackConfig, options) => {
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        ...webpackAliases,
      };
      
      if (typeof config.webpack === 'function') {
        return config.webpack(webpackConfig, options);
      }
      return webpackConfig;
    },
  };
}

module.exports = { mergeStorialConfig, turboAliases, webpackAliases, isPreview };
`;
}

/**
 * Inject the helper import and wrap the config export
 */
function injectNextConfigWithHelper(content: string, configFileName: string): string {
  const isTypeScript = configFileName.endsWith('.ts');
  const isESM = configFileName.endsWith('.mjs') || content.includes('export default');
  
  // Import statement
  const importStatement = isESM
    ? `import { mergeStorialConfig } from './.storial/next-aliases.js';`
    : `const { mergeStorialConfig } = require('./.storial/next-aliases.js');`;
  
  // Add import at the top (after any existing imports)
  const importSection = `${EXPLORER_START_MARKER}
${importStatement}
${EXPLORER_END_MARKER}
`;
  
  // Find where to insert import (after existing imports or at top)
  let importInsertPos = 0;
  const lastImportMatch = content.match(/^(import .+;?\s*)+/m);
  const lastRequireMatch = content.match(/^(const .+ = require\(.+\);?\s*)+/m);
  
  if (lastImportMatch && lastImportMatch.index !== undefined) {
    importInsertPos = lastImportMatch.index + lastImportMatch[0].length;
  } else if (lastRequireMatch && lastRequireMatch.index !== undefined) {
    importInsertPos = lastRequireMatch.index + lastRequireMatch[0].length;
  }
  
  // Insert import
  let result = content.slice(0, importInsertPos) + '\n' + importSection + content.slice(importInsertPos);
  
  // Wrap the export with mergeStorialConfig
  // Handle: export default { ... }
  result = result.replace(
    /export\s+default\s+(\{[\s\S]*?\n\}\s*;?)\s*$/,
    (match, configObj) => {
      // Check if already wrapped
      if (match.includes('mergeStorialConfig')) return match;
      return `export default mergeStorialConfig(${configObj.trim().replace(/;$/, '')});`;
    }
  );
  
  // Handle: module.exports = { ... }
  result = result.replace(
    /module\.exports\s*=\s*(\{[\s\S]*?\n\}\s*;?)\s*$/,
    (match, configObj) => {
      if (match.includes('mergeStorialConfig')) return match;
      return `module.exports = mergeStorialConfig(${configObj.trim().replace(/;$/, '')});`;
    }
  );
  
  // Handle: const nextConfig = { ... }; export default nextConfig;
  // or: const nextConfig = { ... }; module.exports = nextConfig;
  if (!result.includes('mergeStorialConfig(')) {
    // Try to find variable assignment followed by export
    result = result.replace(
      /(export\s+default\s+)(\w+)\s*;?\s*$/,
      (match, exportPart, varName) => {
        if (match.includes('mergeStorialConfig')) return match;
        return `${exportPart}mergeStorialConfig(${varName});`;
      }
    );
    
    result = result.replace(
      /(module\.exports\s*=\s*)(\w+)\s*;?\s*$/,
      (match, exportPart, varName) => {
        if (match.includes('mergeStorialConfig')) return match;
        return `${exportPart}mergeStorialConfig(${varName});`;
      }
    );
  }
  
  return result;
}

/**
 * Generate Vite alias entries from mock configuration
 */
function generateViteAliases(
  projectPath: string,
  mockServerActions: MockServerActionsConfig
): Record<string, string> {
  const aliases: Record<string, string> = {};
  
  for (const importPath of Object.keys(mockServerActions)) {
    const mockPath = getMockFilePath(importPath);
    // Vite uses relative paths from project root
    aliases[importPath] = `./${mockPath}`;
  }
  
  return aliases;
}

/**
 * Generate Next.js alias entries from mock configuration
 * 
 * For Turbopack, the alias target should be a bare path (not starting with @/).
 * Turbopack resolves these relative to the project root.
 * 
 * Example:
 * - @/components/cart/actions → __storial_mocks__/components/cart/actions.mock
 */
function generateNextAliases(
  projectPath: string,
  mockServerActions: MockServerActionsConfig
): Record<string, string> {
  const aliases: Record<string, string> = {};
  
  for (const importPath of Object.entries(mockServerActions)) {
    const [actionPath] = importPath;
    
    // Mock path relative to project root (will be created at __storial_mocks__/)
    // e.g., components/cart/actions → __storial_mocks__/components/cart/actions.mock
    const mockRelativePath = `__storial_mocks__/${actionPath}.mock`;
    
    // For Turbopack: source uses @/ (matching user's imports), 
    // target is bare path resolved from project root
    const sourceWithAt = `@/${actionPath}`;
    
    // Primary alias: @/components/cart/actions → __storial_mocks__/components/cart/actions.mock
    aliases[sourceWithAt] = mockRelativePath;
    
    // Also alias bare paths for components that import without @/
    aliases[actionPath] = mockRelativePath;
    
    log.debug(`Generated aliases for ${actionPath}:`, {
      source: sourceWithAt,
      target: mockRelativePath,
      barePath: actionPath
    });
  }
  
  return aliases;
}

/**
 * Generate Vite-specific alias code
 */
function generateViteAliasCode(aliases: Record<string, string>): string {
  const aliasLines = Object.entries(aliases)
    .map(([from, to]) => `        '${from}': '${to}'`)
    .join(',\n');
  
  return `
${EXPLORER_START_MARKER}
// Conditional aliases for server action mocking (only active during preview)
// This will NOT affect your normal development or production builds
...(process.env.STORIAL_PREVIEW ? {
  resolve: {
    alias: {
${aliasLines}
    }
  }
} : {})
${EXPLORER_END_MARKER}`;
}


/**
 * Inject alias code into Vite config
 */
function injectViteAliasCode(content: string, aliasCode: string): string {
  // Look for defineConfig call
  const defineConfigMatch = content.match(/defineConfig\s*\(\s*\{/);
  if (defineConfigMatch && defineConfigMatch.index !== undefined) {
    // Insert after the opening brace
    const insertPos = defineConfigMatch.index + defineConfigMatch[0].length;
    return content.slice(0, insertPos) + aliasCode + '\n' + content.slice(insertPos);
  }
  
  // Look for export default with object
  const exportMatch = content.match(/export\s+default\s*\{/);
  if (exportMatch && exportMatch.index !== undefined) {
    const insertPos = exportMatch.index + exportMatch[0].length;
    return content.slice(0, insertPos) + aliasCode + '\n' + content.slice(insertPos);
  }
  
  // Fallback: append to end (may not work for all configs)
  log.warn('Could not find ideal injection point, appending to config');
  return content + '\n' + aliasCode;
}


/**
 * Remove previously injected code
 */
function removeInjectedCode(content: string): string {
  const startIdx = content.indexOf(EXPLORER_START_MARKER);
  const endIdx = content.indexOf(EXPLORER_END_MARKER);
  
  if (startIdx === -1 || endIdx === -1) {
    return content;
  }
  
  const endMarkerLen = EXPLORER_END_MARKER.length;
  return content.slice(0, startIdx) + content.slice(endIdx + endMarkerLen);
}

/**
 * Check if build config has been modified for server action mocking
 */
export async function checkBuildConfigStatus(
  projectPath: string,
  routerType: RouterType
): Promise<{ hasInjection: boolean; configFile: string | null }> {
  const configFiles = routerType === 'nextjs-app' || routerType === 'nextjs-pages'
    ? ['next.config.js', 'next.config.mjs', 'next.config.ts']
    : ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts'];
  
  for (const file of configFiles) {
    const fullPath = path.join(projectPath, file);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      if (content.includes(EXPLORER_START_MARKER)) {
        return { hasInjection: true, configFile: fullPath };
      }
    } catch {
      continue;
    }
  }
  
  return { hasInjection: false, configFile: null };
}

/**
 * Remove injected build config
 */
export async function removeBuildConfigInjection(
  projectPath: string,
  routerType: RouterType
): Promise<{ success: boolean; message: string }> {
  const isNextJs = routerType === 'nextjs-app' || routerType === 'nextjs-pages';
  const configFiles = isNextJs
    ? ['next.config.ts', 'next.config.js', 'next.config.mjs']
    : ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts'];
  
  let removed = false;
  
  for (const file of configFiles) {
    const fullPath = path.join(projectPath, file);
    try {
      let content = await fs.readFile(fullPath, 'utf-8');
      
      if (content.includes(EXPLORER_START_MARKER)) {
        let cleanedContent = removeInjectedCode(content);
        
        // For Next.js, also remove the mergeStorialConfig wrapper
        if (isNextJs) {
          cleanedContent = cleanedContent
            .replace(/mergeStorialConfig\(([^)]+)\)/g, '$1')
            .replace(/import \{ mergeStorialConfig \}[^;]+;?\n?/g, '')
            .replace(/const \{ mergeStorialConfig \}[^;]+;?\n?/g, '');
        }
        
        await fs.writeFile(fullPath, cleanedContent, 'utf-8');
        log.success(`Removed injection from ${file}`);
        removed = true;
        break;
      }
    } catch {
      continue;
    }
  }
  
  // Also remove the helper file for Next.js
  if (isNextJs) {
    try {
      const aliasHelperPath = path.join(projectPath, '.storial', 'next-aliases.js');
      await fs.unlink(aliasHelperPath);
      log.success('Removed alias helper file');
    } catch {
      // File may not exist
    }
  }
  
  return {
    success: true,
    message: removed ? 'Server action mocking removed' : 'No injection found to remove',
  };
}

/**
 * Generate a preview of what changes would be made to the build config
 */
export async function previewBuildConfigChanges(
  projectPath: string,
  routerType: RouterType,
  mockServerActions: MockServerActionsConfig
): Promise<{ configFile: string; changes: string; instructions: string } | null> {
  const isNextJs = routerType === 'nextjs-app' || routerType === 'nextjs-pages';
  const configFiles = isNextJs
    ? ['next.config.ts', 'next.config.js', 'next.config.mjs']
    : ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts'];
  
  for (const file of configFiles) {
    const fullPath = path.join(projectPath, file);
    try {
      await fs.access(fullPath);
      
      const aliases = isNextJs
        ? generateNextAliases(projectPath, mockServerActions)
        : generateViteAliases(projectPath, mockServerActions);
      
      const aliasEntries = Object.entries(aliases)
        .map(([from, to]) => `  ${from}\n    → ${to}`)
        .join('\n');
      
      const instructions = isNextJs
        ? `After setup, restart your dev server with:\n  STORIAL_PREVIEW=true npm run dev`
        : `After setup, restart your dev server with:\n  STORIAL_PREVIEW=true npm run dev`;
      
      return {
        configFile: file,
        changes: `Will add ${Object.keys(aliases).length} alias(es):\n${aliasEntries}`,
        instructions,
      };
    } catch {
      continue;
    }
  }
  
  return null;
}

