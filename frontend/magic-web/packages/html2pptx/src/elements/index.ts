/**
 * 元素聚合入口（element-domain facade）。
 *
 * 按元素类型聚合 parse + draw 的查找面。每个子目录对应一种元素：
 *   - shape  / image / text / table / media / border  → 主元素
 *   - shared                                         → 跨元素共享 parse（背景、阴影）
 *
 * 真实实现位于 `parsers/` 与 `drawer/`：
 *   - `parsers/`：按解析阶段组织的具体 parser 实现
 *   - `drawer/` ：按节点类型组织的 worker 端绘制实现
 *
 * 本目录仅做 re-export，提供"按元素查找"的入口面，
 * 与 `registry/` 注册表配合用于派发。
 */
export * from "./shape"
export * from "./image"
export * from "./text"
export * from "./table"
export * from "./media"
export * from "./border"
export * from "./shared"
