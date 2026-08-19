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

Run the complete open-source P6 streaming gate (package checks, runtime
surface checks, 200/300-page Node pressure, and Chromium/Worker/OPFS smoke).
The Chromium gate requires Puppeteer's pinned browser:

```bash
pnpm exec puppeteer browsers install chrome
pnpm run ci:p6
```

`ci:p6` writes ignored machine-readable reports under `benchmarks/results/`.
It fails on a missing Worker, unavailable OPFS capability that is not reported
structurally, a broken CJS/ESM or declaration entry, a root-absolute worker
asset, a failed 200/300-page sample, a non-ZIP64 archive, a sink ACK mismatch,
or a partial-file cleanup/terminal telemetry error.

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
import { exportPPTXStreaming } from "@magic/html2pptx"
```

Version 2 removes the buffered `exportPPTX` and `generatePPTX` APIs. All exports must provide a
caller-owned destination and use `exportPPTXStreaming`; there is no Blob or in-memory fallback.

The package must be built before a workspace consumer resolves its `dist` exports. Commercial
applications may compose their own integration around these public exports, but no commercial
source or build configuration is part of this open-source package.

## Large-export runtime requirements

`exportPPTXStreaming` is the forward-only large-export API. Its built-in packaging path requires
the PptxGenJS v5 streaming runtime to provide `beginStreaming()`, `writeTo()`, and
`createOpfsStagingStore()`. Applications must use the PptxGenJS v5 build selected by this branch
or inject an equivalent runtime through the package runtime hooks.

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

### Browser capability matrix

Firefox and Safari are not assumed to implement the same OPFS/File System
Access subset as Chromium. `tests/browser-capability-matrix.test.ts` models
both engines' unavailable and restricted/private-context capabilities and
asserts the privacy-safe structured result:

```ts
{
  code: "opfs-unavailable",
  diagnostic: {
    phase: "preflight",
    details: { capability: "opfs-staging" }
  }
}
```

The matrix intentionally does not UA-sniff or expose the browser's user-agent
in diagnostics. A real Firefox/WebKit runner should still be scheduled on the
project's cross-browser infrastructure; the deterministic capability gate
keeps that external runner from being the only protection against a buffered
fallback regression.
