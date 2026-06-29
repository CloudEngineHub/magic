# SuperMagic 10k 文件渲染性能优化复盘

## 1. 背景

这次优化的背景是 SuperMagic 在大项目文件规模下的交互卡顿问题。典型场景是：

- 项目文件数接近或超过 10k。
- 页面为三栏结构：
  - 左侧：文件栏，负责文件树、选择、拖拽、多选、虚拟列表等。
  - 中间：详情栏，负责文件预览、Tab 缓存、Markdown/HTML/Office 等内容渲染。
  - 右侧：消息栏，任务运行时会持续 `pullMessage` 并推动页面状态更新。
- 小文件量下 `pullMessage` 不明显卡顿；10k 文件量下，任务运行时页面明显卡顿。

最关键的判断是：`pullMessage` 本身不是根因，它只是高频触发了页面更新；真正的问题是大文件数据在更新链路中穿透到昂贵的渲染路径，造成重复计算、重复渲染、同步大对象处理和 GC 压力。

## 2. 整体排查方法

这次排查不是一次定位完成的，而是逐步收敛：

1. 先观察文件栏相关指标，确认左侧文件树在 10k 下的基础成本。
2. 优化左侧文件栏的数据结构、派生计算、虚拟列表渲染和 prop 稳定性。
3. 发现左侧优化后页面仍然卡顿，改用排除法定位具体栏位。
4. 通过关闭文件树行渲染、关闭详情栏等方式，确认主要剩余卡顿来自中间详情栏。
5. 在详情栏继续拆分 `FilesViewer`、`TabCache`、`Render`、`ContentRenderer` 的 commit 成本。
6. 最终定位到 `FilesViewer` 中对 `otherProps` 执行 `JSON.stringify`，而 `otherProps` 带着 10k 文件级别的 `attachments/attachmentList` 引用。
7. 验证修复收益后收敛，只保留确定收益且低风险的改动，清理过细的诊断和实验性优化。

## 3. 左侧文件栏优化

### 3.1 初始问题

左侧文件栏在 10k 文件下承担了大量职责：

- 树结构构建和索引。
- 展开节点计算。
- 可见行计算。
- 文件选择、多选、拖拽、重命名、虚拟编辑状态。
- 虚拟列表渲染。
- 自定义 display config 处理。

初始阶段的问题主要集中在：

- 大量 Map / path 数据冗余，造成 JS heap 很高。
- 文件树派生数据在消息更新时容易重复计算。
- `CustomTree` 和行组件的 prop 不稳定，导致 memo 穿透。
- 多选状态等全局 UI 状态变化后，行组件 memo 过度阻止更新，出现 Checkbox 不消失的 bug。
- `manualPerfLogger` 早期 console 输出过多，也会污染性能观测。

### 3.2 主要处理

左侧文件栏做过几类优化。

#### 数据结构减负

对 `attachmentIndex` 做了内存方向的优化：

- 移除冗余的 `itemByKey` / `itemById` 等重复 Map。
- 移除每个 entry 上持有的 `pathKeys`。
- 路径信息改为按需基于 `parentKey` 回溯计算。

这类优化的收益主要体现在：

- 降低 10k 文件树下的常驻对象数量。
- 降低 JS heap 和 GC 压力。
- 避免文件规模继续增长时索引结构线性放大过快。

#### display config 处理优化

`attachmentDataProcessor` 里原来存在大量 parent chain 查找和 map lookup。优化后改为：

- 单次 DFS 预索引 `customEntryConfigByFileId`。
- 后续处理直接通过索引读取。

收益很明显：

- `map_lookup_count` 从早期约 64k 级别下降到个位数。
- `processAttachmentData_ms` / `display_config_process_ms` 从几十 ms 下降到个位数到十几 ms。

#### 虚拟列表和行渲染优化

对 `CustomTree` / `TopicFilesCore` 做过这些方向：

- 稳定事件 handler，避免每次 render 都生成新函数。
- `TreeNodeRow` 使用 memo 和自定义比较。
- `useVirtualizer` 的关键 option 尽量稳定。
- 提取 `useStableTreeNodeDragHandlers`，减少主组件中重复的拖拽 handler 包装。
- 提取 `useTopicFileRowRenderVersion`，集中管理哪些全局状态应该触发行重渲染。

其中 `rowRenderContextVersion` 是一个重要修复：多选关闭后 Checkbox 不消失，就是因为行组件被 memo 住了，但影响行 UI 的全局状态没有体现在行的 render version 里。加入后，行能够在多选、拖拽、重命名等全局状态变化时正确刷新。

### 3.3 左侧文件栏阶段收益

左侧优化后，文件栏自身已经明显改善：

- `visible_rows_build_ms` 降到约 `0.1ms` 级别。
- `visible_index_build_ms` 降到约 `0.1ms` 级别。
- `file_filter_ms` 基本接近 `0ms`。
- `processAttachmentData_ms` 后续稳定在个位数到十几 ms。
- `CustomTree_render_ms` 在不滚动时已经不是主要瓶颈。

这一阶段的核心收益是：左侧文件树从“高频更新时可疑的主瓶颈”，被优化并排除为主因。后续问题转向中间详情栏。

## 4. 中间详情栏优化

### 4.1 为什么转向详情栏

左侧优化后，用户仍然反馈任务运行时页面“还是卡”。于是改用排除法：

- 关闭左侧文件树行渲染后，仍然卡。
- 关闭中间详情栏后，不再卡。

这说明当 10k 文件数据更新时，中间详情栏被大文件数据间接拖慢。

这个判断非常关键，因为如果继续只盯着文件树虚拟列表，会误把第三方虚拟列表或左侧行渲染当成根因。

### 4.2 详情栏排查路径

详情栏主要链路是：

`Detail -> FilesViewer -> TabCache -> Render -> ContentRenderer -> 具体内容预览`

先对 `useFilesViewer` 派生计算打点：

- `files_viewer_collect_files_ms`
- `files_viewer_file_index_build_ms`
- `files_viewer_file_list_signature_ms`
- `files_viewer_tab_sync_ms`

结果显示这些计算都很低：

- `files_viewer_collect_files_ms` p95 大多在 `0.3ms - 1.7ms`。
- `files_viewer_file_index_build_ms` p95 大多在 `0.4ms - 2.5ms`。
- `files_viewer_file_list_signature_ms` p95 大多在 `1ms` 左右。
- `files_viewer_tab_sync_ms` 基本接近 `0ms`。

因此，`useFilesViewer` 的派生计算不是根因。

然后加入 commit 级日志，观察 render 到 layout effect 的耗时：

- `detail_commit_ms`
- `files_viewer_commit_ms`
- `tab_cache_commit_ms`
- `detail_render_commit_ms`

在修复前，关键指标非常高：

- `detail_commit_ms` p95 约 `428.1ms`。
- `files_viewer_commit_ms` p95 约 `214.7ms`，max 约 `241.3ms`。
- JS heap p95 约 `2966MB`。

这说明卡顿发生在 render/commit 阶段，而不是某个小的 JS 派生计算函数。

### 4.3 根因：`JSON.stringify(otherProps)`

最终定位到 `FilesViewer/index.tsx` 中的 effect 依赖：

```tsx
useEffect(() => {
  if (currentTab) {
    addToCache(currentTab.id, { isFullscreen, ...otherProps })
  }
}, [currentTab?.id, isFullscreen, JSON.stringify(otherProps), addToCache])
```

问题在于：

- `otherProps` 是 `getRenderProps(currentTab)` 的结果。
- 它包含 `attachments`、`attachmentList` 等大对象引用。
- 10k 文件下，这些对象非常大。
- 每次 render 都在同步执行 `JSON.stringify(otherProps)`。
- 任务运行时 `pullMessage` 推动页面更新，于是这个 stringify 在高频路径上反复执行。

这类问题很隐蔽，因为从代码表面看只是为了做 effect dependency，但实际等于每次 render 都深度序列化大对象。

### 4.4 最终保留的详情栏修复

最终收敛后只保留三个低风险改动。

#### 1. 移除 `JSON.stringify(otherProps)`

改为轻量 cache key：

- tab id
- refreshKey
- file id
- updated_at
- fullscreen 状态
- render type
- updatedAt
- activeFileId
- showFileFooter

这些都是 primitive 值，足够表达当前 tab render props 是否需要刷新缓存，不再深扫 10k 文件对象。

#### 2. active tab 使用当前 render props

缓存 tab 可以使用 cached props，但 active tab 应始终使用当前 render props，避免缓存导致当前预览内容陈旧。

#### 3. 清理 `useTabCache` 中的大对象 console 和重复 setState

`useTabCache.addToCache` 中原本有：

```tsx
console.log(renderProps, "renderProps")
```

而 `renderProps` 同样带着大文件引用。这个 console 不受 `manualPerfLogger` 开关控制，会让 DevTools 和浏览器持有大对象，增加性能与内存压力。

同时 `cachedTabIds` 更新改成：

- 先生成 next ids。
- 如果和 previous ids 完全一致，则返回 previous。
- 避免无意义 setState 触发 re-render。

### 4.5 详情栏收益

最关键的一刀是移除 `JSON.stringify(otherProps)`。

修复前：

- `detail_commit_ms` p95 约 `428.1ms`。
- `files_viewer_commit_ms` p95 约 `214.7ms`。
- `js_heap_used_mb` p95 约 `2966MB`。

修复后：

- `detail_commit_ms` p95 降到约 `63.6ms`。
- `files_viewer_commit_ms` p95 降到约 `58.1ms`。
- `js_heap_used_mb` p95 降到约 `1400MB - 1500MB`。

大致收益：

- `detail_commit_ms` p95 下降约 85%。
- `files_viewer_commit_ms` p95 下降约 73%。
- JS heap p95 下降约 50%。

用户体感也验证了这一点：在 `JSON.stringify(otherProps)` 优化后，基本已经不卡。

## 5. 哪些优化被验证后收敛掉了

后续曾进一步细分到 Markdown/Tiptap 预览：

- `content_renderer_md_commit_ms`
- `md_text_editor_commit_ms`
- `md_editor_body_commit_ms`
- `TextEditor` 自定义 memo comparator
- `isFileInPPTMode` WeakMap 索引缓存
- `EditorBody` 内部 extensions / onUpdate 稳定化

这些探索帮助确认剩余 50ms 左右主要是 Markdown/Tiptap 内容树自身 commit 成本。但从收益看：

- 继续优化没有明显改善用户核心体感。
- comparator 基本没有命中。
- 代码复杂度会上升。
- 容易引入预览内容陈旧、编辑状态不同步等风险。

因此最终清理掉这些过细的诊断和实验性优化，只保留已经验证有效的核心修复。

这是一次很重要的收敛：性能优化不能只追求指标继续下降，也要考虑风险、复杂度和真实体感收益。

## 6. 关键经验

### 6.1 不要把触发源误判为根因

`pullMessage` 是触发源，不是根因。

真正的问题是：消息更新让页面重新 render，而 render 链路里有大文件对象的同步深处理。

后续遇到类似问题时，要区分：

- 谁触发了更新。
- 谁在更新中做了昂贵工作。
- 谁让大对象穿透到了渲染路径。

### 6.2 大对象不要进入 render-time 深处理

10k 文件数据不能在 render 或 dependency array 中做：

- `JSON.stringify(largeObject)`
- 深比较。
- 深 clone。
- 大范围 `.map/.filter/.find`。
- 无保护的 console.log。

尤其要警惕“只是为了依赖比较”的代码，它们往往会在高频 render 中反复执行。

### 6.3 effect dependency 不能靠 stringify 兜底

`JSON.stringify` 放 dependency array 是非常危险的写法。

更好的方式是定义明确的 primitive signature：

- id
- updatedAt
- version
- active state
- type
- count
- 明确的业务状态 key

signature 应该表达“业务上什么变化需要重新执行 effect”，而不是把整个对象序列化后交给 React。

### 6.4 console.log 大对象也是性能问题

`console.log(renderProps)` 在 10k 文件量下不是无害日志。

它可能：

- 触发 DevTools 对大对象的保留。
- 增加序列化和对象展开成本。
- 干扰性能观测。
- 增加内存压力。

调试大对象时，应该只打印摘要：

- count
- id
- type
- updatedAt
- hash/signature

### 6.5 memo 不是越多越好

左侧文件行 memo 曾带来收益，但也引入了 Checkbox 不消失的问题。

原因是 memo 比较逻辑没有覆盖影响 UI 的全局状态。

后续使用 memo 时要明确：

- 这个组件 UI 受哪些 props 影响。
- 受哪些外部/global/context 状态影响。
- 是否需要 render version。
- comparator 是否会让 UI stale。

### 6.6 先排除，再优化

这次真正定位到详情栏，是靠排除法：

- 关文件树行渲染。
- 关详情栏。
- 拆 `FilesViewer` / `TabCache` / `Render` / `ContentRenderer`。

如果没有这个过程，很容易继续在左侧虚拟列表上投入时间。

性能问题尤其需要“定位具体组件树”，而不是只凭直觉优化最复杂的组件。

## 7. 后续开发注意事项

### 7.1 文件系统相关开发

文件系统 10k 规模下，后续开发要遵守：

- 新增派生数据时，优先考虑是否能复用已有 index。
- 避免给每个文件节点挂大量冗余字段。
- 树路径、祖先链、父子关系等数据按需计算或集中索引。
- 对 10k 文件数组做 `.find`、`.filter`、`.map` 前，要确认调用频率。
- 影响行 UI 的全局状态要进入 row render version，避免 memo 后 UI 不更新。

### 7.2 详情栏相关开发

详情栏尤其要注意：

- 不要把 `attachments/attachmentList` 这种大对象直接用于 stringify/deep compare。
- Tab 缓存更新要使用明确的 cache key。
- active tab 不要盲目使用 cached props，避免内容陈旧。
- cached tab ids 没变化时不要 setState。
- 大对象日志必须通过摘要打印。

### 7.3 性能打点策略

建议保留的思路：

- 先打派生计算耗时，判断是不是 JS 计算慢。
- 如果派生计算低，但体感卡，继续打 commit 级耗时。
- 如果 summary 聚合丢失维度，可以临时拆 metric 名，比如按 content type 拆。
- 定位完成后，要清掉临时诊断，避免监控本身成为成本。

### 7.4 收敛原则

性能优化结束前要问：

- 用户体感是否已经解决？
- 指标是否证明收益？
- 代码复杂度是否值得？
- 是否有 stale UI 风险？
- 是否留下了临时 flag/log/instrumentation？

这次最终结论是：`JSON.stringify(otherProps)` 是核心根因；Markdown 细分优化属于过度深入，应该清理。

## 8. 最终结论

这次优化的核心价值不是单点代码改动，而是把 10k 文件量下的性能问题从“整体页面卡顿”拆成了可验证的链路：

1. 左侧文件栏先完成数据结构和渲染稳定性优化，降低基础成本。
2. 排除法确认中间详情栏才是剩余卡顿主因。
3. 指标证明 `useFilesViewer` 派生计算不是瓶颈。
4. commit 级日志定位到 `FilesViewer` render/commit 阶段。
5. 最终发现 `JSON.stringify(otherProps)` 在 render 路径同步处理 10k 文件大对象。
6. 移除后，详情栏 commit p95 从数百 ms 降到几十 ms，用户体感基本恢复。

后续面对 10k 级数据结构时，最重要的原则是：大对象只能以引用和索引方式流动，不能在 render 高频路径里被深处理。
