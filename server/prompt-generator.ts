/**
 * AI Prompt Generator for Stories
 * 
 * Generates prompts that AI can use to create story files for pages and components.
 * The generated stories enable preview with mock data, different states, and variants.
 */

import type { PageInfo, ComponentInfo } from './scanner.js';
import fs from 'fs/promises';
import path from 'path';

// Logging
const log = {
  info: (msg: string, data?: any) => {
    console.log(`\x1b[36m[PROMPT-GEN]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  success: (msg: string, data?: any) => {
    console.log(`\x1b[32m[PROMPT-GEN ✓]\x1b[0m ${msg}`, data !== undefined ? data : '');
  },
  error: (msg: string, data?: any) => {
    console.log(`\x1b[31m[PROMPT-GEN ✗]\x1b[0m ${msg}`, data !== undefined ? data : '');
  }
};

// ==================== TEMPLATES ====================

export const COMPONENT_STORY_TEMPLATE = `{
  "$schema": "https://explorer.dev/schemas/component-story.json",
  "componentName": "ExampleComponent",
  "componentPath": "src/components/ExampleComponent.tsx",
  "type": "component",
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "stories": [
    {
      "id": "default",
      "name": "Default",
      "description": "The default state of the component with typical data",
      "props": {
        "exampleProp": "example value"
      },
      "mockApi": {
        "GET /api/example": {
          "id": "123",
          "name": "Example Data",
          "status": "active"
        }
      },
      "mockServerActions": {
        "@/lib/actions": {
          "createItem": {
            "returns": { "id": "new-123", "success": true }
          },
          "deleteItem": {
            "returns": { "success": true }
          }
        }
      },
      "mockContext": {}
    },
    {
      "id": "loading",
      "name": "Loading State",
      "description": "Component while data is being fetched",
      "props": {},
      "mockApi": {
        "GET /api/example": { "__delay": 999999 }
      },
      "mockServerActions": {
        "@/lib/actions": {
          "createItem": {
            "delay": 999999,
            "returns": {}
          }
        }
      }
    },
    {
      "id": "error",
      "name": "Error State",
      "description": "Component when API returns an error",
      "props": {},
      "mockApi": {
        "GET /api/example": { "__error": { "status": 500, "message": "Server error" } }
      },
      "mockServerActions": {
        "@/lib/actions": {
          "createItem": {
            "throwError": "Failed to create item"
          }
        }
      }
    },
    {
      "id": "empty",
      "name": "Empty State",
      "description": "Component when there is no data",
      "props": {},
      "mockApi": {
        "GET /api/example": null
      },
      "mockServerActions": {}
    }
  ],
  "themeVariants": ["light", "dark"],
  "viewports": [
    { "name": "mobile", "width": 375, "height": 667 },
    { "name": "tablet", "width": 768, "height": 1024 },
    { "name": "desktop", "width": 1280, "height": 800 }
  ]
}`;

export const PAGE_STORY_TEMPLATE = `{
  "$schema": "https://explorer.dev/schemas/page-story.json",
  "pageName": "example-page",
  "pagePath": "src/pages/example.tsx",
  "pageRoute": "/example",
  "type": "page",
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "stories": [
    {
      "id": "default",
      "name": "Default",
      "description": "The default state of the page with typical data",
      "routeParams": {},
      "queryParams": {},
      "mockAuth": {
        "isAuthenticated": true,
        "user": {
          "id": "user-123",
          "name": "Test User",
          "email": "test@example.com",
          "role": "user"
        }
      },
      "mockApi": {
        "GET /api/data": {
          "items": [
            { "id": "1", "title": "Item 1" },
            { "id": "2", "title": "Item 2" }
          ],
          "total": 2
        }
      },
      "mockServerActions": {
        "@/lib/actions": {
          "submitForm": {
            "returns": { "success": true, "message": "Form submitted" }
          }
        }
      }
    },
    {
      "id": "loading",
      "name": "Loading State",
      "description": "Page while data is being fetched",
      "mockApi": {
        "GET /api/data": { "__delay": 999999 }
      },
      "mockServerActions": {}
    },
    {
      "id": "error",
      "name": "Error State", 
      "description": "Page when API returns an error",
      "mockApi": {
        "GET /api/data": { "__error": { "status": 500, "message": "Server error" } }
      },
      "mockServerActions": {}
    },
    {
      "id": "unauthenticated",
      "name": "Not Logged In",
      "description": "Page when user is not authenticated",
      "mockAuth": {
        "isAuthenticated": false
      },
      "mockServerActions": {}
    },
    {
      "id": "empty",
      "name": "Empty State",
      "description": "Page when there is no data",
      "mockApi": {
        "GET /api/data": { "items": [], "total": 0 }
      },
      "mockServerActions": {}
    }
  ],
  "themeVariants": ["light", "dark"],
  "viewports": [
    { "name": "mobile", "width": 375, "height": 667 },
    { "name": "tablet", "width": 768, "height": 1024 },
    { "name": "desktop", "width": 1280, "height": 800 }
  ]
}`;

// ==================== PROMPT GENERATION ====================

interface GeneratePromptOptions {
  type: 'component' | 'page';
  item: ComponentInfo | PageInfo;
  sourceCode: string;
  projectPath: string;
}

export function generateStoriesPrompt(options: GeneratePromptOptions): string {
  const { type, item, sourceCode, projectPath } = options;
  
  log.info('Generating prompt', { type, name: type === 'component' ? (item as ComponentInfo).name : (item as PageInfo).route });
  
  const relativePath = item.filePath.replace(projectPath, '').replace(/^\//, '');
  const storiesFileName = type === 'component' 
    ? `${(item as ComponentInfo).name}.stories.json`
    : `${(item as PageInfo).fileName.replace(/\.(tsx?|jsx?)$/, '')}.stories.json`;
  
  const template = type === 'component' ? COMPONENT_STORY_TEMPLATE : PAGE_STORY_TEMPLATE;
  
  if (type === 'component') {
    return generateComponentPrompt(item as ComponentInfo, sourceCode, relativePath, storiesFileName, template);
  } else {
    return generatePagePrompt(item as PageInfo, sourceCode, relativePath, storiesFileName, template);
  }
}

function generateComponentPrompt(
  component: ComponentInfo,
  sourceCode: string,
  relativePath: string,
  storiesFileName: string,
  template: string
): string {
  const hasProps = component.props.length > 0;
  const hasDataDependencies = component.dataDependencies.length > 0;
  const hasServerActions = component.serverActions && component.serverActions.length > 0;
  const hasDynamicInputs = hasProps || hasDataDependencies || hasServerActions;

  const propsSection = hasProps
    ? component.props.map(p => `- \`${p.name}\`: ${p.type}${p.required ? ' (required)' : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`).join('\n')
    : 'No props detected';

  const dataSection = hasDataDependencies
    ? component.dataDependencies.map(d => `- ${d.type}: \`${d.source}\` (line ${d.line})`).join('\n')
    : 'No API calls detected';

  const usageSection = [
    ...component.usedInPages.map(p => `- Page: ${p}`),
    ...component.usedInComponents.map(c => `- Component: ${c}`)
  ].join('\n') || 'Not used anywhere yet';

  // Server Actions section (if any detected)
  const serverActionsSection = hasServerActions
    ? component.serverActions!.map(sa => `- \`${sa.functionName}\` from \`${sa.importPath}\``).join('\n')
    : 'No server actions detected';

  // Static component warning
  const staticComponentSection = !hasDynamicInputs ? `
## ⚠️ STATIC COMPONENT DETECTED

**This component has NO dynamic inputs:**
- No props
- No API/data fetching
- No server actions

This means the component will render exactly the same way every time - you CANNOT create different visual states through stories.

**IMPORTANT INSTRUCTIONS FOR STATIC COMPONENTS:**

1. **Generate ONLY ONE story** - the "default" story showing the component as-is
2. **Do NOT generate fake stories** like "loading", "error", "empty", etc. - these states don't exist for this component
3. **Do NOT generate prop variations** - there are no props to vary
4. **Leave mockApi and mockServerActions empty** - there's nothing to mock

**Include a note in the story description** explaining that this component has hardcoded data and suggesting it could be refactored to accept props for better flexibility.

Example for a static component:
\`\`\`json
{
  "stories": [
    {
      "id": "default",
      "name": "Default",
      "description": "Static component with hardcoded data. To enable different states, consider refactoring to accept data as props.",
      "props": {},
      "mockApi": {},
      "mockServerActions": {},
      "mockContext": {}
    }
  ]
}
\`\`\`
` : '';

  return `# Generate Stories for Component: ${component.name}

## Instructions

Create a stories file that enables previewing this component in different states with mock data.
The file should be created at: \`.explorer/stories/components/${storiesFileName}\`

**Important:** Look at the template below for the expected JSON structure. Follow it exactly.
${staticComponentSection}
---

## Component Analysis

**Name:** ${component.name}
**File:** ${relativePath}
**Type:** ${component.isClientComponent ? 'Client Component' : 'Server Component'}
**Has Dynamic Inputs:** ${hasDynamicInputs ? 'Yes' : 'No (static component)'}

### Props
${propsSection}

### API/Data Dependencies (fetch calls)
${dataSection}

### Server Actions (Next.js Server Functions)
${serverActionsSection}
${hasServerActions ? `
**Note:** This component uses Server Actions. You MUST include \`mockServerActions\` in each story to mock these function calls. See the template for the format.
` : ''}

### Used In
${usageSection}

### Imports
${component.imports.length > 0 ? component.imports.map(i => `- ${i}`).join('\n') : 'No significant imports'}

---

## Source Code

\`\`\`tsx
${sourceCode}
\`\`\`

---

## Template Reference

Look at this template for the expected structure. The stories you generate should follow this exact format:

\`\`\`json
${template}
\`\`\`

---

## Your Task
${!hasDynamicInputs ? `
**STATIC COMPONENT - LIMITED STORIES**

Since this component has no props, no API calls, and no server actions, you should:
1. Generate ONLY a single "default" story
2. Note in the description that the component has hardcoded data
3. Leave props, mockApi, mockServerActions, and mockContext empty

Do NOT invent stories for states that cannot exist.
` : `
Based on the source code and analysis above:

1. **Identify all possible states** the component can be in (loading, error, empty, populated, etc.)
2. **Identify all prop variations** that affect the component's appearance
3. **Generate realistic mock data** for each API endpoint based on how the data is used in the code
4. **Mock all Server Actions** - For each server action, define what it should return in \`mockServerActions\`
5. **Create meaningful stories** that cover:
   - Default/happy path with typical data
   - Loading state (if applicable)
   - Error state (if applicable)
   - Empty state (if applicable)
   - Each significant prop variation
   - Edge cases (long text, missing optional data, etc.)
`}
**Create the file:** \`.explorer/stories/components/${storiesFileName}\`

Generate the complete JSON file content now.`;
}

function generatePagePrompt(
  page: PageInfo,
  sourceCode: string,
  relativePath: string,
  storiesFileName: string,
  template: string
): string {
  const hasDataDependencies = page.dataDependencies.length > 0;
  const hasRouteParams = (page.route.match(/\[([^\]]+)\]/g) || []).length > 0;
  const hasDynamicInputs = hasDataDependencies || hasRouteParams;

  const dataSection = hasDataDependencies
    ? page.dataDependencies.map(d => `- ${d.type}: \`${d.source}\` (line ${d.line})`).join('\n')
    : 'No API calls detected';

  const componentsSection = page.components.length > 0
    ? page.components.map(c => `- ${c}`).join('\n')
    : 'No components detected';

  const linksSection = page.linksTo.length > 0
    ? page.linksTo.map(l => `- ${l}`).join('\n')
    : 'No links detected';

  // Extract route params from the route (e.g., /users/[id] -> id)
  const routeParams = (page.route.match(/\[([^\]]+)\]/g) || [])
    .map(p => p.replace(/[\[\]]/g, ''));
  const routeParamsSection = hasRouteParams
    ? routeParams.map(p => `- \`${p}\`: string`).join('\n')
    : 'No route parameters';

  // Static page warning
  const staticPageSection = !hasDynamicInputs ? `
## ⚠️ STATIC PAGE DETECTED

**This page has NO dynamic inputs:**
- No route parameters (like \`[id]\` or \`[slug]\`)
- No API/data fetching

This means the page will render exactly the same way every time - you CANNOT create different data states through stories.

**IMPORTANT INSTRUCTIONS FOR STATIC PAGES:**

1. **Generate ONLY ONE story** - the "default" story showing the page as-is
2. **Do NOT generate fake stories** like "loading", "error", "empty", etc. - these states don't exist for this page
3. **Leave mockApi empty** - there's nothing to mock

**Include a note in the story description** explaining that this page has no dynamic data sources.

Example for a static page:
\`\`\`json
{
  "stories": [
    {
      "id": "default",
      "name": "Default",
      "description": "Static page with no dynamic data. The page renders the same way every time.",
      "routeParams": {},
      "queryParams": {},
      "mockApi": {},
      "mockServerActions": {}
    }
  ]
}
\`\`\`
` : '';

  return `# Generate Stories for Page: ${page.route || '/'}

## Instructions

Create a stories file that enables previewing this page in different states with mock data.
The file should be created at: \`.explorer/stories/pages/${storiesFileName}\`

**Important:** Look at the template below for the expected JSON structure. Follow it exactly.
${staticPageSection}
---

## Page Analysis

**Route:** ${page.route || '/'}
**File:** ${relativePath}
**Has Dynamic Inputs:** ${hasDynamicInputs ? 'Yes' : 'No (static page)'}
${page.isLayout ? '**Type:** Layout' : ''}
${page.isLoading ? '**Type:** Loading UI' : ''}
${page.isError ? '**Type:** Error UI' : ''}

### Route Parameters
${routeParamsSection}

### API/Data Dependencies
${dataSection}

### Components Used
${componentsSection}

### Links To
${linksSection}

---

## Source Code

\`\`\`tsx
${sourceCode}
\`\`\`

---

## Template Reference

Look at this template for the expected structure. The stories you generate should follow this exact format:

\`\`\`json
${template}
\`\`\`

---

## Your Task
${!hasDynamicInputs ? `
**STATIC PAGE - LIMITED STORIES**

Since this page has no route parameters and no API calls, you should:
1. Generate ONLY a single "default" story
2. Note in the description that the page has no dynamic data
3. Leave routeParams, queryParams, mockApi, and mockServerActions empty

Do NOT invent stories for states that cannot exist.
` : `
Based on the source code and analysis above:

1. **Identify all possible states** the page can be in (loading, error, empty, populated, etc.)
2. **Consider authentication states** (logged in, logged out, different roles)
3. **Generate realistic mock data** for each API endpoint based on how the data is used in the code
4. **Mock any route parameters** with realistic values
5. **Create meaningful stories** that cover:
   - Default/happy path with typical data
   - Loading state (if applicable)
   - Error state (if applicable)
   - Empty state (if applicable)
   - Unauthenticated state (if auth is required)
   - Different user roles (if role-based content exists)
   - Edge cases
`}
**Create the file:** \`.explorer/stories/pages/${storiesFileName}\`

Generate the complete JSON file content now.`;
}

// ==================== TEMPLATE SETUP ====================

export async function ensureTemplatesExist(projectPath: string): Promise<{ created: boolean; path: string }> {
  const explorerPath = path.join(projectPath, '.explorer');
  const templatesPath = path.join(explorerPath, 'templates');
  const storiesPath = path.join(explorerPath, 'stories');
  const componentsStoriesPath = path.join(storiesPath, 'components');
  const pagesStoriesPath = path.join(storiesPath, 'pages');
  
  log.info('Ensuring templates exist', { projectPath });
  
  try {
    // Create directories
    await fs.mkdir(templatesPath, { recursive: true });
    await fs.mkdir(componentsStoriesPath, { recursive: true });
    await fs.mkdir(pagesStoriesPath, { recursive: true });
    
    // Write template files
    const componentTemplatePath = path.join(templatesPath, 'component.stories.template.json');
    const pageTemplatePath = path.join(templatesPath, 'page.stories.template.json');
    
    await fs.writeFile(componentTemplatePath, COMPONENT_STORY_TEMPLATE, 'utf-8');
    await fs.writeFile(pageTemplatePath, PAGE_STORY_TEMPLATE, 'utf-8');
    
    // Create a README in .explorer
    const readmePath = path.join(explorerPath, 'README.md');
    const readmeContent = `# Explorer Stories

This folder contains story files generated for previewing components and pages.

## Structure

\`\`\`
.explorer/
├── templates/                    # Template files for reference
│   ├── component.stories.template.json
│   └── page.stories.template.json
├── stories/
│   ├── components/              # Component story files
│   │   └── Button.stories.json
│   └── pages/                   # Page story files
│       └── dashboard.stories.json
└── README.md
\`\`\`

## How It Works

1. **Generate Stories**: Click "Generate Stories" in the Explorer to get an AI prompt
2. **Run AI**: Paste the prompt into your AI coding tool (Cursor, Claude, etc.)
3. **AI Creates File**: The AI will create the story file in the correct location
4. **Preview**: Select a story to preview the component/page with mock data

## Story Format

Each story file contains:
- **stories**: Array of different states/variations to preview
- **mockApi**: Mock responses for API calls
- **mockContext**: Mock context values
- **themeVariants**: Supported themes (light/dark)
- **viewports**: Supported screen sizes

See the template files for the full schema.
`;
    await fs.writeFile(readmePath, readmeContent, 'utf-8');
    
    log.success('Templates created', { path: templatesPath });
    return { created: true, path: explorerPath };
  } catch (error) {
    log.error('Failed to create templates', error);
    throw error;
  }
}

// ==================== STORIES FILE OPERATIONS ====================

export interface StoryFile {
  componentName?: string;
  componentPath?: string;
  pageName?: string;
  pagePath?: string;
  pageRoute?: string;
  type: 'component' | 'page';
  stories: Array<{
    id: string;
    name: string;
    description?: string;
    props?: Record<string, any>;
    routeParams?: Record<string, string>;
    queryParams?: Record<string, string>;
    mockAuth?: Record<string, any>;
    mockApi?: Record<string, any>;
    mockServerActions?: Record<string, Record<string, {
      returns?: any;
      throwError?: string;
      delay?: number;
    }>>;
    mockContext?: Record<string, any>;
  }>;
  themeVariants?: string[];
  viewports?: Array<{ name: string; width: number; height: number }>;
}

// Sanitize name to create safe filename (same logic as in server/index.ts)
function sanitizeFileName(name: string): string {
  return name
    .replace(/^\//, '')           // Remove leading slash
    .replace(/\//g, '_')          // Replace / with _
    .replace(/:/g, '_')           // Replace : with _
    .replace(/[<>:"\\|?*]/g, '_'); // Replace other invalid chars
}

export async function getStories(
  projectPath: string, 
  type: 'component' | 'page', 
  name: string
): Promise<StoryFile | null> {
  const folder = type === 'component' ? 'components' : 'pages';
  const storiesDir = path.join(projectPath, '.explorer', 'stories', folder);
  
  // Try 1: Direct filename match
  const safeName = sanitizeFileName(name);
  const fileName = `${safeName}.stories.json`;
  const filePath = path.join(storiesDir, fileName);
  
  log.info('Looking for stories file', { filePath, originalName: name, safeName });
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stories = JSON.parse(content) as StoryFile;
    log.success('Found stories file (direct match)', { stories: stories.stories.length });
    return stories;
  } catch {
    // Try 2: Scan directory and match by route/path/componentName inside the JSON
    log.info('Direct match failed, scanning directory for route/path match');
    
    try {
      const files = await fs.readdir(storiesDir);
      
      for (const file of files) {
        if (!file.endsWith('.stories.json')) continue;
        
        try {
          const content = await fs.readFile(path.join(storiesDir, file), 'utf-8');
          const stories = JSON.parse(content) as StoryFile;
          
          // Match by route, path, componentName, or pageName
          const matchesRoute = stories.pageRoute === name || stories.pageRoute === `/${name}`;
          const matchesPath = stories.pagePath?.includes(name) || stories.componentPath?.includes(name);
          const matchesComponentName = stories.componentName === name;
          const matchesPageName = stories.pageName === name;
          
          if (matchesRoute || matchesPath || matchesComponentName || matchesPageName) {
            log.success('Found stories file (by route/path match)', { 
              file, 
              matchedBy: matchesRoute ? 'route' : matchesPath ? 'path' : matchesComponentName ? 'componentName' : 'pageName',
              stories: stories.stories.length 
            });
            return stories;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // Directory doesn't exist
    }
    
    log.info('No stories file found');
    return null;
  }
}

export async function listAllStories(projectPath: string): Promise<{
  components: string[];
  pages: string[];
}> {
  const result = { components: [] as string[], pages: [] as string[] };
  
  try {
    const componentsPath = path.join(projectPath, '.explorer', 'stories', 'components');
    const pagesPath = path.join(projectPath, '.explorer', 'stories', 'pages');
    
    try {
      const componentFiles = await fs.readdir(componentsPath);
      result.components = componentFiles
        .filter(f => f.endsWith('.stories.json'))
        .map(f => f.replace('.stories.json', ''));
    } catch { /* folder doesn't exist */ }
    
    try {
      const pageFiles = await fs.readdir(pagesPath);
      result.pages = pageFiles
        .filter(f => f.endsWith('.stories.json'))
        .map(f => f.replace('.stories.json', ''));
    } catch { /* folder doesn't exist */ }
    
    log.success('Listed all stories', result);
    return result;
  } catch (error) {
    log.error('Failed to list stories', error);
    return result;
  }
}

