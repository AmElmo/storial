# React/Next.js Explorer 🔍

A visual explorer for React and Next.js applications. See your pages, components, and their relationships at a glance.

## Features (Heuristic - High Reliability)

| Feature | Reliability | Description |
|---------|-------------|-------------|
| 📄 **Page/Route Detection** | ~95% | Lists all pages/routes (Next.js App/Pages Router, React Router) |
| 🧩 **Component Detection** | ~95% | Scans `/components/`, finds `.tsx` files |
| 📦 **Import Parsing** | ~98% | Extracts `import X from Y` statements |
| 🔗 **Component → Page Mapping** | ~95% | Shows which components are used on which pages |
| 🔗 **Link Detection** | ~85% | Parses `<Link href>`, `router.push()` |
| 📝 **Source Code Display** | 100% | View any file's source code |
| ⚡ **Client/Server Detection** | ~98% | Checks `'use client'` directive |

## Coming Soon (AI-Powered)

- 🎭 **Story Generation** - Auto-generate component stories
- 📊 **Mock Data** - AI-generated realistic mock data
- 📖 **Documentation** - Auto-generated component docs
- 👁️ **Component Preview** - Isolated component preview with mocks

## Quick Start

### 1. Install Dependencies

```bash
cd nextjs-explorer
npm install
```

### 2. Start the Explorer

```bash
npm run dev
```

This starts:
- **Server** on `http://localhost:3050` (API for scanning projects)
- **UI** on `http://localhost:5180` (Web interface)

### 3. Enter Your Project Path

Open `http://localhost:5180` in your browser and enter the **absolute path** to your React/Next.js project:

```
/Users/yourname/projects/my-app
```

The explorer will scan the project and show you:
- All pages with their routes
- All components
- Relationships between them
- Data dependencies (fetch calls, React Query, etc.)

## Supported Frameworks

### Router Types
- ✅ **Next.js App Router** (`app/` directory with `page.tsx` files)
- ✅ **Next.js Pages Router** (`pages/` directory)
- ✅ **React Router** (Vite + React Router setup)

### Data Dependencies Detected
- `fetch()` calls
- Prisma patterns (`prisma.*.findMany()`, etc.)
- Drizzle patterns
- React Query (`useQuery`)
- SWR (`useSWR`)
- Server Actions

### Component Locations Scanned
- `components/`
- `src/components/`
- `app/components/`
- `lib/components/`

## Usage

### Viewing Pages

1. Click on **Pages** tab in the sidebar
2. Select a page to see:
   - Route path
   - Components used on this page
   - Links to other pages
   - Data dependencies

### Viewing Components

1. Click on **Components** tab in the sidebar
2. Select a component to see:
   - Props with types
   - Which pages use this component
   - Which other components use it
   - Imports
   - Data dependencies

### Preview

- **Pages**: Embed the actual page via iframe (requires dev server running)
- **Components**: Coming soon with AI-powered story generation

## Project Structure

```
nextjs-explorer/
├── server/
│   ├── index.ts          # Express server
│   ├── scanner.ts        # Project scanner (pages, components)
│   └── parser.ts         # AST parsing (imports, links, props)
├── src/
│   ├── App.tsx           # Main app component
│   ├── components/
│   │   ├── Sidebar.tsx       # Page/component list
│   │   ├── StructureView.tsx # Relationship view
│   │   ├── PreviewPane.tsx   # Preview panel
│   │   └── ProjectSelector.tsx
│   └── lib/
│       ├── api.ts        # API client
│       └── utils.ts      # Utilities
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/project` | GET | Get current project info |
| `/api/project` | POST | Set project path |
| `/api/scan` | POST | Scan a project |
| `/api/scan` | GET | Get cached scan result |
| `/api/file` | GET | Read file content |

## Tips

1. **Large Projects**: The scanner may take a few seconds for large projects
2. **Private Components**: Components in `node_modules` are ignored
3. **Test Files**: `.test.tsx`, `.spec.tsx`, and `.stories.tsx` files are excluded
4. **Dynamic Routes**: Shown as `:param` (e.g., `/blog/:slug`)

## Suppressing Build Warnings

When running `npm run build`, you may see warnings like:

```
(!) X is dynamically imported by __Canvas.tsx but also statically imported by Y
```

**These warnings are harmless.** They occur because the Canvas preview component uses `import.meta.glob()` to dynamically discover components, while those same components are statically imported elsewhere. The build succeeds normally and Canvas is tree-shaken from production bundles.

If you prefer to suppress these warnings, here are optional solutions:

### For Vite + React Projects

Add a plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Optional: Suppress Canvas build warnings
    {
      name: 'suppress-canvas-warnings',
      config() {
        return {
          build: {
            rollupOptions: {
              onwarn(warning, warn) {
                // Suppress dynamic/static import warnings for __Canvas.tsx
                if (warning.message?.includes('__Canvas.tsx')) return;
                warn(warning);
              }
            }
          }
        };
      }
    }
  ],
  // ... rest of your config
})
```

### For Next.js Projects

Next.js doesn't use `import.meta.glob`, so these warnings don't appear. The Explorer generates a different Canvas implementation for Next.js that uses explicit component imports instead.

### Alternative: Remove Canvas from Production

If you only need Canvas during development, you can exclude it from builds entirely by adding to `vite.config.ts`:

```typescript
{
  name: 'stub-canvas-prod',
  transform(code, id) {
    if (id.includes('__Canvas') && process.env.NODE_ENV === 'production') {
      return 'export default function Canvas() { return null; }';
    }
  }
}
```

This replaces the entire Canvas file with a no-op component during production builds, completely eliminating the warnings and reducing bundle size.

## Roadmap

### Phase 1: Heuristics (Current)
- [x] Page detection (App/Pages Router, React Router)
- [x] Component detection
- [x] Import parsing
- [x] Link detection
- [x] Source code display
- [x] Client/Server component detection

### Phase 2: AI Generation (Next)
- [ ] Story generation for components
- [ ] Mock data generation
- [ ] Component documentation
- [ ] Isolated component preview

### Phase 3: Advanced Features
- [ ] Visual component tree diagram
- [ ] Search across all files
- [ ] Export relationships as JSON/Mermaid
- [ ] Watch mode for incremental updates

---

Built with ❤️ for the React/Next.js community
