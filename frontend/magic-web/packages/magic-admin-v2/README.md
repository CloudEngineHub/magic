# Magic Admin V2

Magic Admin V2 is the open-source Magic administration frontend package, built with React, TypeScript, and Vite. It supports both embedded hosting in `magic-web` and independent standalone development.

## Quick start

### Run through the `magic-web` host

```bash
cd frontend/magic-web
pnpm install
pnpm dev
```

Open `/admin-v2/` on the host. In embedded mode, `magic-web` supplies authentication, authorization, API clients, organization context, account data, uploads, language, theme, and route mounting.

### Run standalone

```bash
cd frontend/magic-web/packages/magic-admin-v2
pnpm dev:opensource:local
```

Open `http://127.0.0.1:5174/admin-v2/`.

## Open-source layout

```text
magic-admin-v2/
├── src/       # Public application code, routes, runtime, i18n, and styles
├── tests/     # Public unit, component, and integration tests
└── docs/      # Development, UI, and feature configuration guides
```

This package intentionally contains no enterprise overlay or generated `dist/` artifacts.

## Commands

```bash
pnpm types:opensource
pnpm lint
pnpm test:unit
pnpm test:components
pnpm test:integration
pnpm build:opensource
```

## Package exports

```text
@dtyq/magic-admin-v2
@dtyq/magic-admin-v2/upload
@dtyq/magic-admin-v2/embedded.css
@dtyq/magic-admin-v2/styles.css
```

See [the development guide](./docs/DEVELOPMENT-GUIDE.md), [the UI guide](./docs/UI-DESIGN.md), and [the system capabilities guide](./docs/platform-system-capabilities-config-guide.md).
