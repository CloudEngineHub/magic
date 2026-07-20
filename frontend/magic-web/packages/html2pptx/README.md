# html2pptx

Convert HTML content to PPTX slides.

## Development

```bash
pnpm install
pnpm run dev
```

## Build

```bash
pnpm run build
```

## Test

```bash
pnpm run test
```

## Layered Overlay Architecture

The package derives its active edition from the folders present in the repository:

```text
src/ -> enterprise/src/ -> customer/src/
base    enterprise          customer
```

Later layers override files with the same logical relative path. Relative imports and `@/`
imports continue to resolve through the complete active layer stack. Worker bundles receive the
same source overlay through their isolated Vite plugin container.

The Vite architecture follows the same filesystem-driven composition model as Magic Web:

- `vite.config.ts` merges shared package configuration with the active Overlay contribution.
- `vite/config.ts` is the baseline layer's Vite configuration contribution.
- `vite/layers.ts` is the generic layer resolver and configuration composer.
- `vite/overlay.ts` is the single source of truth for the layer stack.
- `plugins/vite-plugin-overlay/` contains the generic source and Worker Overlay adapters used by
  the central composer.
- `customer/vite/config.ts` may contribute additional customer-specific Vite config when needed.

The generic source resolver stays in the open-source infrastructure but is only registered when
more than one source layer exists. With only `src/`, there is nothing to override and the resolver
remains inactive. Omitting `enterprise/` and `customer/` therefore produces the open-source build
without an active source or Worker Overlay. No `EDITION` environment variable or
business-application Vite config is involved.

This library has no HTML entry or `public/` asset contribution. Worker Overlay is part of the
generic source Overlay infrastructure and remains dormant when only the baseline `src/` exists.
Enterprise-only dependencies should be added under an `enterprise/` install root if such
dependencies are introduced in the future.

Application code consumes the package only through its public package name:

```ts
import { exportPPTX } from "@magic/html2pptx"
```

Consumers must not register the package Overlay plugin or alias the package name to `src`. The
package must be built before a workspace consumer resolves its `dist` exports.
