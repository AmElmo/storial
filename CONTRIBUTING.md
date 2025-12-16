# Contributing to Storial

Thank you for your interest in contributing to Storial! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- VS Code (for extension development)

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/storial.git
   cd storial
   ```
3. Install dependencies:
   ```bash
   npm install
   cd vscode-extension && npm install
   ```
4. Start development:
   ```bash
   npm run dev
   ```

## Project Structure

```
storial/
├── server/              # Backend API server
│   ├── index.ts         # Express server & routes
│   ├── scanner.ts       # Project analysis
│   ├── parser.ts        # Code parsing
│   └── prompt-generator.ts # AI prompts
├── src/                 # Web UI (React + Vite)
├── vscode-extension/    # VS Code extension
│   └── src/
│       ├── extension.ts
│       ├── providers/
│       └── commands/
└── package.json
```

## Development Workflow

### Running the Server

```bash
npm run dev
```

This starts both the API server (port 3050) and web UI (port 5180).

### Running the VS Code Extension

1. Open the `vscode-extension` folder in VS Code
2. Run `npm run watch`
3. Press F5 to launch the Extension Development Host

### Code Style

- TypeScript for all code
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add support for Remix router detection
fix: handle edge case in component prop parsing
docs: update README with new API endpoints
refactor: simplify scanner logic for hooks
```

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Test thoroughly
4. Submit a PR with:
   - Clear description of changes
   - Screenshots for UI changes
   - Test steps if applicable

## Testing

### Manual Testing

1. Test against a real Next.js/React project
2. Verify the VS Code extension works correctly
3. Test story generation with different LLM providers

### Areas to Test

- Project scanning (App Router, Pages Router, React Router)
- Component detection and relationship mapping
- Story generation with Local LLM, OpenAI, OpenRouter
- VS Code extension tree view and commands
- Web UI functionality

## Areas for Contribution

### Good First Issues

- Documentation improvements
- Bug fixes in parsing logic
- UI/UX improvements
- Test coverage

### Feature Ideas

- Support for additional frameworks (Remix, Astro)
- More data fetching pattern detection
- Visual component relationship diagrams
- Export to Mermaid/GraphQL
- Watch mode for file changes

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Focus on the code, not the person

## Questions?

- Open a [GitHub Discussion](https://github.com/amelmo/storial/discussions)
- Check existing [Issues](https://github.com/amelmo/storial/issues)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
