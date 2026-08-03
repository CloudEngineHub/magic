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

## Benchmark

Run the quick Node packaging and real-browser smoke benchmarks:

```bash
pnpm run benchmark:smoke
```

Run the 200-page browser baseline against the tracked source code:

```bash
pnpm run benchmark
```

Run a comparison against an existing built `dist` artifact:

```bash
pnpm run benchmark:dist
```

Every report records the Git revision, target (`dist` or `source`), artifact SHA-256,
PptxGenJS version, timings, output size, and memory samples. Results from different target or
artifact hashes must not be compared as the same baseline. See [benchmarks/README.md](./benchmarks/README.md)
for scenarios, profiles, and CLI options.

## Package layout

This repository contains the self-contained open-source package. The public entry point is
`src/index.ts`; `vite.config.ts` builds it as ESM and CommonJS output under `dist/`, while
`tsconfig.json` emits the declaration files. The package does not depend on an `enterprise/`,
`customer/`, or Overlay source tree.

The repository-only benchmark harness lives under `benchmarks/` and is not included in the
published package. Its Node and Chromium runners can be type-checked with
`pnpm run typecheck` and are documented in [benchmarks/README.md](./benchmarks/README.md).

Application code consumes the package only through its public package name:

```ts
import { exportPPTX } from "@magic/html2pptx"
```

The package must be built before a workspace consumer resolves its `dist` exports. Commercial
applications may compose their own integration around these public exports, but no commercial
source or build configuration is part of this open-source package.

## Large-export runtime requirements

`exportPPTXStreaming` is the forward-only large-export API. Its built-in packaging path requires
the patched PptxGenJS streaming runtime to provide `beginStreaming()`, `writeTo()`, and
`createOpfsStagingStore()`. The current package metadata still declares `pptxgenjs: ^4.0.1` for
compatibility; the stock npm `pptxgenjs@4.0.1` does not provide this complete runtime. Until a
compatible PptxGenJS release and peer range are published, applications must install/use the
matching patched PptxGenJS build or inject an equivalent runtime through the package runtime
hooks. This README intentionally does not change the version or peer dependency.

### Packaging Worker URL

The ESM/Vite build emits the Packaging Worker under `dist/assets/` and resolves it when that
directory stays beside `dist/index.js`. Do not rely on that default for CJS browser consumers,
non-Vite bundlers, direct script loading, CDN/sub-path deployments, or copied/renamed assets.
Those integrations must pass an absolute `workerUrl` (or inject a host-owned `workerFactory` at
the lower-level packaging hook):

```ts
const workerUrl = new URL("https://static.example.com/html2pptx/packaging-worker.js")

const handle = exportPPTXStreaming(pages, {
	workerUrl,
	destination,
})
await handle.promise
```

The CJS build test covers this explicit override path. The browser smoke benchmark also accepts
`--target dist` to verify the generated ESM asset path after a package build.
