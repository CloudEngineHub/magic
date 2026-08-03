# Static dependency resolution

This module resolves local resources referenced by a single document and exposes one result shape
to sharing, moving, copying, and downloading flows.

## Structure

- `types.ts`: stable contracts shared by parsers and business callers.
- `BaseStaticDependencyParser.ts`: common deduplication and transfer-root calculation.
- `parsers/`: one parser class per supported document type.
- `parserRegistry.ts`: the only place that selects a parser for a file.
- `resolveStaticDependencies.ts`: reads file content and exposes the business-facing entry point.

Flow: business caller -> resolver -> registry -> parser -> base normalization.

## Result fields

- `dependencyFileIds`: exact resource files used by sharing and downloading.
- `dependencyTransferFileIds`: directory-aware roots used by moving and copying so relative paths
  remain valid.

## Adding a file type

1. Add one parser class under `parsers/` and extend `BaseStaticDependencyParser`.
2. Implement `supports` and `collectDependencies` only.
3. Register the parser in `parserRegistry.ts`.
4. Add its colocated parser test. Business flows should not require file-type branches.
