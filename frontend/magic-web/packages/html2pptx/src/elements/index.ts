/**
 * Element aggregation entry point (element-domain facade).
 *
 * Aggregates parse + draw lookup surfaces by element type. Each subdirectory corresponds to one element kind:
 *   - shape  / image / text / table / media / border  -> primary elements
 *   - shared                                         -> cross-element shared parsers (background, shadow)
 *
 * Concrete implementations live in `parsers/` and `drawer`:
 *   - `parsers/`:parser implementations organized by parse stage
 *   - `drawer/` :worker-side draw implementations organized by node type
 *
 * This directory only re-exports modules and provides an element-based lookup entry point,
 * working with the `registry/` modules for dispatch.
 */
export * from "./shape"
export * from "./image"
export * from "./text"
export * from "./table"
export * from "./media"
export * from "./border"
export * from "./shared"
