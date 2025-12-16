<p align="center">
  <img src="https://raw.githubusercontent.com/AmElmo/storial/main/assets/logo.png" alt="Storial" width="120" />
</p>

<h1 align="center">Storial</h1>

<p align="center">
  <strong>AI-powered component stories for React & Next.js</strong>
</p>

<p align="center">
  Instantly understand your codebase. Generate isolated component stories with AI.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=amelmo.storial">
    <img src="https://img.shields.io/visual-studio-marketplace/v/amelmo.storial?label=VS%20Code&logo=visualstudiocode&logoColor=white&color=007ACC" alt="VS Code Marketplace" />
  </a>
  <a href="https://www.npmjs.com/package/storial">
    <img src="https://img.shields.io/npm/v/storial?color=CB3837&logo=npm&logoColor=white" alt="npm" />
  </a>
  <a href="https://github.com/AmElmo/storial/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/AmElmo/storial?color=blue" alt="License" />
  </a>
  <a href="https://github.com/AmElmo/storial/stargazers">
    <img src="https://img.shields.io/github/stars/AmElmo/storial?style=social" alt="GitHub Stars" />
  </a>
</p>

<br />

<p align="center">
  <img src="https://raw.githubusercontent.com/AmElmo/storial/main/assets/demo.gif" alt="Storial Demo" width="800" />
</p>

---

## What is Storial?

Storial is like **Storybook**, but without the setup headaches. Point it at any React or Next.js project and instantly:

- **See everything** - Pages, components, hooks, contexts, and how they connect
- **Generate stories** - AI creates isolated component stories with mock data
- **Test visually** - Preview components in different states without wiring up your whole app

No config files. No build plugins. Just run it.

<br />

## Quick Start

### Option 1: VS Code Extension (Recommended)

1. Install the [Storial extension](https://marketplace.visualstudio.com/items?itemName=amelmo.storial) from VS Code Marketplace
2. Open any React/Next.js project
3. Click the Storial icon in the sidebar
4. Done!

### Option 2: CLI

```bash
npx storial
```

Opens the web UI at `http://localhost:5180`

<br />

---

<br />

## Features

### Instant Project Analysis

Point Storial at your project and immediately see:

<p align="center">
  <img src="https://raw.githubusercontent.com/AmElmo/storial/main/assets/screenshot-analysis.png" alt="Project Analysis" width="700" />
</p>

- **Pages & Routes** - Next.js App Router, Pages Router, React Router
- **Components** - With props, types, and relationships
- **Hooks & Contexts** - Custom hooks with their dependencies
- **Utilities** - Helper functions and where they're used
- **Dead Code** - Unused exports highlighted instantly

<br />

### AI Story Generation

Generate comprehensive component stories with one click:

<p align="center">
  <img src="https://raw.githubusercontent.com/AmElmo/storial/main/assets/screenshot-stories.png" alt="Story Generation" width="700" />
</p>

- Multiple component states (default, loading, error, empty)
- Prop variations with realistic mock data
- Theme variants (light/dark)
- Responsive previews (mobile, tablet, desktop)

**Works with your favorite AI:**
- **Local LLM** - Free & offline with [LM Studio](https://lmstudio.ai/)
- **OpenAI** - GPT-4o-mini
- **OpenRouter** - Claude, GPT-4, Gemini, and 20+ models

<br />

### Component Dependencies

See exactly what each component uses and what uses it:

<p align="center">
  <img src="https://raw.githubusercontent.com/AmElmo/storial/main/assets/screenshot-dependencies.png" alt="Component Dependencies" width="700" />
</p>

- **Imports** - Which hooks, contexts, and utilities the component uses
- **Used by** - Which pages and components use this component
- **Props** - All props with their types
- **Data sources** - API calls, database queries, server actions

<br />

### VS Code Integration

<p align="center">
  <img src="https://raw.githubusercontent.com/AmElmo/storial/main/assets/screenshot-vscode.png" alt="VS Code Extension" width="700" />
</p>

- Tree view of your entire project structure
- Click any item to jump to source
- Right-click to generate stories
- Status bar shows server status and stats

<br />

---

<br />

## Setup

### Prerequisites

- Node.js 18+
- A React or Next.js project

### Installation

**VS Code Extension:**
```
1. Open VS Code
2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Search "Storial"
4. Click Install
```

**CLI / Global Install:**
```bash
npm install -g storial
```

**Or run directly:**
```bash
npx storial
```

<br />

### AI Setup (Optional)

For story generation, choose one:

| Provider | Setup | Cost |
|----------|-------|------|
| **LM Studio** | Download app, load model, start server | Free |
| **OpenAI** | Add `OPENAI_API_KEY` to `.env` | ~$0.01/story |
| **OpenRouter** | Add `OPENROUTER_API_KEY` to `.env` | Varies by model |

```bash
# .env in your project root
OPENAI_API_KEY=sk-...
# or
OPENROUTER_API_KEY=sk-or-...
```

<br />

---

<br />

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Your Project   │────▶│    Storial      │────▶│  Stories + UI   │
│                 │     │    (Scanner)    │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │                 │
                        │   AI Provider   │
                        │  (Optional)     │
                        │                 │
                        └─────────────────┘
```

1. **Scan** - Storial analyzes your codebase (AST parsing, no execution)
2. **Map** - Builds a relationship graph of all your code
3. **Generate** - AI creates stories based on actual component props and usage
4. **Preview** - View stories in isolation with mock data

<br />

---

<br />

## Supported

| Framework | Support |
|-----------|---------|
| Next.js App Router | ✅ |
| Next.js Pages Router | ✅ |
| React + Vite | ✅ |
| React + CRA | ✅ |

| Data Layer | Support |
|------------|---------|
| fetch | ✅ |
| Prisma | ✅ |
| Drizzle | ✅ |
| React Query | ✅ |
| SWR | ✅ |
| Server Actions | ✅ |

<br />

---

<br />

## Project Structure

```
your-project/
└── .storial/
    ├── stories/
    │   ├── components/    # Generated component stories
    │   └── pages/         # Generated page stories
    └── llm-logs/          # AI generation logs (for debugging)
```

Storial creates a `.storial` folder in your project. Add it to `.gitignore` or commit it - your choice.

<br />

---

<br />

## Contributing

We'd love your help! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Clone the repo
git clone https://github.com/AmElmo/storial.git
cd storial

# Install dependencies
npm install

# Start development
npm run dev
```

<br />

---

<br />

## License

MIT - do whatever you want with it.

<br />

## Links

- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=amelmo.storial)
- [npm Package](https://www.npmjs.com/package/storial)
- [GitHub Issues](https://github.com/AmElmo/storial/issues)
- [GitHub Discussions](https://github.com/AmElmo/storial/discussions)

<br />

---

<p align="center">
  <sub>Built by <a href="https://github.com/AmElmo">@AmElmo</a></sub>
</p>
