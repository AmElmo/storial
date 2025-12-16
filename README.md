# Storial

> AI-powered component stories for React/Next.js - like Storybook, but magical.

Storial scans your React/Next.js project and gives you instant visibility into your codebase: pages, components, hooks, contexts, utilities, and their relationships. Generate AI-powered stories for isolated component testing and documentation.

## Features

### Project Analysis (Free & Open Source)

| Feature | Reliability | Description |
|---------|-------------|-------------|
| **Page/Route Detection** | ~95% | Next.js App/Pages Router, React Router |
| **Component Detection** | ~95% | Finds all components with props and types |
| **Hook Detection** | ~95% | Custom hooks with dependencies |
| **Context Detection** | ~95% | React contexts and providers |
| **Utility Detection** | ~95% | Helper functions and their usage |
| **Relationship Mapping** | ~95% | Which components use what |
| **Unused Code Detection** | ~95% | Find dead code instantly |
| **Client/Server Detection** | ~98% | `'use client'` directive detection |
| **Data Dependencies** | ~85% | fetch, Prisma, Drizzle, React Query, SWR |

### AI Story Generation

Generate comprehensive component stories with:
- Multiple states (default, loading, error, empty)
- Prop variations
- Mock data for API calls
- Theme variants (light/dark)
- Viewport testing (mobile, tablet, desktop)

**Supported LLM Providers:**
- **Local LLM** - Use LM Studio (free, offline)
- **OpenAI** - GPT-4o-mini
- **OpenRouter** - Claude, GPT-4, Gemini, and 20+ models

### VS Code Extension

- Tree view with hierarchical navigation
- Click to open source files
- Right-click to generate stories
- Status bar with server status and stats
- Integrated web UI

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/amelmo/storial.git
cd storial
npm install
```

### 2. Start the Server

```bash
npm run dev
```

This starts:
- **API Server** on `http://localhost:3050`
- **Web UI** on `http://localhost:5180`

### 3. Set Your Project Path

Open `http://localhost:5180` and enter the absolute path to your React/Next.js project:

```
/Users/yourname/projects/my-nextjs-app
```

### 4. Generate Stories (Optional)

For AI story generation, you'll need one of:

**Option A: Local LLM (Free)**
1. Download [LM Studio](https://lmstudio.ai/)
2. Load a model and start the local server (port 1234)
3. Generate stories - no API key needed!

**Option B: OpenAI**
1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Set it in the server configuration
3. Select "OpenAI" when generating

**Option C: OpenRouter**
1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Set it in the server configuration
3. Choose from 20+ models (Claude, GPT-4, Gemini, etc.)

## VS Code Extension

### Installation

1. Open VS Code
2. Go to Extensions (Cmd+Shift+X)
3. Search for "Storial"
4. Click Install

Or install from VSIX:
```bash
cd vscode-extension
npm install
npm run package
# Install the generated .vsix file
```

### Usage

1. Open the Storial panel in the sidebar
2. Start the server when prompted
3. Browse your project structure
4. Right-click any component → "Generate Story"

## Supported Frameworks

### Routers
- Next.js App Router (`app/` directory)
- Next.js Pages Router (`pages/` directory)
- React Router (Vite + React Router)

### Data Fetching
- `fetch()` calls
- Prisma (`prisma.*.findMany()`, etc.)
- Drizzle ORM
- React Query (`useQuery`)
- SWR (`useSWR`)
- Server Actions

### Component Locations
Storial scans these directories:
- `components/`
- `src/components/`
- `app/components/`
- `lib/components/`

## Project Structure

```
storial/
├── server/
│   ├── index.ts           # Express API server
│   ├── scanner.ts         # Project analysis engine
│   ├── parser.ts          # Code parsing (imports, props, etc.)
│   ├── prompt-generator.ts # AI prompt generation
│   └── llm-logger.ts      # Generation logging
├── src/
│   ├── App.tsx            # Web UI
│   └── components/        # UI components
├── vscode-extension/
│   └── src/
│       ├── extension.ts   # Extension entry
│       ├── providers/     # Tree view providers
│       └── commands/      # VS Code commands
└── README.md
```

## API Reference

### Project Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/project` | GET | Get current project |
| `/api/project` | POST | Set project path |
| `/api/scan` | POST | Scan project |
| `/api/scan` | GET | Get cached scan |
| `/api/scan/overview` | GET | Get overview with stats |

### Story Generation
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stories/generate-with-llm` | POST | Generate stories |
| `/api/stories/:type/:name` | GET | Get stories for item |
| `/api/stories` | GET | List all stories |

### LLM Configuration
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/llm/settings` | GET/POST | Get/set LLM config |
| `/api/llm/test` | GET | Test LLM connection |
| `/api/llm/logs` | GET | List generation logs |

## Configuration

### LLM Settings

Stories are saved in your project's `.storial/` directory:
```
your-project/
└── .storial/
    ├── stories/
    │   ├── components/    # Component stories
    │   └── pages/         # Page stories
    ├── templates/         # Story templates
    └── llm-logs/          # Generation logs
```

### Environment Variables

```bash
# Optional: Set API keys via environment
export OPENROUTER_API_KEY=sk-or-...
export OPENAI_API_KEY=sk-...
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development

```bash
# Run server in development mode
npm run dev

# Run VS Code extension in development
cd vscode-extension
npm run watch
# Press F5 in VS Code to launch extension host
```

## Roadmap

### Current (v1.0)
- [x] Project scanning and analysis
- [x] Component/Hook/Context/Utility detection
- [x] Relationship mapping
- [x] Unused code detection
- [x] AI story generation (Local, OpenAI, OpenRouter)
- [x] VS Code extension
- [x] Web UI

### Planned
- [ ] Component preview with mock injection
- [ ] Visual component tree diagram
- [ ] Export relationships (JSON, Mermaid)
- [ ] Watch mode for incremental updates
- [ ] CI/CD integration

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- [GitHub Issues](https://github.com/amelmo/storial/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/amelmo/storial/discussions) - Questions and ideas

---

Built with care by the Storial team.
