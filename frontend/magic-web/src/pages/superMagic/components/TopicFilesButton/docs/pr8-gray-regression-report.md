# PR-8 灰度回归对比

生成日期：2026-06-05  
当前输入：仓库根目录 `result.json`

## 数据规模

| 指标                       | 当前值 |
| -------------------------- | -----: |
| attachments_count          |  10463 |
| file_count                 |   9034 |
| directory_count            |   1429 |
| tree_depth                 |     12 |
| response_bytes_mb          |  51.48 |
| attachments_bfs_page_count |     11 |

## 当前采样结论

| 场景           | 当前关键指标                                                                                        | 结论                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 附件完整加载   | `attachments_v2_load_total_ms=6302.4ms`，`attachments_v2_page_fetch_ms p95=973.4ms`                 | 总耗时回到 6.3s，仍主要来自 11 页请求累积。                                                 |
| 增量提交       | `attachments_incremental_merge_ms p95=0.8ms`，`attachments_incremental_commit_ms p95=641.5ms`       | merge 很快，但 commit 有明显尖刺，是本轮首要异常点。                                        |
| 首屏可交互     | `tree_first_interactive=556.9ms`                                                                    | 首屏继续改善，明显早于完整加载完成。                                                        |
| 搜索           | 本轮未出现 `search_ms` / `search_input_to_visible`                                                  | 当前采样未覆盖搜索场景，沿用上一轮结论：`search_ms p95=4.6ms`。                             |
| 选择           | 本轮未出现 `selection_compute_ms` / `selected_count_compute_ms`                                     | 当前采样未覆盖选择场景，沿用上一轮结论：`selection_compute_ms p95=4.5ms`。                  |
| treeIndex      | `tree_index_build_ms p95=8.4ms`，`max=11.5ms`，`tree_index_map_entry_count p95=73241`               | 构建成本仍可接受，结构规模符合 10k 节点预期。                                               |
| visible rows   | `visible_rows_build_ms p95=0.1ms`，`visible_index_build_ms p95=0.1ms`，`visible_rows_count p95=140` | PR-5 数据侧可见行计算稳定。                                                                 |
| DOM 渲染       | `rendered_dom_nodes p95=140`，`CustomTree_render_ms p50=7.2ms`，`p95=119.3ms`，`max=328.3ms`        | 常规渲染很低，但 p95/max 仍有尖刺，需要和 incremental commit 关联排查。                     |
| display config | `display_config_process_ms p95=31.6ms`，`processAttachmentData_ms p95=33.3ms`                       | 相比上一轮下降，不是当前最大瓶颈。                                                          |
| 内存           | `js_heap_used_mb p50=589.33MB`，`p95=1241.03MB`                                                     | p95 升高，需继续查常驻对象和 GC 后 heap；treeIndex 结构计数不支持“treeIndex 爆炸”这一判断。 |

## 与上一轮异常采样对比

| 指标                             |  异常采样 | 上一轮稳定采样 |  当前采样 | 判断                                               |
| -------------------------------- | --------: | -------------: | --------: | -------------------------------------------------- |
| attachments_v2_load_total_ms avg |  7001.5ms |       4914.8ms |  6302.4ms | 比上一轮慢，仍受分页请求限制。                     |
| attachments_v2_page_fetch_ms p95 |  1144.3ms |        801.2ms |   973.4ms | 比上一轮慢，但低于异常采样。                       |
| tree_first_interactive avg       |  755.95ms |        617.6ms |   556.9ms | 继续改善。                                         |
| tree_index_build_ms p95          |    19.3ms |          7.3ms |     8.4ms | 稳定。                                             |
| CustomTree_render_ms p95         |   408.2ms |         25.7ms |   119.3ms | 比上一轮变差，但远低于异常采样；需查 commit 尖刺。 |
| rendered_dom_nodes p95           |       167 |            172 |       140 | DOM 挂载更少。                                     |
| js_heap_used_mb p95              | 1049.35MB |       893.81MB | 1241.03MB | 变差，需继续内存专项排查。                         |

## Plan 验收状态

| PR                         | 状态       | 说明                                                                               |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| PR-1 指标 + baseline       | 已完成主体 | 当前可导出 loader、search、selection、visible rows、render、heap、long task 指标。 |
| PR-2 搜索止血              | 通过       | 搜索计算 p95 低，连续输入计算次数控制住。                                          |
| PR-3 selectionEnabled 早退 | 通过       | 普通场景不再承受旧选择索引压力，选择场景 p95 低。                                  |
| PR-4 只读 treeIndex        | 通过       | 构建 p95 7.3ms，已支撑 PR-5/PR-6/PR-7。                                            |
| PR-5 visible rows 上移     | 通过主体   | DOM 受控；但 `large_tree_mode=0`，说明不是完整 feature flag 灰度版。               |
| PR-6 选择深度优化          | 通过       | selected count 与 selection compute 均稳定。                                       |
| PR-7 递归查找迁移          | 已完成代码 | 定位、快捷键、右键菜单已迁移到 treeIndex；本轮已拿到 treeIndex 结构计数。          |
| PR-8 灰度回归              | 进行中     | 当前还缺真正灰度开关/fallback 与完整手工回归表。                                   |

## 灰度状态

当前指标仍为：

- `large_tree_mode=0`
- `feature_flag_state=0`

代码里的 feature flag 仍是 `legacy_disabled` / `pr1_empty_feature_flag` 占位口径。也就是说，当前优化已经进入主链路，但还不是 plan 中描述的 URL/localStorage/auto flag + fallback 的完整灰度实现。

后续若要补完整灰度，需要至少具备：

- URL/localStorage 强制开关。
- 自动判断大树模式，并在 projectId 生命周期内不 flip。
- 异常 fallback legacy，并记录 `large_tree_fallback_count` 与 fallback reason。
- share/readonly、移动端、快速切项目、full refresh 的回归结果表。

## treeIndex 内存判断

结论：当前 treeIndex 不太可能单独导致内存爆炸，但它确实增加了一层索引结构，应该继续用结构计数和 heap 指标观察。

原因：

- treeIndex 不深拷贝 `AttachmentItem` 和 `TreeNodeData`，主要保存对象引用。
- 主要新增成本是 7 组 Map、`TreeIndexEntry` 对象、`allKeys/rootKeys`、每个节点一份 `pathKeys` 数组、每个节点一份直接子 key 数组。
- PR-6 没有为每个节点长期保存 descendantIds，避免了最容易膨胀的“每节点后代数组”。
- 当前 10k 数据、深度 12 下，`tree_index_path_key_ref_count p95=65198`，低于上界 `10463 * 12 = 125556`；`tree_index_child_key_ref_count p95=10451`，接近节点边数；`tree_index_map_entry_count p95=73241`，符合约 `7n` 的预期。

风险点：

- `pathKeys` 是按节点常驻数组，极端深树会放大为 O(n \* depth)。当前 depth=12 风险可控。
- 7 组 Map 的条目数约为 O(n)，10k 规模通常是数 MB 到低几十 MB 级别的额外结构成本，不应解释 800MB+ heap。
- 当前 `js_heap_used_mb p95=1241.03MB` 更可能来自 51MB 响应对象、raw/normalized/tree/list 多份常驻、display_config、viewer index、React/devtools/dev mode 或 GC 时机等叠加。

本轮已补充 treeIndex 结构指标：

- `tree_index_entry_count`
- `tree_index_map_entry_count`
- `tree_index_path_key_ref_count`
- `tree_index_child_key_ref_count`
- `tree_index_max_path_depth`
- `tree_index_avg_path_depth`

本轮结构指标已说明 treeIndex 规模是线性、可预期的：entry p95 10463、map entry p95 73241、path ref p95 65198。heap p95 升到 1241.03MB 时，treeIndex 结构计数没有出现超线性增长。下一步应查 raw response、normalized rows、treeData、display_config、viewer index、manual perf 日志和 GC 后 heap 的常驻关系。

## 待补回归清单

- 快速切项目 5 次：确认无旧响应污染、stale/abort 计数合理。
- Update_Attachments：确认可重新 hydrate，treeIndex/visibleRows 正确重建。
- WS file_change：覆盖 add/update/delete/move/rename，关注 `store_apply_file_changes_ms` 与 `CustomTree_render_ms max`。
- 分享/只读下载：确认 checkbox、selectedCount、批量下载不退化。
- 搜索：高命中、低命中、清空搜索、中文输入法 composition。
- 移动端：Mobile TopicPage 与 HierarchicalWorkspacePopup 的 stale/loader 指标。
- 灰度/fallback：目前尚未实现完整开关与 fallback，需要单独补 PR 或明确不走灰度。
