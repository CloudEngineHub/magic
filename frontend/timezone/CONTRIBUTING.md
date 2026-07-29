# Contributing Guide

Thanks for contributing to `@dtyq/timezone`.

## Prerequisites

- Node.js `>=18`
- pnpm `>=10`

## Local Development

```bash
pnpm install --no-frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test:ci
```

## Commit Convention

Use Conventional Commits, for example:

- `feat: add timezone list fallback`
- `fix: handle unix timestamp zero`
- `docs: update api contract`

## Pull Request Requirements

- Explain motivation and impact scope
- Include required tests
- Pass `lint + typecheck + test`
- Update README when public API changes
