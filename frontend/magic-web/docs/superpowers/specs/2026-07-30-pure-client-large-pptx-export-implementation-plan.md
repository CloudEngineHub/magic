# 纯客户端超大 PPTX 导出执行计划

**日期：** 2026-07-30
**状态：** 主体实现完成，进入发布阻塞清理与真机验收（开源分支）
**对应方案：** [纯客户端超大 PPTX 导出方案](./2026-07-30-pure-client-large-pptx-export-design.md)

## 当前执行状态（2026-08-17）

本计划最初用于指导大版本迁移，代码主链路目前已经落地在开源分支
`feat/html2ppt-upgrade-open`。当前交付口径是 **streaming-only**：PptxGenJS v5
和 `@magic/html2pptx` v2 不再保留完整 PPTX 的 Blob、ArrayBuffer、Buffer 聚合输出，
也不再通过 legacy/forceLegacy/fallback 路由切回旧实现。

已完成的代码级工作：

- PptxGenJS v5 已删除 buffered presentation export、旧 Blob/Buffer API 和 JSZip 运行时打包路径，统一使用 zip.js 流式写出。
- html2pptx v2 已删除旧 packaging/pipeline 文件，只保留 `exportPPTXStreaming`，并强制调用方在异步工作开始前提供 destination。
- Magic 页面处理、Worker/OPFS 暂存、背压、取消、失败清理、BigInt 字节计数和超宽 autoSize 页失败语义已接入并有回归测试。
- 普通页面源失败不会再被转换为空白成功页；全部页面失败会显式失败。
- 开源分支的技术方案与技术附录已同步到当前架构；商业化分支 `feat/html2ppt-upgrade-en` 不在本次变更范围内。

尚未满足正式发布条件的事项：

1. PptxGenJS v5 尚未发布到 registry，Magic 仍使用本机 `file:` 依赖，不能直接用于 CI、Docker 或干净 checkout。
2. 需要完成固定 commit/registry 依赖替换并重新生成冻结 lockfile。
3. 需要完成低性能设备、Windows/macOS PowerPoint、ZIP64 和多 GB 长测验收。
4. 需要修正 Docker build context 与 pnpm 版本固定，随后再进行开源分支的发布检查。

因此，当前分支可称为“源码迁移与本机集成完成”，不能称为“可直接发布版本”。

## 1. 项目目标

本项目要同时完成三件事：

1. 典型 200 页图文场景总耗时下降至少 20%，内部目标为 25%～35%。
2. 300 页、多 GB 文件在低性能设备上能够稳定导出，内存不随文件体积线性增长。
3. 用户只点击一次并选择保存位置，后续自动完成，不生成最终完整 Blob。

核心发布门槛：

| 指标 | 发布门槛 |
|---|---:|
| 200 页典型图文总耗时 | P50 下降 ≥20%，P95 下降 ≥15% |
| 媒体打包阶段 | P50 下降 ≥60%，挑战目标 75% |
| 峰值 JS Heap | 相比旧方案下降 ≥60%，低端设备建议 ≤400～500MB |
| 标准 200 页认证集 | 连续 100 次成功率 ≥99% |
| 多 GB 本地认证集 | 规定轮次全部成功 |

## 2. 执行顺序

```text
阶段 0：建立基线和埋点（代码级完成）
        ↓
阶段 1：zip.js / 浏览器写盘 / ZIP64 POC（代码级完成，长测待验收）
        ↓
阶段 2：PptxGenJS Writer 与媒体模型改造（完成）
        ↓
阶段 3：逐页 StreamingSession（完成）
        ↓
阶段 4：magic-web 接入（完成）
        ↓
阶段 5：完整兼容与性能验收（进行中）
        ↓
阶段 6：灰度发布
```

阶段 1 的代码门禁已经通过，因此已进入阶段 5；尚未完成的是跨平台、低性能设备和多 GB 长测门禁。

## 3. 阶段 0：建立基线和埋点

**预计时间：** 2～3 个工作日

### 工作内容

- 固定当前分支、PptxGenJS commit、浏览器版本和测试设备。
- 增加以下阶段耗时：页面准备、页面渲染、媒体读取、图片转换、OOXML 生成、ZIP 写入、磁盘背压、finalize 和总耗时。
- 记录首字节时间、输出大小、JS Heap、Worker 内存、RSS 和失败阶段。
- 冷缓存与热缓存分开测试。
- 将每页固定 1.5 秒等待单独记录，不能混在页面渲染耗时中。

### 固定数据集

| 编号 | 数据集 |
|---|---|
| S1 | 200 页纯文字/形状，输出小于 10MB |
| S2 | 200 页普通图片，每页 3 张，输出约 100MB |
| S3 | 200 页典型混合图文，输出约 300～500MB |
| S4 | 200 页大图片直接透传，累计约 1GB |
| S5 | 200 页视频/音频，本地素材累计 2GB、5GB |
| S6 | 必须解码或缩放的高像素图片 |
| S7 | ZIP64 边界、8GB 和 20GB 长测 |

### 产出物

- 当前方案性能基线报告。
- 每个数据集的 P50/P95、峰值内存和成功率。
- 新旧方案统一的 benchmark 脚本与结果格式。

### 退出条件

- 所有后续指标都能通过自动埋点得到。
- 同一数据集连续执行的结果波动在可解释范围内。
- 项目组确认最终对比口径。

## 4. 阶段 1：关键能力 POC

**预计时间：** 5～7 个工作日
**当前状态：** 代码验证完成；浏览器真机、PowerPoint 和 ZIP64 长测待完成。

### POC 1：zip.js 流式 Writer

- 使用当前 PptxGenJS 生成的真实 PPTX entries，不先修改 OOXML。
- zip.js 顺序写入 WritableStream。
- XML 使用 DEFLATE，图片、视频和音频使用 STORE。
- 对比当前 JSZip 的耗时、内存和解包结果。

退出条件：

- 图片和视频样本通过 ZIP 校验及 PowerPoint 打开验证。
- 媒体打包耗时和峰值内存至少下降 50%。
- 不生成最终完整 Buffer、Blob 或 ArrayBuffer。

### POC 2：浏览器一次点击直接写盘

- 用户点击时立即取得 FileSystemFileHandle。
- Worker 输出通过有界 chunk 队列写入文件。
- 在途 chunk 控制在 1～2 个，并支持背压。
- 验证取消、磁盘写满、权限撤销和 Worker 异常。

退出条件：

- 1GB 文件一次点击完成，无第二次下载动作。
- 已写字节增长时 Heap 不线性增长。
- 失败时不提示成功，临时数据能够清理。

### POC 3：ZIP64 与 PowerPoint

至少验证：

- archive 大于 4GiB、每个 entry 小于 4GiB。
- 单个媒体 entry 大于 4GiB。
- ZIP entry count 的 65,534/65,535 边界。
- 8GB、20GB 长时间写入。

退出条件：

- ZIP64 EOCD、locator、extra field 和 CRC 正确。
- Windows/macOS PowerPoint 无修复提示打开。
- 目标文件系统能力不足时能够提前提示或明确失败。

### 阶段门禁

任何一个 POC 未通过，都暂停主重构，先解决底层问题。

## 5. 阶段 2：PptxGenJS 基础改造

**预计时间：** 8～12 个工作日
**当前状态：** 已完成，PptxGenJS v5 分支已提交本地实现。

### 第一步：引入中立接口

- `ByteSource`：文本、Uint8Array、Blob/File、ReadableStream、URL、OPFS 文件。
- `OutputSink`：文件流、Worker Sink、Node stream、兼容 Memory Sink。
- `PackageWriter`：add、close、abort、progress。
- 运行时统一使用 zip.js；JSZip 仅可作为测试夹具或 XML 断言依赖，不再作为 PPTX 运行时 adapter。

### 第二步：拆分导出逻辑

- 将 `exportPresentation()` 拆成 `PresentationPartEmitter + PackageWriter`。
- JSZip 和 zip.js 必须共用同一套 XML、relationship 和 Content Types 生成逻辑。
- 图表、字体、notes、master/layout 不得直接操作具体 ZIP 引擎。

### 第三步：改造媒体输入

- 正式大文件路径删除“完整读取 → base64 → JSZip 再解码”。
- File、Blob、URL 和 OPFS 文件直接作为二进制 Source。
- 先实现 identity/path 去重，不在第一阶段做全文件内容哈希。
- 图片、视频、音频默认不重复压缩。

### 第四步：增加新输出 API

- `writeTo(sink)` 和 `beginStreaming()` 构成 v5 的 destination-first 流式接口。
- 删除 `write()`、`writeFile()`、`stream()` 及其 Blob/ArrayBuffer/Buffer 返回路径，不保留旧小文件兼容输出。
- 只有媒体输入仍可接受 Blob/File/受限 ArrayBuffer；这不代表保留旧 PPTX 输出实现。

### 退出条件

- 当前公开 API 回归通过。
- 新媒体路径不存在多 GB base64。
- POC 数据接入真实 PptxGenJS 后，媒体打包耗时下降 ≥60%。
- 图片和视频样本峰值内存下降 ≥60%。

## 6. 阶段 3：逐页 StreamingSession

**预计时间：** 7～10 个工作日
**当前状态：** 已完成代码实现和单元/集成测试。

### 工作内容

- 实现 `beginStreaming()`、`commitSlide()`、`finalize()`。
- begin 后冻结主题、母版、布局、字体和页面顺序。
- 页面 XML、rels、notes 和媒体关系在 commit 时确定。
- 页面提交后释放完整 slide，只保留轻量 manifest。
- finalize 只生成包级 XML 和 ZIP central directory。
- ZIP writer 同一时间只允许一个活动 entry。

### 第一批支持范围

- 固定尺寸页面。
- 文字、形状、普通图片、视频、音频和基础图表。
- 页面背景、notes、master/layout 和基本内部链接。

### 退出条件

- 300 页测试中 Heap 在稳定区间波动，不随页数单调上涨。
- 已提交页面在 Heap snapshot 中不可达。
- 生成文件结构与旧方案语义一致。
- Windows/macOS PowerPoint 正常打开。

## 7. 阶段 4：magic-web 接入

**预计时间：** 7～10 个工作日
**当前状态：** 已完成代码接入；仍需真机性能数据验证目标是否达标。

### 工作内容

- `prepareHtmlPagesForExport()` 从全量 Promise.all 改为逐页 AsyncIterable。
- 页面就绪从固定 1.5 秒等待改为事件驱动，保留有上限的兜底超时。
- HTML → IR → commitSlide 全链路逐页执行。
- 图片转换并发、ZIP entry 并发默认都设为 1。
- Worker 与主线程之间增加 ACK 和背压。
- 接入一次点击保存、分阶段进度、取消和错误清理。
- OPFS 只用于 rolling-stage、页面 IR、转换产物和临时工作簿。

### 退出条件

- S3 典型 200 页图文总耗时 P50 下降 ≥20%，P95 下降 ≥15%。
- 固定尺寸模式选择保存位置后 P50 5 秒内开始写盘。
- 纯文字小文件总耗时 P50 不回退超过 5%。
- 页面处理完成后内存能够回落。
- 用户只需要一次点击和一次保存位置选择。

## 8. 阶段 5：完整兼容与验收

**预计时间：** 7～10 个工作日
**当前状态：** 进行中，是当前唯一的功能发布门禁阶段。

### 补齐能力

- autoSize、autoPage 和 tableToSlides。
- 图表内嵌 XLSX 的 zip.js 迁移。
- 字体、SVG preview、复杂内部链接和 section。
- 大图片预检、原图透传和降级策略。
- 远程媒体 direct-stream / rolling-stage 策略。
- central-directory metadata 超预算后的落盘策略。

### 性能与稳定性门禁

- S3 连续 100 次成功率 ≥99%。
- 1GB 数据集在低端设备完成 20/20 次。
- 2GB 完成 10/10 次，5GB 完成 5/5 次。
- 8GB 至少完成 3 次，20GB 至少完成 1 次完整长测。
- 1GB 增长到 5GB 时，额外 Heap 增长不超过 100～150MB。
- 输出 chunk 在途不超过 8MB，buffered ZIP entry 为 0。
- PowerPoint Windows/macOS 打开、保存、重新打开均无修复提示。

## 9. 阶段 6：灰度发布

**预计时间：** 2～3 周观察期，可与开发收尾并行

### 放量顺序

1. 研发 synthetic 数据。
2. 内部员工，文件 ≤500MB。
3. 1% 用户，先覆盖 ≤1GB。
4. 5% 用户，开放通过认证的 ZIP64 环境。
5. 20% → 50%。
6. 100%。

每一档至少观察 3～5 天，并按 `<100MB / 100～500MB / 500MB～1GB / 1GB+` 分桶统计。

### 必须保留

- zip.js 和 streaming feature flag。
- ZIP64 独立开关。
- 紧急关闭和版本回滚能力。

feature flag 只控制 streaming-only 能力是否可用，不得再承担切换到旧 Blob/Buffer 实现的职责。

### 立即暂停或回滚条件

- 任意可复现的 PPTX 损坏或 PowerPoint 修复提示。
- 出现假成功、取消后继续写盘或临时数据无法清理。
- 同桶成功率下降 0.5 个百分点以上，或生产成功率低于 99%。
- 典型数据集 P95 总耗时比旧方案恶化超过 15%。
- 低端设备 OOM/崩溃率超过 0.1%。
- Heap 随文件大小明显线性增长，或出现 buffered ZIP entry。

## 10. 建议人员与工期

按 2 名熟悉前端基础设施/PptxGenJS 的研发和 1 名 QA 估算：

| 工作 | 人力建议 |
|---|---|
| PptxGenJS、zip.js、ZIP64 | 1 名研发主责 |
| magic-web、Worker、页面流水线 | 1 名研发主责 |
| 数据集、PowerPoint 兼容、低端设备长测 | 1 名 QA，研发协助 |

研发主链路预计 6～8 周，之后需要至少 2～3 周灰度观察。POC 结果、复杂图表/字体兼容情况以及 zip.js 是否需要维护内部 fork，会影响最终工期。

## 11. 当前执行队列

1. 整理并冻结开源侧 API/测试变更，完成 typecheck、测试、构建和静态旧 API 扫描。
2. 等 PptxGenJS v5 发布或取得可复现的 Git commit 后，替换 Magic 两处本机 `file:` 依赖并重新生成冻结 lockfile。
3. 修正 Docker build context（锁文件、workspace 配置、仓库内 eslint 和固定 pnpm 版本），在干净 checkout 中执行安装与构建。
4. 固化 S1～S7 数据集，完成低性能设备、浏览器 OPFS、ZIP64、取消/磁盘写满和 Worker 异常验收。
5. 使用 Windows/macOS 认证版本 PowerPoint 打开、保存、重新打开生成文件，确认无修复提示。
6. 记录 P50/P95、峰值 Heap、首字节时间和成功率；只有全部门禁通过后，才进入灰度发布。

在上述依赖发布和真机验收完成前，不推送 PptxGenJS 分支，也不把当前本机联调状态标记为正式发布版本。
