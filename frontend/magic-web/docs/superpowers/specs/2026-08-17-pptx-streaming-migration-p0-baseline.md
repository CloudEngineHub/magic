# PPTX streaming-only 迁移 P0 基线

**日期：** 2026-08-17
**阶段：** P0，建立迁移基线
**状态：** 已完成
**范围：** PptxGenJS、Magic 开源分支、Magic 商业化分支

本文件是阶段化执行的基线记录。P0 只冻结事实和契约，不在本阶段删除代码；后续阶段必须以本文件中的快照、版本和产物身份作为对比依据。

## 1. 分支与快照

| 仓库/分支 | 当前 revision | 迁移前快照 | 说明 |
| --- | --- | --- | --- |
| PptxGenJS `feat/pptxgenjs-v5-streaming-only` | `20215ae8b4080fa3b3715dfc587ae2e91bdfbf0c` | v5 基线记录 `08ffbe0a0a0712318a6d51ebee73a8521c9e16ba`；前置代码 `cb718e22c358b1a00454132e761804d85fc4c327` | v5 分支已存在，未推送 |
| Magic 开源 `feat/html2ppt-upgrade-open` | `10f5e1be0e14010dfc323165780e1836006a0f3e` | tag `pre-pptxgenjs-v5-open-20260814` → `89a9fdb26adffc7e911b882409e8322b50d6ddd8` | streaming-only 公共迁移已完成 |
| Magic 商业化 `feat/html2ppt-upgrade-en` | `9e4e7c145806d816b5f18ddf75424e4a693d2119` | tag `pre-pptxgenjs-v5-en-20260814` → `9e4e7c145806d816b5f18ddf75424e4a693d2119` | 尚未同步开源迁移提交 |

两个 Magic 分支的迁移前快照均已存在，不重复创建或覆盖 tag。P0 没有切换当前工作分支，也没有推送远端。

## 2. 版本契约

### 当前开源迁移侧

| 项目 | 当前值 |
| --- | --- |
| PptxGenJS | `5.0.0`，当前通过本机 `file:` 依赖联调 |
| `@magic/html2pptx` | `2.0.0` |
| Magic Web | `3.0.0` |
| 输出契约 | destination-first，`writeTo()` / `beginStreaming()` / `exportPPTXStreaming()` |
| 输出策略 | 仅 `file-stream`；能力不足时 `unavailable` |

### 商业化分支当前值

| 项目 | 当前值 |
| --- | --- |
| PptxGenJS | `^4.0.1` |
| `@magic/html2pptx` | `1.0.1` |
| 输出契约 | 仍包含 v4/旧 Worker 迁移面，待 P4 同步和改造 |

PptxGenJS v5 在正式发布前必须替换 Magic 两处本机 `file:` 依赖为可复现的 registry 版本或固定 Git commit。

## 3. Lockfile、patch 与构建产物身份

| 项目 | 迁移前 | 当前开源工作区 |
| --- | --- | --- |
| Magic `pnpm-lock.yaml` SHA-256 | `3418a4a208fe36513af1cfc8681f518683df5c295ca282328230c884e4293541` | `c52224c100ea05e2adf5fcc08ba7e83391d8f8352a1bedcbf1ff30fc83d3f3f6` |
| `pptxgenjs@4.0.1.patch` | `550dcca0745a9aaa5b5d14cff4a36957309d3d0e8232743d12de7a5fb0053a82` | 已删除 |
| PptxGenJS `dist` tree SHA-256 | `be9aec8264e494b681b3ac0d7b53077669248e7c86bbe75919f41ead7419e229` | `f913194c8318cb8bce3cb6876d6695019472b577abdd79aab9c283283c23ad03`（7 个文件） |
| html2pptx `dist` tree SHA-256 | v1 快照未冻结 | `ac78580981901fcc9ac43b4e720890450f893605e4b5585c892d08b175e0af63`（248 个文件） |

当前 html2pptx Packaging Worker 资产为：

```text
dist/assets/packaging-worker-Dl4cht3V.js
```

该文件名和 dist tree hash 共同作为当前 Worker build identity。任何发布包、主线程 bundle 和 Worker bundle 必须成套验证，不能只替换其中一个文件。

## 4. 旧 API 和旧输出基线

迁移前的主要旧表面已在 PptxGenJS v5 基线记录中冻结，包含：

- PptxGenJS `exportPresentation()`、`write()`、`stream()`、旧 `writeFile()`、`toLegacyOutput()`。
- `WRITE_OUTPUT_TYPE`、`ZIP_OUTPUT_TYPE`、`JSZIP_OUTPUT_TYPE`、`OutputType` 和 `outputType`。
- `encodeSlideMediaRels()`、buffered presentation adapter、旧 JSZip 输出链路。
- Magic `generatePPTX()`、`exportPPTX()`、`createPptxGenerator()`、`createPptxExporter()`。
- Magic `package-presentation.ts`、旧增量打包器、旧 Worker 协议和 `pptxgenjs@4.0.1` patch。

当前开源生产源码的精确符号扫描结果：

```text
generatePPTX                         0
exportPPTX（精确标识符）             0
createPptxGenerator                  0
createPptxExporter                   0
forceLegacy                          0
legacyFallback                       0
toLegacyOutput                       0
encodeSlideMediaRels                 0
旧 outputType arraybuffer/blob/base64/memory  0
```

扫描排除了文档、benchmark 和通用业务 API；普通聊天 `stream()`、文件系统 `writeFile()`、媒体 `Blob.stream()` 不属于 PPTX 旧输出 API，不能误删。

商业化分支当前仍命中上述 v4/旧输出迁移面，具体 Enterprise Worker、字体和增量打包文件留到 P4 处理；P0 不修改商业代码。

## 5. 不可变契约

后续阶段必须保持以下约束：

1. PPTX 最终字节只能写入调用方提供的 Writable、Node file sink 或 OPFS staging target。
2. 主线程和 Worker 不得生成完整最终 Blob、ArrayBuffer、Buffer 或 Base64 PPTX 结果。
3. 浏览器不支持文件流时只能返回结构化 `unavailable`，不得静默回退 v4 内存路径。
4. 开源和商业分支最终使用同一个精确 PptxGenJS v5 版本、lockfile artifact 和 Worker build identity。
5. 失败回滚必须以应用、PptxGenJS、Worker、lockfile、manifest 和构建产物为完整组合，不能只替换单个 JavaScript 文件。

## 6. P0 退出条件

- [x] 当前分支、快照 tag、PptxGenJS v5 分支已记录。
- [x] 版本、lockfile、patch、dist 和 Worker identity 已记录。
- [x] 开源与商业分支边界已记录。
- [x] 旧 API/旧输出表面清单已记录。
- [x] P0 未新增旧 API 删除或兼容回退。

P0 完成后暂停。下一阶段是 **P1：核验并补齐 PptxGenJS v5 streaming-only 核心契约**，完成后再次暂停汇报。
