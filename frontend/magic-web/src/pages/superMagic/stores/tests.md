下面可作为 `SuperMagicStore` 的异常场景测试矩阵。无法穷尽所有任意输入，但已经覆盖当前流程中的传输、归并、终态、工具、队列、恢复、UI 和持久化边界。

## Chunk 传输与顺序

- 同一个 `i` 的 chunk 完全重复到达。
- 同一个 `i` 重复到达，但 payload 内容不同。
- chunk 整体乱序到达，例如 `0 → 2 → 1 → 3`。
- chunk 大跨度提前到达，例如 `i=56` 先于 `i=18`。
- 连续丢失单个 chunk。
- 连续丢失多个 chunk。
- 首个 chunk 丢失。
- 工具头 chunk 丢失，但 arguments chunk 正常到达。
- 最后一个 arguments chunk 丢失。
- `finish_reason` chunk 丢失。
- `finish_reason` chunk 先于前序 chunk 到达。
- `finish_reason` chunk 重复到达。
- `usage` chunk 先于正文结束到达。
- 只有 `usage`，没有 `finish_reason`。
- 只有 `finish_reason`，没有任何前置 StreamState。
- 空 heartbeat chunk 到达。
- heartbeat chunk 重复到达。
- final 后仍有普通 chunk 到达。
- final 后仍有工具 arguments chunk 到达。
- WebSocket 重连后从某个旧 `i` 开始重放。
- WebSocket 重连后从 `i=0` 完整重放。
- 本地持久化回放与实时 WebSocket 同时投递同一批 chunk。
- HTTP 快照同步期间仍收到旧 WebSocket chunk。
- HTTP 快照完成后收到同步前积压的 chunk。
- 同一个 correlation 下 chunk 的 completion `id` 中途发生变化。
- 模型重试后复用 correlationId，但 `i` 从零重新开始。
- 只有 completion `id` 变化且旧流尚未出现 `i>0` 时，重复 `i=0` 仍 first-write-wins。
- `i` 为负数。
- `i` 为小数。
- `i` 为字符串而不是数字。
- `i` 缺失。
- `i` 极大，导致顺序缓冲长期等待大量缺口。
- chunk 的 `send_time` 顺序和 `i` 顺序相反。
- chunk 到达速度远快于渲染速度。
- chunk 到达速度远慢于恢复 watchdog。
- 浏览器后台节流导致多个 chunk 被集中批量处理。
- 同一 chunk 内同时包含 reasoning、content 和 tool call。
- `choices` 为空数组。
- `choices` 包含多个 choice，但 store 只消费第一个。
- `choices[0].delta` 缺失。
- `finish_reason` 与非空 delta 同时存在。
- `finish_reason="length"`，但最终 message 内容完整。
- `finish_reason="tool_calls"`，但没有 tool call。

维护约定：

- 本节的 43 条场景清单是 `chunk-transport-ordering.test.ts` 的记录基线；新增、删除或重命名测试时必须同步更新清单。
- 每次运行该测试后，更新上面的验证日期、通过/失败数量及失败归因；已经修复的条目保留历史结论并标注新的状态。
- 失败归因只记录可从公开 API 观察到的事实，不把未经验证的内部实现细节写成结论。
- `stores/index.ts` 继续作为黑盒；测试应优先断言 `getMessageNode`、`getStreamState`、`isTopicStreaming`、恢复回调和同步 API 等公开行为。

## Topic、Correlation 和消息身份

- chunk 缺少 `topic_id`。
- chunk 缺少 `correlation_id`。
- chunk 的 `topic_id` 与当前激活话题不一致。
- `topic_id`、`chat_topic_id` 和 Super Magic 内部 topicId 不一致。
- 同一个 correlationId 被不同 topic 使用。
- HTTP Final 或 IM Final 与另一 topic 的 Assistant 复用 correlationId 时，不得继承其 content/tool arguments，也不得覆盖其 correlation alias。
- 两个 topic 都存在同 correlation StreamState 时，HTTP/IM Final 只能继承目标 topic 的流式值。
- correlation key 已被 Tool/User 占用时，HTTP/IM Final 必须保留原 role canonical，并仅按真实 appMessageId 保存 Assistant。
- 同 correlation 的流从 `i=0` 重启时，不得清空已占用 key 的 Tool/User canonical。
- task suspended、其他终态快照及不可见话题完成流结算时，不得把 Assistant 流式字段写入已占用 key 的 Tool/User canonical。
- 同一个 topic 中 correlationId 被不同 assistant 消息复用。
- correlationId 与某个真实 `app_message_id` 相同。
- correlationId 与其他话题的 `app_message_id` 冲突。
- chunk 使用 correlationId，最终 message 使用另一个 correlationId。
- tool response 的 correlationId 与所属 assistant 不一致。
- 最终 message 缺少 correlationId。
- 最终 message 的 appMessageId 在列表中已经存在。
- 同一最终 message 使用不同 seqId 重复到达。
- 同一 seqId 对应两个不同 appMessageId。
- `messageMap` 的全局 key 在不同 topic 之间发生冲突。
- `topicMap` 尚未建立时 chunk 已经到达。
- topic 映射更新后，旧 topicId 的 chunk 继续到达。
- 服务端返回的 topicId 与测试或回放时重写的 topicId 不一致。

## Reasoning 和正文内容

- reasoning chunk 重复到达。
- reasoning chunk 乱序到达。
- reasoning 中间片段丢失。
- content chunk 重复到达。
- content chunk 乱序到达。
- content 中间片段丢失。
- content 先到，reasoning 后到。
- reasoning 已结束后又收到 reasoning chunk。
- 已进入 tool 阶段后又收到 content chunk。
- final content 比流式 content 更短。
- final content 与流式 content 长度相同但内容不同。
- final content 不是流式 content 的前缀扩展。
- final content 为 `null`，流式 content 非空。
- final content 为空字符串，流式 content 非空。
- final message 缺少 reasoning，但流式 reasoning 已存在。
- final reasoning 与流式 reasoning 不一致。
- chunk 内容包含半个 Unicode surrogate pair。
- chunk 在组合字符、ZWJ emoji 或变体选择符中间截断。
- Markdown fence 在流式阶段未闭合。
- citation、HTML 标签或自定义标记在流式阶段未闭合。
- 超大正文导致打字机长期无法追平。
- 正文已经追平，但 final 长时间不到达。

## Tool call 创建与参数拼接

- arguments 片段先于工具头到达。
- 工具头到达，但缺少 tool call id。
- 工具头到达，但缺少 `function.name`。
- 工具头只有 id，没有 function。
- arguments chunk 缺少 id 和 name，仅有 index。
- arguments chunk 缺少 index。
- arguments 不是字符串。
- arguments 为 `null`。
- arguments 为空字符串。
- arguments 片段丢包。
- arguments 片段重复。
- arguments 片段乱序。
- arguments 重复拼接后仍然是合法 JSON，但业务值错误。
- arguments 重复拼接后变成非法 JSON。
- arguments 最终只有半个 JSON。
- final arguments 比流式 arguments 更短。
- final arguments 与流式 arguments 长度相同但内容不同。
- 当前 messageMap arguments 比 canonical final 更长。
- 当前 arguments 不是 final arguments 的前缀。
- final arguments 是空对象，但流式 arguments 非空。
- final assistant 缺少 arguments。
- Final 提供真实 tool id 但缺少 arguments，且只有匿名 index 槽位可匹配时，不得继承匿名参数。
- 一个 chunk 内包含多个 tool call。
- 多个 tool call 的 arguments 在不同 chunk 中交错到达。
- tool index 出现空洞，例如直接收到 index 2。
- index 0 的工具头丢失，只收到 index 1。
- 同一个 index 后续被另一个 tool id 复用。
- 同一个 tool id 在后续 chunk 中改变 index。
- 同一个 tool id 在后续 chunk 中改变 name。
- 同一个 tool id 在不同 correlation 中复用。
- 工具头重复到达。
- 重复工具头内容完全相同。
- 重复工具头使用相同 id 但不同 name。
- 匿名 index 槽位没有在工具头到达后升级。
- 匿名槽位与最终合法工具同时保留。
- `compactToolCalls()` 清除了数组空洞，但保留了缺少 id 的对象。
- UI 动画为匿名工具生成了 `"0"` 之类的临时 id。
- 临时 id 后续没有被真实 tool id 替换。
- final tool call 顺序与流式首现顺序不同。
- final tool call 数量比流式阶段多。
- final tool call 数量比流式阶段少。
- final message 完全没有 tool_calls，但流式阶段存在工具。
- final message 新增了流式阶段从未出现的工具。
- final message 删除了流式阶段出现的工具。
- final message 包含重复 tool id。
- 同一工具的 `type` 在流式和 final 中不同。
- `function` 意外为数组而不是对象。
- 工具参数巨大，例如包含完整 HTML 页面。
- 多个超大工具参数同时流式，导致内存和渲染压力。

### 历史：决策前黑盒判定基线与验证（2026-07-23）

本节保留 `tool-call-argument-assembly.test.ts` 在协议决策前的 48 用例审计快照。它只记录当时从公开 API 得到的行为证据；当前有效结果与新增契约见本节末尾“决策实施后的当前结果”，不得再把以下历史数量当成现状。

#### 范围与验证上下文

- 目标文件：`src/pages/superMagic/stores/__tests__/tool-call-argument-assembly.test.ts`，48 个 `it`，与本节上方 48 条场景清单一一对应。
- 命令：

    ```bash
    npx vitest run \
      --config ./vitest.config.ts \
      src/pages/superMagic/stores/**tests**/tool-call-argument-assembly.test.ts
    ```

- 环境：HEAD `456e6fbdfb`，Node `v22.22.2`，Vitest `3.2.6`。
- 连续运行两次结果一致：`48 tests / 39 passed / 9 failed`，退出码 `1`。
- 9 项全部是 `AssertionError`；没有导入、配置、运行时异常、skip 或 pending。失败不是测试文件没有被收集，也不是 `receiveChunk()`/`enqueueMessage()` 抛错。
- 目标测试没有使用 `__tests__/support`、`mock_v1.json` 或 `mock_v2.json`；所有 helper 和异常 fixture 都内联在测试文件中。
- `enterprise/src/pages/superMagic/stores/` 不存在，没有需要同步的 enterprise overlay 测试或类型文件；`enterprise/src/main.tsx` 的 baseline 回放导入不是本测试的支持层。

#### 黑盒评判标准

“测试用例问题”不能只凭“UI 看起来正常”判定。UI 可能通过过滤、去重或 fallback 掩盖 Store 中的脏数据；反过来，assistant 内嵌快照没有回写，也不一定表示 UI effective state 错误。每个用例按其声称的行为选择相关观察层：

| 观察层          | 黑盒观察点                                                                         | 应验证的契约                                                                 | 不能单独推出的结论                                            |
| --------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 协议 / fixture  | `topic_id`、`correlation_id`、tool id、`index`、字段 absent / `null` / `""` / `[]` | 输入是否属于已确认的线上形态；冲突字段谁权威                                 | 人工构造的畸形输入不能直接定性为 Store 缺陷                   |
| 流式 canonical  | `getStreamState(topicId, correlationId)`                                           | 参数片段是否按 index/identity 保留、乱序/重复是否可观察地收敛                | raw 稀疏槽位的长度不能直接代表 UI 工具数量                    |
| Final canonical | `getMessageNode(correlationId).tool_calls`                                         | Final 的 id、name、arguments、type、顺序和删除语义                           | 不能把 transport index 当成 Final 的持久业务字段              |
| 消息列表        | `store.messages.get(topicId)`                                                      | Final/重复/身份场景下的逻辑消息数量、顺序、role、topic、app/correlation、seq | UI 最后只显示一张卡，不代表列表没有重复 revision 或错误 alias |
| UI projection   | `messagesConverter()`、MessageNode 的可渲染过滤、真实组件                          | 声称“UI、幽灵工具、临时 id”时，卡片数量、稳定 key、loading 和可见工具        | Store 数组断言不能证明 React 动画或渲染行为                   |
| 生命周期 / 性能 | `isTopicStreaming()`、公开 stream state、恢复回调、可测耗时/内存                   | Final、`finish_reason`、任务状态和文本流分别收敛；性能用例必须有预算         | 参数内容完整不等于“渲染压力已验证”                            |

当前可直接沿用的项目契约如下：

1. continuation arguments chunk 缺少 id/name 是线上可见形态；在本地 mock 中，stream delta 的 `index` 始终存在，arguments（若存在）始终为字符串。
2. `finish_reason` 只结束当前文本/推理流；`isTopicStreaming()` 不等于整个任务生命周期，也不应由 JSON 是否完整单独推导。
3. Final 中 `tool_calls` 字段存在时按完整权威数组处理；不追加、不按长度或前缀猜测。字段 absent、显式 `null`、显式 `[]` 必须分开。
4. Final 缺少 `tool_calls` 时沿用 absent 语义，不应被测试默认为显式空数组。`TC-03` 已确认：Final tool 的 `function.arguments` absent/`undefined` 时，仅继承同 topic、同 correlation、同 tool id 已存在的 streamed 值；纯刷新没有继承源时不得从其他 revision/correlation 猜测或合成非空值，显式 `""`/`null` 仍由 Final 覆盖。
5. UI 的可渲染工具至少需要稳定 id 和 `function.name`；Store 中保留匿名流式槽位不等于 UI 必须展示匿名工具。

本地 `mock_v1.json` 与 `mock_v2.json` 的形态统计可作为 fixture 证据而非后端规范：合计 34,792 个 stream tool delta 均有 `index`，含 arguments 的项均为字符串；合计 44 个 Final tool call 均没有 `index`、均有 arguments、type 均为 `function`，且没有观察到单个 Final 数组内的重复 id。因此“缺 index、非字符串、Final index 持久化、type=mcp、Final 重复 id”都不能在没有额外协议决定时直接写死为业务预期。

#### 决策前 9 个失败用例的黑盒归因

|   # | 测试行 / 用例                         | 实际观察 → 期望                                                  | 当前主归因                           | 置信度 | 黑盒依据与后续动作                                                                                                                                                                  |
| --: | ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | L330 `arguments chunk 缺少 index`     | `should-not-bind` 被绑定 → 期望不绑定                            | 协议 / 标准化待决，不直接归 Store    | 高     | 输入通过类型强转制造；线上 fixture 没有缺 index。先决定缺 index 是丢弃、挂起等待、按当前槽位回退还是按 id 关联（`TC-01`）。                                                         |
|   2 | L345 `arguments 不是字符串`           | `"[object Object]"` → 期望 `""`                                  | 协议 / 标准化待决                    | 高     | 公开结果证明 Store 接受了对象并产生字符串，但不能证明空串是唯一正确规范化。决定拒绝、忽略、保留原值或显式字符串化（`TC-02`）。                                                      |
|   3 | L457 `arguments 最终只有半个 JSON`    | 半 JSON 断言通过；`isTopicStreaming()` 为 `false` → 期望 `true`  | 测试观察层问题                       | 高     | 失败只发生在生命周期断言；`finish_reason="tool_calls"` 已结束文本/推理流。参数完整性与 stream 生命周期应拆开，沿用现有 D1/D4。                                                      |
|   4 | L532 `final assistant 缺少 arguments` | Final projection 的 arguments 为 `""` → 期望保留流式值           | Store 黑盒 RED（TC-03 已确认并修复） | 高     | 断言读取公开 Final projection。当前规则为：同 identity 有 streamed 值则继承；late Final 与 HTTP Final 同样适用；纯刷新无来源时不合成非空值。                                        |
|   5 | L591 `tool index 出现空洞`            | raw slots 为 `[undefined, undefined, tool]`，长度 3 → 期望长度 1 | 测试观察层问题为主                   | 高     | 失败发生在 `getStreamState().tool_calls` 原始槽位，过滤后的工具数量断言尚未执行。应明确 raw slot 保留 transport index，另以 compact/renderable projection 验证 UI（`TC-04`）。      |
|   6 | L633 `同一个 tool id 后续改变 index`  | 同 id 对象保留 2 个 → 期望 1 个                                  | 协议待决，若 id 权威则偏 Store       | 中     | 这是假设“id 是稳定身份、index 只是 continuation slot”的冲突输入；需决定 id 优先迁移、index 优先分裂，或直接拒绝（`TC-05`）。                                                        |
|   7 | L748 `compactToolCalls()` 清除空洞    | Final 唯一工具 index 为 0 → 期望 index 2                         | 测试期望 / 命名问题                  | 高     | 真实 Final 没有 transport index；canonical 数组位置被标准化为 0 是可接受的语义投影。该用例没有直接调用所谓内部函数，也没有真正断言“缺 id 对象保留”，应改为公开行为描述（`TC-06`）。 |
|   8 | L868 `final message 包含重复 tool id` | 重复 id 保留 2 个 → 期望 1 个                                    | Store 黑盒 RED（TC-07 已确认并修复） | 高     | 单个 Final 数组按 tool id 规范化：末项胜出，canonical/UI 只投影一个工具，并记录包含 id、前后 index 与 resolution 的结构化 warning。                                                 |
|   9 | L879 `流式和 final 的 type 不同`      | Final projection 为 `function` → 期望 `mcp`                      | 测试 fixture / 协议问题              | 高     | 当前线上样本 type 只有 `function`；MCP 由工具名称/响应语义区分，不是 `type="mcp"` 的已确认形态。应改用真实 MCP fixture 或把该场景移到明确的类型归一化决策（`TC-08`）。              |

结论：9 个失败中，4 个是测试观察或期望问题（3、5、7、9），1 个在既有 absent 规则下是 Store 黑盒 RED（4），4 个必须先确认协议/标准化（1、2、6、8）。这里的“Store RED”只表示公开行为与已确认契约不一致，不涉及读取或推断 `stores/index.ts` 的实现路径。

#### 48 个用例逐条准确性审计

状态说明：`A` = 核心契约合格；`B` = 当前断言可用但覆盖不足或命名越过观察层；`C` = 测试观察层/期望错误；`D` = 协议或产品规则未定；`E` = 当前绿色可能掩盖 Store RED；`F` = 本次失败，详见上表。

|   # | 起始行 | 用例简写                       | 当前结果 | 结论 | 后续动作                                                                     |
| --: | -----: | ------------------------------ | -------- | ---- | ---------------------------------------------------------------------------- |
|   1 |    239 | arguments 先于工具头           | 通过     | A    | 保留；补 Final 后 `store.messages`/单卡断言。                                |
|   2 |    256 | 工具头缺 id                    | 通过     | D/B  | 保留为防御测试，但先定义匿名 header 是否允许进入流状态。                     |
|   3 |    271 | 工具头缺 name                  | 通过     | B    | Final 修复断言合理；补 invalid UI 不渲染。                                   |
|   4 |    291 | 工具头缺 function              | 通过     | B    | 只证明不抛异常；补脏数据不污染 canonical/listener。                          |
|   5 |    306 | arguments 仅有 index           | 通过     | A    | 这是线上可见 continuation 形态；保留。                                       |
|   6 |    318 | arguments 缺 index             | 失败     | F/D  | 等 `TC-01` 后决定预期。                                                      |
|   7 |    333 | arguments 非字符串             | 失败     | F/D  | 等 `TC-02` 后决定规范化。                                                    |
|   8 |    348 | arguments 为 null              | 通过     | D    | 绿色不代表规则正确；与非字符串统一定义 null 语义。                           |
|   9 |    363 | arguments 空字符串             | 通过     | A    | 明确为空片段 no-op 还是显式清空，补跨 chunk 断言。                           |
|  10 |    373 | arguments 丢包后 Final         | 通过     | A    | 保留；补消息列表和恢复副作用。                                               |
|  11 |    387 | arguments 重复                 | 通过     | A    | 保留；补不同 app/seq 的精确重复与冲突重复。                                  |
|  12 |    400 | arguments 乱序                 | 通过     | A    | 保留；补缺口未补齐前的可观察 raw slot。                                      |
|  13 |    412 | 重复后仍合法 JSON              | 通过     | A    | Final replacement 断言合理；不要把 JSON parse 当 Store 身份依据。            |
|  14 |    427 | 重复后非法 JSON                | 通过     | A    | 保留；补参数是否作为 opaque string 传递。                                    |
|  15 |    442 | Final 只有半 JSON              | 失败     | F/C  | 只保留参数断言；生命周期断言按 D1/D4 拆出。                                  |
|  16 |    460 | Final 比流式短                 | 通过     | A    | Final 完整替换；补 canonical node 与 messages。                              |
|  17 |    473 | Final 等长但内容不同           | 通过     | A    | 保留；这是反长度启发式的有效回归。                                           |
|  18 |    484 | messageMap 比 Final 长         | 通过     | B    | 改为“当前 projection 比 Final 长”，避免内部命名；补 messages。               |
|  19 |    496 | 当前值不是 Final 前缀          | 通过     | A    | 保留；Final 不依赖前缀关系。                                                 |
|  20 |    507 | Final 空对象覆盖流式值         | 通过     | A    | 显式空值语义合理；补 absent/null/[] 对照。                                   |
|  21 |    518 | Final 缺 arguments             | 通过     | A    | TC-03 已确认：同 identity 存在 streamed 值时继承；无来源时不合成非空值。     |
|  22 |    535 | 单 chunk 多工具                | 通过     | A    | 保留；补工具顺序与消息卡数量。                                               |
|  23 |    550 | 多工具参数交错                 | 通过     | A    | 保留；补不同 correlation 隔离。                                              |
|  24 |    582 | index 直接为 2                 | 失败     | F/C  | raw sparse slot 与 compact projection 分层（`TC-04`）。                      |
|  25 |    596 | index 0 头丢失、只收到 index 1 | 通过     | B    | 只验证不造 `"0"`；补 raw slot 与 UI 过滤。                                   |
|  26 |    609 | 同 index 复用另一个 id         | 通过     | B/D  | Final 结果可用，但需要明确 index 冲突是替换、分裂还是拒绝。                  |
|  27 |    623 | 同 id 改 index                 | 失败     | F/D  | 等 `TC-05`；不能仅凭当前失败决定实现方向。                                   |
|  28 |    636 | 同 id 改 name                  | 通过     | A    | Final authoritative name 合理；补冲突 warning/seq 规则。                     |
|  29 |    653 | 同 id 跨 correlation           | 通过     | A    | 保留；补 `store.messages` 不跨 topic/correlation 污染。                      |
|  30 |    675 | 工具头重复                     | 通过     | A    | 保留；补 listener/副作用 exactly-once。                                      |
|  31 |    685 | 重复头完全相同                 | 通过     | A    | 保留；与不同 app/seq 重放分开。                                              |
|  32 |    696 | 重复头同 id 不同 name          | 通过     | B    | Final 结果合理；协议是否允许头字段变更需记录。                               |
|  33 |    711 | 匿名槽位升级真实头             | 通过     | A    | 这是线上 continuation 形态，保留。                                           |
|  34 |    728 | 匿名槽位与 Final 合并          | 通过     | B    | 补 absent/null/[]、messages 和 UI 无幽灵工具。                               |
|  35 |    742 | `compactToolCalls()`           | 失败     | F/C  | 改成公开的“Final 后无匿名/空洞工具且 index 语义稳定”（`TC-06`）。            |
|  36 |    753 | UI 动画不生成临时 id           | 通过     | B/C  | 当前只查 Store，不能证明 UI 动画；改名或迁移真实 UI projection 测试。        |
|  37 |    763 | 临时 id 被真实 id 替换         | 通过     | B    | 当前证明 Store projection；补 React key/组件复用测试。                       |
|  38 |    775 | Final 顺序不同                 | 通过     | D    | 需决定 Final 顺序权威还是首现顺序稳定（`TC-06`）；当前绿测不能视为结论。     |
|  39 |    793 | Final 工具更多                 | 通过     | A    | Final replacement 合理；补 messages/UI 数量。                                |
|  40 |    805 | Final 工具更少                 | 通过     | A    | 删除 streamed tool 合理；补 response 审计与 UI 无幽灵项。                    |
|  41 |    821 | Final absent tool_calls        | 通过     | E    | 现有 D10 规定 absent 不清空；该绿测可能掩盖 Store RED，应与 Final 套件统一。 |
|  42 |    832 | Final 新增工具                 | 通过     | A    | 保留；补 id 唯一性和顺序。                                                   |
|  43 |    844 | Final 删除工具                 | 通过     | A    | 保留；补 `store.messages` 是否保留审计 response。                            |
|  44 |    860 | Final 重复 id                  | 通过     | A    | TC-07 已确认：末项胜出、单工具投影、结构化 warning。                         |
|  45 |    871 | type=function 与 mcp           | 失败     | F/C  | 使用真实 MCP sentinel/response shape，不能凭空使用 `type="mcp"`（`TC-08`）。 |
|  46 |    882 | function 为数组                | 通过     | B/D  | 只证明不抛异常；先决定非法 shape 的拒绝、忽略和污染边界。                    |
|  47 |    899 | 单个超大参数                   | 通过     | B    | 只有内容完整性证据；性能预算应移到资源性能测试。                             |
|  48 |    909 | 多个超大参数                   | 通过     | B    | 只有多工具内容完整性证据；补耗时、内存或渲染预算后才能声称“压力”覆盖。       |

#### 当前明确的覆盖不足与观察层问题

- 目标文件没有 `store.messages`、`messagesConverter()` 或 React 渲染断言。因此涉及 Final 身份、重复版本、卡片数量、UI 临时 id、幽灵工具的用例不能仅凭当前结果下 UI 结论。
- `getStreamTools()` 会过滤 raw sparse slots；`getStreamToolSlots()` 才观察原始数组。二者不能用同一长度预期。
- `messageMap`、`compactToolCalls()` 等标题暴露实现名；黑盒维护记录应改为公开行为名称，不应要求测试调用或证明内部函数存在。
- `cloneFixture()` 使用 JSON round-trip，会丢失 `undefined`；不能用它区别 absent、显式 `undefined`、`null`。
- “超大参数导致内存和渲染压力”目前只有字符串保真断言，没有时间、内存、渲染次数或 UI 长任务预算。
- 当前没有自动脚本校验本文 48 条清单与测试文件 48 个 `it` 的同步；这是人工维护契约。

#### 待决策与已确认清单

| 决策  | 影响用例          | 需要确认的问题                                                      | 可选规则（推荐项已标注）                                                                                       |
| ----- | ----------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| TC-01 | 6                 | arguments chunk 缺少 `index` 时如何处理？                           | 丢弃并记录；挂起等待可定位槽位；按当前 active index 回退；按 id 关联（推荐仅在 id 存在时允许）。               |
| TC-02 | 7、8              | `arguments` 为对象或 `null` 时的标准化是什么？                      | 拒绝/忽略并保持旧值（推荐）；规范化为空串；`String()`/JSON 序列化；进入错误态。                                |
| TC-03 | 21                | Final tool 的 `function.arguments` absent 是否沿用“absent 不清空”？ | **已确认**：继承同 identity 已收到的 streamed 值；无继承源则保持无非空值；显式值仍以 Final 为准。              |
| TC-04 | 24、25、33、35    | raw `StreamState.tool_calls` 是否允许 sparse index 槽位？           | 允许 raw sparse、另做 compact/renderable projection（推荐）；Store 始终压缩为连续数组。                        |
| TC-05 | 27、28            | 同一 tool id 后续改变 index 时，id 与 index 谁是权威？              | id 稳定、迁移槽位（推荐）；index 优先形成新工具；冲突直接丢弃后续 chunk。                                      |
| TC-06 | 35、38            | Final 的 index/order 是否覆盖 streaming 的 transport index/order？  | Final 数组整体权威，canonical index 按数组位置重建、顺序按 Final（推荐）；保留首现顺序；保留 transport index。 |
| TC-07 | 44                | Final 数组出现重复 tool id 如何规范化？                             | **已确认**：末项胜出；只投影一个 canonical 工具并记录结构化 warning。重复 id 的跨项顺序未被本决策定义。        |
| TC-08 | 45                | MCP 的协议表示是什么？                                              | `type` 仍为 `function`、由 tool/name sentinel 表示（推荐）；允许 `type="mcp"`；另建 MCP 专用 union。           |
| TC-09 | 36、47、48        | “UI 动画”和“性能压力”是否继续放在本文件？                           | 本文件只测 Store/canonical，UI 与性能拆到对应套件（推荐）；保留但补真实渲染/性能预算。                         |
| TC-10 | 18、21、34、39–44 | Final/消息身份场景是否必须同时断言 `store.messages` 与 UI 单卡？    | Final 场景强制补 `store.messages` + canonical + UI（推荐）；只保留 node 断言。                                 |
| TC-11 | 13–20             | Store 是否把 arguments 当 opaque string，还是负责 JSON 合法性校验？ | Store 只保留/拼接字符串，执行层校验 JSON（推荐）；Final 前拒绝半 JSON；自动 parse/repair。                     |

#### 后续维护门禁

- 仅对尚未确认的 TC 项保持“先决策、后修改测试”；TC-03、TC-07 已按上表契约实施并进入回归门禁。
- 后续判断“测试用例问题”时，除 UI 外必须检查与场景相关的 Store 标准化：`store.messages`、canonical node、raw/effective tool state、消息 identity/seq、生命周期；不能用 UI 通过替代这些检查。
- 本历史表固定保留决策前 48 项审计，不再随当前测试行号机械改写；当前新增、删除、重命名或修改必须同步更新后面的当前结果、上方场景清单和决策状态。
- 决策后修改测试，至少连续运行目标文件两次，并补跑 `final-assistant-message.test.ts`、`chunk-transport-ordering.test.ts`、`message-list-ui-projection.test.ts` 和 `resource-performance.test.ts` 中相关用例；不要以“全绿”作为唯一目标。
- `stores/index.ts` 继续保持黑盒；不得通过阅读实现反推测试预期。enterprise overlay 仍需在修改前做一次路径存在性检查。

#### 决策实施后的当前结果（2026-07-23）

- `tool-call-argument-assembly.test.ts` 当前为 `50 tests / 44 passed / 6 failed`。
- 新增回归“Final 真实 tool id 缺少 arguments 时不继承匿名 index 槽位”已通过；TC-03 的继承源现在严格要求同 topic、同 correlation、同 tool id。
- 重复 Final tool id 的两个入口均继续验证末项胜出、单工具投影、结构化 warning 且 warning exactly-once；未把“首次出现顺序”写成 TC-07 契约。
- 仍失败的 6 项是既有 TDD RED：缺 index 按 id 绑定、缺 index/id 丢弃、非字符串 arguments、`null` arguments、同 id 改 index、Final 顺序权威。它们不属于本轮四项决策的回归。
- 当前维护数量以 50 为准；上面的 48 行表只作为决策前历史证据。

## Tool response 与执行状态

- tool response 先于所属 assistant final 到达。
- tool response 先于工具头到达。
- tool response 先于任何 chunk 到达。
- tool response 正常到达，但所属 tool call 从未出现。
- 任务仍在运行且没有完成屏障时，缺失的 tool response 保持等待态。
- 同一个 tool response 重复到达。
- 同一个 tool id 的低 seq response 不覆盖已到达的高 seq response。
- 同一个 tool id 的高 seq response 覆盖先到达的低 seq response。
- 同 seq 且内容等价的重复 response 不覆盖 canonical 状态。
- 同 seq 但内容冲突的 response 保留首次结果并记录冲突。
- 同 seq 的 response 允许只补齐此前缺失的字段。
- `initializeMessages()` 的低 seq tool response 不覆盖已有 canonical 状态。
- tool response 先是 `finished`，后又收到 `running`。
- tool response 已是 `running`，后到的 `waiting` 只补载荷、不回滚状态。
- tool response 先是 `error`，后又收到 `finished`。
- tool response 先是占位 `response_missing`，后收到真实结果。
- 真实结果先到，后又被弱终态占位覆盖。
- `tool_call_id` 与 `tool.id` 冲突时，以 `tool.id` 作为关联主键并记录结构化 warning。
- `tool.id` 与 assistant tool call id 不一致时，不使用 `tool_call_id` 兜底关联。
- tool response 只有 `tool_call_id`，`tool.id` 缺失。
- tool response 只有 `tool.id`，`tool_call_id` 缺失。
- `initializeMessages()` 中 ID 冲突时仍以 `tool.id` 建立 canonical 关联。
- `loadSharedMessages()` 中 ID 冲突时仍以 `tool.id` 建立 canonical 关联。
- tool response 的 tool 字段为数组时，不污染 canonical 状态。
- tool response 的 tool 字段为 `null` 时，不污染 canonical 状态。
- 未知 tool status 保留 detail/attachments，没有合法 canonical 状态时回退为 `running`。
- 未知 tool status 补齐载荷时，不回滚已有 `finished` 状态。
- assistant 内嵌 tool 状态为 `running`，toolResponseMap 已是 `finished`。
- tool response 有 finished 状态，但 detail 缺失。
- tool response 有 detail，但 status 缺失。
- tool response 的 attachments 延迟到达。
- tool response 的 attachments 与 assistant 内嵌 tool 不一致。
- 工具执行完成，但 buffer 被前一个 assistant 动画阻塞。
- 任务结束时仍有未结算工具。
- task-level `agent_suspended` 事件将普通未完成工具结算为 `suspended`。
- 权威 topic 状态为 `suspended` 时，将普通未完成工具结算为 `suspended`。
- 单个 tool message 的 `suspended` 状态不得中断同 topic 的其他工具。
- 迟到的真实 `finished` / `error` response 可以覆盖合成的 `suspended`（参数化为 2 个测试）。
- ask_user 没有普通 tool response 时保持等待态，不伪造普通工具终态。
- ask_user 响应晚于新一轮 assistant。
- MCP 工具真实名称位于 `tool.name`，但 function.name 是方法名。
- `show_in_ui=false` 不影响未结算工具的 canonical 结算。
- 多工具 response 按 `tool.id` 绑定，不受数组 index 和 `tool_call_id` 干扰。
- buffer 中错误的 `tool_call_id` 不得掩盖按 `tool.id` 判断的缺失响应。
- 页面刷新初始化完成且任务已结束时，缺少 role=tool 的工具调用进入 `response_missing`。
- 页面常驻增量轮询没有新消息但任务已结束时，缺少 role=tool 的工具调用进入 `response_missing`。
- 下一轮 running assistant 到达后，上一轮缺少 role=tool 的工具调用退出 loading。
- 任务仍在运行且没有后续消息时，不提前把缺少 role=tool 的工具标记为 `response_missing`。
- `response_missing` 弱终态生成后，迟到的真实 tool message 可以覆盖。
- 多个工具调用中只有缺失响应的工具进入 `response_missing`。
- finished 多工具轮次已有部分 response 时，仍逐 `tool.id` 结算剩余缺失项。

### 测试调整前验证与失败归因（2026-07-23）

本节保留 `tool-response-execution-state.test.ts` 在测试调整前的历史基线。修正后的当前结果见本章节末尾“测试用例修正后验证”。

验证上下文：

- 当前 HEAD：`456e6fbdfb`。
- Vitest：`3.2.6`。
- 当时工作区并非干净提交基线：目标测试为 `AM`，`stores/index.ts` 为 `MM`；因此下列结果只代表 2026-07-23 的测试调整前快照。
- 该轮只做分析和文档记录，没有修改 `stores/index.ts` 或测试代码。

验证命令：

```bash
npx vitest run \
  --config ./vitest.config.ts \
  src/pages/superMagic/stores/**tests**/tool-response-execution-state.test.ts
```

调整前结果：`35 tests / 10 passed / 25 failed`，重复运行结果一致。

#### 归因口径

这组测试必须先区分四个不同的观察层，否则会把“assistant 内嵌快照没有回写”误判成“用户仍看到 loading”。

| 观察层                        | 当前数据来源                                                                          | 适合验证的契约                                      | 不应推导的结论                                       |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Assistant embedded projection | `getMessageNode(correlationId).tool_calls[n].tool`；测试中的 `getResolvedToolState()` | final assistant 自带的工具快照是否正确合并          | 不能单独代表 UI 当前执行状态                         |
| Canonical tool response       | `toolResponseMap.get(topicId)?.get(toolCallId)`                                       | role=`tool` 响应的最新权威状态、详情和附件          | 不能证明 raw tool 消息已经穿过 buffer 并进入消息列表 |
| UI effective state            | `toolResponseMap` 优先，assistant embedded 兜底；测试中的 `getEffectiveToolState()`   | 用户实际看到的 status/detail/attachments 和 loading | 不等于消息 listener 的到达顺序                       |
| Message/listener arrival      | `messageMap`、`messages`、topic listener                                              | buffer 消费、列表插入和领域事件顺序                 | 不能用来否定 canonical response 已经立即入账         |

生产 UI 在 `MessageNode/ToolCall.tsx` 中使用 `toolResponseMap.get(toolCall.id) || toolCall.tool`；Store 的 `recordToolResponse()` 也明确在消息入队时先写 `toolResponseMap`。因此，除非用例名称明确测试 assistant projection，否则工具执行状态断言应优先读取 UI effective state。

#### 归因汇总

| 主归因                     | 数量 | 结论                                                                                |
| -------------------------- | ---: | ----------------------------------------------------------------------------------- |
| 测试用例问题               |   16 | 多数断言只读 embedded projection；另有 buffer、`ask_user`、MCP 展示名等跨层契约混用 |
| `stores/index.ts` 业务问题 |    8 | 终态可回退、弱终态可覆盖真实结果，以及缺少 `response_missing` 结算屏障              |
| 协议待确认，当前偏 Store   |    1 | assistant `status=suspended` 是否为必须触发工具结算的真实协议尚需确认               |

说明：8 个 Store 主因中，第 4、7、16、20 条的业务场景确实暴露 Store 缺口，但当前断言仍只读 embedded projection。未来即使把缺口正确修在 `toolResponseMap`，这些测试也必须同步改为断言 effective state，否则仍会假失败。

#### 25 个失败用例明细

|   # | 断言行 / 失败用例                                  | 本轮实际 → 期望                               | 主归因                             | 评估依据与后续记录状态                                                                                                                                                                       |
| --: | -------------------------------------------------- | --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | L343 `tool response 先于所属 assistant final 到达` | embedded `running` → `finished`               | 测试用例问题                       | Map 已是 `finished`，真实 UI 会使用 Map；应改为验证 effective state，或明确把用例改名为 projection 同步测试。                                                                                |
|   2 | L355 `tool response 先于工具头到达`                | embedded `running` → `finished`               | 测试用例问题                       | 工具头创建的是流式 embedded 快照，先到的 response 已在 Map；断言读取了错误状态源。                                                                                                           |
|   3 | L437 `同一个 tool id 收到多个不同 response`        | embedded `detail=undefined` → `latest`        | 测试用例问题                       | `recordToolResponse()` 的 Map 已保存最后一次 response，UI detail 为 `latest`。                                                                                                               |
|   4 | L454 `finished` 后又收到 `running`                 | effective/Map `running` → `finished`          | Store 业务问题（测试断言也需调整） | `recordToolResponse()` 无条件 `Map.set()`，强终态会真实回退为 loading；当前失败信息来自 embedded，修复后应断言 effective state。                                                             |
|   5 | L475 `error` 后又收到 `finished`                   | embedded `running` → `finished`               | 测试用例问题                       | Map 的最后状态已经是 `finished`，UI 可正常恢复；embedded 没有同步不等于业务失败。                                                                                                            |
|   6 | L496 `response_missing` 后收到真实结果             | embedded `running` → `finished`               | 测试用例问题                       | Map 中真实 `finished` 已覆盖弱终态，测试没有读取 canonical/effective 状态。                                                                                                                  |
|   7 | L517 真实结果后被弱终态覆盖                        | effective/Map `response_missing` → `finished` | Store 业务问题（测试断言也需调整） | 当前 last-write-wins 允许弱 `response_missing` 覆盖真实 `finished`；断言却只看到 embedded `running`，没有直接命中真正错误。                                                                  |
|   8 | L546 只有 `tool_call_id`，缺少 `tool.id`           | embedded `running` → `{id, finished}`         | 测试用例问题                       | Map 已按 `tool_call_id` 建键，UI status 正确；若要求 response payload 自身补齐 `id`，应另立 ID 归一化契约。                                                                                  |
|   9 | L556 只有 `tool.id`，缺少 `tool_call_id`           | embedded `running` → `{id, finished}`         | 测试用例问题                       | Map 可按 `tool.id` 命中 UI 的 tool call，失败仅来自 embedded 未回写。                                                                                                                        |
|  10 | L609 embedded 为 `running`、Map 已为 `finished`    | embedded `running` → `finished`               | 测试用例问题                       | 用例标题已经声明 Map 为权威终态，却继续断言 embedded；属于明确的自相矛盾。                                                                                                                   |
|  11 | L620 `finished` 但 detail 缺失                     | embedded `running` → `finished`               | 测试用例问题                       | Map status 已是 `finished`，detail 缺失是独立数据完整性问题，不应让状态断言回到 embedded。                                                                                                   |
|  12 | L636 有 detail、无 status                          | embedded `detail=undefined` → response detail | 测试用例问题                       | detail 已在 Map；该用例应分别验证“payload 可见”和“无 status 时 UI 是否 loading”，不能用 embedded 同时代表两者。                                                                              |
|  13 | L663 attachments 延迟到达                          | embedded `undefined` → 最新附件               | 测试用例问题                       | Map 已保存第二个 response 的附件，UI effective attachments 正确。                                                                                                                            |
|  14 | L691 attachments 与 assistant 内嵌值不一致         | embedded `draft` → `final-file`               | 测试用例问题                       | response Map 才是附件权威来源；embedded 的 draft 不应覆盖 Map。                                                                                                                              |
|  15 | L708 buffer 被前一个 assistant 动画阻塞            | raw tool node `undefined` → `finished`        | 测试用例问题                       | Store 只承诺 canonical Map 立即入账，raw tool node/listener 仍按 buffer 顺序消费；若测试执行状态，应断言 Map/UI，而非 32ms 内的列表节点。                                                    |
|  16 | L723 任务结束时仍有未结算工具                      | effective 仍 `running` → `response_missing`   | Store 业务问题（测试断言也需调整） | Store 没有把终态 assistant 中未结算工具写入 Map；当前 fixture 以 assistant `status=finished` 代表终态，需用 effective state 验证防御性结算。                                                 |
|  17 | L739 任务 suspended 时工具仍 running               | embedded `running` → 非 `running`             | 协议待确认，当前偏 Store           | Store 只在 role=`tool` 且 node `status=suspended` 时调用 `handleTopicSuspended()`；若 assistant `status=suspended` 是真实终态信号，则 Store 缺入口。确认协议后还应改断言为 effective state。 |
|  18 | L756 `ask_user` 没有普通 tool response             | embedded `running` → 非 `running`             | 测试用例问题                       | Store 明确把 `ask_user` 排除在中断/缺失补偿之外；表单需要保持 pending 等待用户输入，不能套普通工具的自动终结规则。                                                                           |
|  19 | L814 MCP 真实名称位于 `tool.name`                  | embedded `call_tool` → `mcp.browser.search`   | 测试用例问题                       | Map 已保存 response name；如需验证 MCP 展示名，应放在组件投影测试，不能要求 Store 回写 assistant 的 `function.name`/embedded tool。                                                          |
|  20 | L831 UI 隐藏工具仍未结算                           | effective 仍 `running` → 非 `running`         | Store 业务问题（测试断言也需调整） | `show_in_ui=false` 不应改变 canonical 生命周期；终态时缺少按 tool id 的统一结算。断言应读取 effective state。                                                                                |
|  21 | L853 response 应按 ID 而非数组 index 绑定          | tool-b embedded `running` → `finished`        | 测试用例问题                       | Map 已按 `tool-b` 正确建键，tool-a 未被错误覆盖；失败只是 assistant 数组快照没有同步。                                                                                                       |
|  22 | L894 HTTP 刷新确认 task finished 后缺少 response   | effective `running` → `response_missing`      | Store 业务问题                     | `initializeMessages()` / `completeTopicSync()` 会结算流式快照，但不会为未匹配的 tool call 生成弱终态。                                                                                       |
|  23 | L952 下一轮 assistant 到达后上一轮仍缺 response    | effective `running` → `response_missing`      | Store 业务问题                     | 缺少“下一轮 assistant 已到达”完成屏障，旧工具会永久 loading。                                                                                                                                |
|  24 | L1024 弱终态后迟到真实 response 可覆盖             | 前置仍 `running` → `response_missing`         | Store 业务问题                     | 失败发生在前置弱终态根本没有生成；已有真实 response 的 Map 覆盖能力不是本次首个失败点。                                                                                                      |
|  25 | L1093 多工具只结算缺失项                           | missing tool `running` → `response_missing`   | Store 业务问题                     | Store 没有按 `tool_call.id` 逐项找出 unresolved tool；已完成工具正确，缺失工具没有进入弱终态。                                                                                               |

#### 通过用例中的假阳性与覆盖缺口

| 当前通过用例                                 | 为什么不能据此判定业务正确                                                                                    | 后续应补的断言                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `tool response 的 id 与 tool call id 不一致` | 当前只检查 assistant embedded 的 `tool-1`；`recordToolResponse()` 实际优先 `tool.id`，可能把 Map 写到错误 key | 同时检查 Map 只以协议关联 ID 命中，错误 ID 不得生成孤儿状态    |
| `tool response 使用未知状态字符串`           | 当前读取 embedded 默认 `running`，没有验证未知值是否进入 Map；UI 可能把未知非空状态当作非 loading             | 明确未知状态的归一化、拒绝或降级规则，并断言 effective loading |
| `tool` 为数组或 `null`                       | 只验证“不抛异常”和后续合法消息可处理，没有验证畸形 payload 是否污染 Map、列表或 listener                      | 检查畸形响应不建 Map key、不覆盖既有合法终态、不发错误领域事件 |

#### 深入复核修订：A–E 五类逐条归因（2026-07-23）

上面的表格是先前基于黑盒结果形成的初步记录；本节是在同一工作区快照上继续核对输入标准化、canonical Map、UI effective state 和消息/事件链后的修订版。为保留已有记录，不删除或覆盖上文；后续统计和优先级以本节为准。

验证结果：

- 命令：npx vitest run --config ./vitest.config.ts src/pages/superMagic/stores/**tests**/tool-response-execution-state.test.ts
- 环境：Vitest 3.2.6，Node v22.22.2；目标文件 35 项，10 passed / 25 failed，退出码 1。
- 同一命令连续运行两次，失败集合、实际值、期望值和断言行均一致。
- 目标测试起始行依次为 332、346、358、371、387、398、415、440、457、478、499、520、534、549、559、573、587、599、612、624、640、666、694、711、727、743、760、798、817、835、857、909、961、991、1052；失败断言行见下表。

观察层约定：

- E（assistant embedded）：src/pages/superMagic/stores/**tests**/tool-response-execution-state.test.ts:268-290 的 getResolvedToolState()，只读 messageMap 中 assistant 的 tool_calls[].tool。
- C（canonical）：src/pages/superMagic/stores/index.ts:945-950 写入的 toolResponseMap[topicId][toolId]。
- U（UI effective）：生产组件 src/pages/superMagic/components/MessageList/components/Nodes/MessageNode/ToolCall.tsx:66-79 的 Map 优先、embedded 兜底。
- R（raw/message）：messageMap、messages、buffer 和 listener；tool response 在 src/pages/superMagic/stores/index.ts:1152-1168 先写 C，再由 :1423-1453 写 R 并发事件。
- S（stream/topic）：topicMeta、isTopicStreaming()、HTTP 同步和任务终态。

下表证据简称：test = src/pages/superMagic/stores/**tests**/tool-response-execution-state.test.ts；index.ts = src/pages/superMagic/stores/index.ts；types.ts = src/pages/superMagic/stores/types.ts；ToolCall.tsx = src/pages/superMagic/components/MessageList/components/Nodes/MessageNode/ToolCall.tsx；MessageNode/index.tsx = src/pages/superMagic/components/MessageList/components/Nodes/MessageNode/index.tsx；MCPTool.tsx = src/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tools/MCPTool.tsx；task-domain-event-resolver.ts = src/pages/superMagic/stores/listener-registry/task-domain-event-resolver.ts。

主归因统计（每个失败只选一个主因）：

| 主归因                            | 数量 | 用例                                             |
| --------------------------------- | ---: | ------------------------------------------------ |
| A 测试断言 / fixture / 观察层问题 |   14 | 1、2、3、5、6、9、10、11、13、14、15、18、19、21 |
| B Store 输入数据标准化问题        |    1 | 8                                                |
| C Store canonical 生命周期问题    |    4 | 22、23、24、25                                   |
| D 测试与 Store 同时存在问题       |    5 | 4、7、12、16、20                                 |
| E 后端协议 / 产品契约待确认       |    1 | 17                                               |

#### 25 个失败用例的四层证据表

|   # | 测试用例及断言行                                       | 实际结果                                                                                       | 业务契约                                                                                                       | 输入标准化评估                                                          | Canonical Store 评估                                                                   | UI effective 评估                                                          | 消息/事件评估                                                                   | 主归因 | 次级风险                                              | 置信度 | 代码证据                                                                                          |
| --: | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
|   1 | tool response 先于所属 assistant final；L343           | E=running，期望 finished；C/U 已 finished，L339-342 的 raw 断言通过                            | role=tool 响应到达即应成为该 tool_call 的权威状态，不必等待 assistant final                                    | 合法 role、ID 相等、字段完整                                            | recordToolResponse() 已按 tool-1 入 C，且入队前写入                                    | U 读取 C，实际为 finished                                                  | R 可能晚于 C；不是消息到达失败                                                  | A      | 断言没有声明 E/C/U 层                                 | 高     | test:332-343、268-302；index.ts:945-950、1152-1168；ToolCall.tsx:66-79                            |
|   2 | tool response 先于工具头；L355                         | E=running，期望 finished；C/U 已 finished                                                      | response 先到也应按稳定关联 ID 暂存并在工具头出现后可见                                                        | 合法，tool_call_id 和 tool.id 均为 tool-1                               | C 已先建 key；后续工具头不会把 C 回写成 E                                              | U 为 finished                                                              | 只验证 E，未验证 header 到达后的 C/R 对齐                                       | A      | 需要单独定义 header projection 是否回写               | 高     | test:346-355；index.ts:945-950、1166-1168；ToolCall.tsx:66-79                                     |
|   3 | 同一 tool id 多 response；L437                         | E.detail=undefined，期望 latest；C.detail=latest                                               | 若 seq_id 是顺序依据，102 应胜 101；至少不能因读 E 丢失结果                                                    | payload 合法；但 seq_id 未进入 response 合并上下文                      | 当前是到达顺序 last-write，恰好得到 latest；没有 seq 防旧写保护                        | U.detail=latest                                                            | 两个 raw tool 消息可到达；失败不在 listener                                     | A      | B 风险：同 ID 乱序时旧响应可覆盖新响应                | 中高   | test:415-437；index.ts:945-950；types.ts:182-193；ToolCall.tsx:66-103                             |
|   4 | finished 后 running；L454                              | E/C/U 最终=running，期望 finished                                                              | 强终态不能回退到 running                                                                                       | 输入均为合法 tool response                                              | 无条件 Map.set()，强终态被弱状态覆盖                                                   | U 直接读到错误的 running                                                   | 两条 role=tool 消息均可入 R；事件去重不是根因                                   | D      | 测试仍读 E，但 C 本身也错                             | 高     | test:440-454；index.ts:945-950、1166-1168；ToolCall.tsx:75-79                                     |
|   5 | error 后 finished；L475                                | E=running，期望 finished；C/U=finished                                                         | 后来的明确成功结果是否覆盖 error，当前测试契约选择覆盖                                                         | 两个 payload 合法，ID 一致                                              | C 最终为 finished，未发现该场景的 canonical 失败                                       | U 已恢复 finished                                                          | raw/listener 顺序不是失败点                                                     | A      | 若 error 是不可逆终态，需要另行确认状态格             | 中高   | test:457-475；index.ts:945-950；ToolCall.tsx:66-79                                                |
|   6 | response_missing 后真实结果；L496                      | E=running，期望 finished；C/U=finished                                                         | response_missing 是弱占位，迟到真实结果应覆盖                                                                  | fixture 直接伪造 response_missing，输入形状合法                         | 当前真实 finished 可覆盖占位，行为满足此方向                                           | U=finished                                                                 | 两条 role=tool 消息可进入 R                                                     | A      | Store 没有自行生成 response_missing，生成路径仍缺失   | 高     | test:478-496；index.ts:945-950；ToolCall.tsx:66-79                                                |
|   7 | 真实 finished 后 response_missing；L517                | E=running，期望 finished；C/U=response_missing                                                 | 弱占位不能覆盖已存在真实 finished                                                                              | payload 合法，但优先级信息未携带                                        | last-write-wins 允许弱状态覆盖强状态                                                   | U 显示 response_missing，确有业务影响                                      | R 事件可正常到达，问题是合并规则                                                | D      | 断言读错 E，不能单独暴露 C 缺陷                       | 高     | test:499-517；index.ts:945-950、1166-1168；ToolCall.tsx:66-79                                     |
|   8 | 仅 tool_call_id、tool.id 缺失；L546                    | E=running，期望 id=tool-1/status=finished；C key=tool-1，value 缺 id；U status=finished        | 关联键和 payload.id 都应按同一规范化规则补齐                                                                   | 当前 key 可命中，但浅复制没有补 payload.id                              | C 部分正确、值未标准化；ToolResponseState.id 仍可选                                    | U 状态正常，但依赖 toolCall 自身 id 展示                                   | raw node 保留无 id 的 tool 对象                                                 | B      | 测试同时读 E，故即使修 C 仍需改断言层                 | 高     | test:534-546；index.ts:945-950；types.ts:182-193；ToolCall.tsx:66-103                             |
|   9 | 仅 tool.id、tool_call_id 缺失；L556                    | E=running，期望 finished；C/U=finished                                                         | live path 至少应能以 tool.id 关联已有 tool call                                                                | 合法 fallback 在 live 入队路径有效；HTTP/shared 路径优先级并不一致      | C key 正确，未见本场景 canonical 失败                                                  | U=finished                                                                 | R 只反映 tool message 到达，不要求 E 回写                                       | A      | HTTP 初始化仍只看 rawNode.tool.id，跨入口契约不一致   | 高     | test:549-556；index.ts:506-511、593-601、945-950；ToolCall.tsx:66-79                              |
|  10 | 标题已声明 Map finished、embedded running；L609        | E=running，期望 finished；C/U=finished                                                         | 明确测试 C 权威时应读取 C/U                                                                                    | 输入合法                                                                | C 已 finished                                                                          | U 已 finished                                                              | raw response 先到，assistant 后到；没有消息事件异常                             | A      | 测试名称与断言层自相矛盾                              | 高     | test:599-609、285-302；index.ts:945-950；ToolCall.tsx:66-79                                       |
|  11 | finished 但 detail 缺失；L620                          | E=running，期望 finished；C/U status=finished，detail 缺失                                     | status 与 detail 是两个维度；不能因 detail 缺失把 finished 读成 running                                        | payload 合法但部分字段缺失；没有默认/校验                               | C 保留合法 status，未凭空补 detail                                                     | U status=finished                                                          | raw tool 节点保留 detail 缺失，符合输入                                         | A      | 是否要求 finished 必有 detail 需另立协议断言          | 高     | test:612-621；index.ts:945-950；ToolCall.tsx:66-103                                               |
|  12 | detail 有、status 缺失；L636                           | E.detail=undefined，期望 detail；C.detail 已存在、status 缺失；U response 存在但 status 未定义 | 合法 detail 应保留；同时必须定义缺 status 时是否 loading、pending 或非法                                       | Store 接受部分 payload，不校验或从 detail 合并 status                   | C 保留 detail，但没有状态归一化/部分合并优先级                                         | U 可见 detail，却因 response 非空而不 loading；语义不稳定                  | raw/listener 可到达，非事件丢失                                                 | D      | 测试读 E；B/E 需明确缺 status 规则                    | 中     | test:624-637；index.ts:945-950；types.ts:182-193；ToolCall.tsx:66-103、249-257                    |
|  13 | attachments 延迟到达；L663                             | E.attachments=undefined，期望 file-1；C/U 为最新附件                                           | 延迟到达的附件应更新 canonical，不要求回写旧 assistant 快照                                                    | 两次 payload 合法；未携带 merge/seq 元数据                              | C 保存第二次 attachments                                                               | U.attachments 正确                                                         | 两个 raw tool 节点可排队；不是 UI 状态失败                                      | A      | 若 partial response 应合并旧字段，需补 B 测试         | 高     | test:640-663；index.ts:945-950；ToolCall.tsx:66-103                                               |
|  14 | attachments 与 assistant embedded 不一致；L691         | E=draft，期望 final-file；C/U=final-file                                                       | role=tool 的权威附件应胜过 assistant 草稿快照                                                                  | payload 合法、ID 相同                                                   | C 正确保存 final-file                                                                  | U 正确取 C                                                                 | raw response 到达不代表 assistant projection 必须同步                           | A      | syncToolCallsToolField() 仍按数组 index，另有独立风险 | 高     | test:666-691；index.ts:945-950、1276-1299；ToolCall.tsx:66-103                                    |
|  15 | buffer 被 assistant 动画阻塞；L708                     | R fast-tool 节点在 32ms 为 undefined，期望 finished；C/U 已 finished                           | canonical 执行状态应立即可用；raw 列表可按队列顺序延迟                                                         | 输入合法                                                                | enqueueMessage() 已先写 C，不等待 assistant timer                                      | U 已 finished，用户执行状态不应被 buffer 卡住                              | R/listener 仍受 processMessageBuffer() 顺序影响                                 | A      | 测试标题需明确测 C/U 还是 R 的到达时限                | 高     | test:694-708；index.ts:945-950、1152-1168、1413-1453；ToolCall.tsx:66-79                          |
|  16 | 任务 finished 仍有未结算工具；L723                     | E/U=running，期望 response_missing；S=false，C 无 entry                                        | task terminal 后普通工具不能永久 loading，应产生可覆盖弱终态                                                   | 无 role=tool 输入，属于缺失响应结算，不是 payload 解析                  | completeTopicSync() 只收敛 stream/snapshot，不扫描 unresolved tool                     | U 只能回退到 embedded running                                              | assistant finished 可被 domain resolver 视为 task_completed，但没有工具补缺事件 | D      | 断言层虽需改为 U，Store 也确实缺 terminal barrier     | 高     | test:711-724；index.ts:386-420、506-528；task-domain-event-resolver.ts:4-45                       |
|  17 | assistant status=suspended；L739                       | E/U=running，期望非 running；S=false                                                           | 是否 assistant suspended 就等价完整任务终态，或必须等待 role=tool suspended，当前未定                          | 无 role=tool 输入；依赖状态来源契约                                     | handleTopicSuspended() 只由 role=tool 且 node.status=suspended 触发                    | 若 assistant suspended 是终态，U 未关闭；若不是，当前 U 可合理保持 pending | resolver 会把终态 status 映射 task_completed，但真实 fixture 没有该组合         | E      | 协议确认后可能转为 D/C；不能直接把假设写成 bug        | 中     | test:727-740；index.ts:1423-1426、1738-1815；task-domain-event-resolver.ts:4-45                   |
|  18 | ask_user 无普通 tool response；L756                    | E/U=running/pending，期望非 running；C 无 entry                                                | ask_user 是等待用户输入的特殊生命周期，不应套普通工具缺失补偿                                                  | 无 role=tool 输入；测试把特殊工具当普通工具                             | Store 明确排除 ask_user 的中断补偿                                                     | AskUserToolCall 使用 loading=!toolResponse，无 response 时保持等待         | 真实 fixture 存在 user_tool_call，之后可迟到 role=tool finished                 | A      | 产品文案可显示 pending/suspended，但不应自动伪造完成  | 高     | test:743-756；index.ts:1760-1775；ToolCall.tsx:187-193；mock_v2.json:24249-24631                  |
|  19 | MCP 实际名称在 tool.name、function.name 为方法名；L814 | E.name=call_tool，期望 mcp.browser.search；C.name=mcp.browser.search                           | function.name、MCP sentinel、展示 original_name 是不同语义，不能要求 response Map 回写 assistant function.name | fixture 没有构造生产 MCP sentinel tool.name=mcp_tool_call，只写了方法名 | C 保留 response tool.name，未见 Map 失败                                               | toolData.name 仍取 function.name；MCP 分支还依赖 embedded sentinel         | R 可正常到达；失败是投影/契约，不是消息丢失                                     | A      | MCP 显示名来源仍需产品确认，属次级 E/UI 风险          | 中高   | test:798-814；index.ts:945-950；ToolCall.tsx:81-103、172-183；MCPTool.tsx:138-160                 |
|  20 | show_in_ui=false 工具仍影响完成判断；L831              | E/U=running，期望非 running；S=false，C 无 entry                                               | show_in_ui 只能影响展示，不能改变按 tool id 的 canonical 结算                                                  | 字段在测试 tool 上，但真实 Store/UI 没有消费该字段                      | 终态时仍缺统一 unresolved tool 补缺                                                    | MessageNode 仅校验 id/function.name，不读取 show_in_ui；“被隐藏”前提不成立 | assistant finished 可发完成事件，但没有按 ID 补 Map                             | D      | 测试 fixture 与生产字段位置/语义不一致                | 高     | test:817-831；index.ts:386-420；MessageNode/index.tsx:62-73、118-123、270-288；ToolCall.tsx:66-79 |
|  21 | response 应按 ID 而非数组 index；L853                  | E tool-b=running，期望 finished；C/U tool-b=finished，tool-a 未被覆盖                          | response 关联必须按 tool_call_id，不得按数组位置                                                               | payload 明确 tool-b，合法                                               | C 正确以 tool-b 建 key；未观察到按 index 错绑                                          | U 对 tool-b 正确，E 未同步                                                 | R 只收到一个 tool response，按 ID 足够                                          | A      | final assistant projection 另有按 index 的同步风险    | 高     | test:835-854；index.ts:945-950、1276-1299；ToolCall.tsx:66-79                                     |
|  22 | HTTP 刷新、task finished 后缺失 response；L894         | C/U=running，期望 response_missing；S 已 terminal                                              | HTTP 权威确认 task terminal 后，应逐 tool_call.id 补弱终态                                                     | 无 role=tool 输入，属于同步结算                                         | initializeMessages() 只收 rawNode.tool.id，completeTopicSync() 不生成 response_missing | U 无 C 只能继续显示 embedded running                                       | 只有 assistant message；无 role=tool message/event 是被测条件                   | C      | 同时需定义 late real response 覆盖窗口                | 高     | test:857-906；index.ts:386-420、506-528；test:293-302                                             |
|  23 | 下一轮 assistant 到达后旧工具退出 loading；L952        | C/U=running，期望 response_missing                                                             | seq 更高的新 assistant 是上一轮工具推进的完成屏障                                                              | 无 role=tool 输入；需按 correlation/tool id 推导 unresolved             | enqueue assistant 路径没有 next-assistant barrier 或补 Map                             | U 继续回退 E running                                                       | 新 assistant R 已到达且内容正常，缺的是旧 tool 生命周期收敛                     | C      | 应保留 topic/correlation 隔离，避免误结算当前轮       | 高     | test:909-957；index.ts:1152-1180、1738-1815；test:293-302                                         |
|  24 | 弱终态后迟到真实 response 可覆盖；L1024                | 前置 C/U=running，期望 response_missing；后续 overwrite 断言未执行                             | 必须先生成弱 response_missing，再允许真实 finished/error 覆盖                                                  | 前置无 role=tool，迟到响应本身合法                                      | 缺失的是前置 barrier；若已有 Map 弱终态，当前普通 response 可覆盖                      | U 在前置失败点即保持 running，无法验证后半段                               | following assistant 已到达；late role=tool 尚未走到测试断言                     | C      | 测试应拆成生成占位和覆盖占位两个独立用例              | 高     | test:991-1048；index.ts:945-950、1152-1168；test:293-302                                          |
|  25 | 多工具只让缺失项进入 response_missing；L1093           | completed-tool C/U=finished 已通过；missing-tool C/U=running，期望 response_missing            | 结算必须按每个 tool_call.id 逐项进行，不能因同轮有一个完成响应就停止                                           | completed response 合法；missing 项没有 payload                         | Store 没有扫描同一 assistant 的 unresolved tool_calls 并生成弱终态                     | completed tool 正常，missing tool 仍回退 E running                         | completed role=tool 与 following assistant 均可到达；缺失项没有事件是前提       | C      | 需明确 ask_user/隐藏工具是否从扫描中排除              | 高     | test:1052-1095；index.ts:386-420、1760-1805；test:293-302                                         |

#### 已通过用例的假阳性与覆盖缺口（10 项）

| 断言行 / 用例                      | 当前为何会通过                                                                                | 结论                  | 应补的断言方向                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| L358 tool response 先于任何 chunk  | 只看 raw tool node 和 isTopicStreaming=false，没有检查 C/U 与后续 assistant reconciliation    | 覆盖不完整            | 同时断言 toolResponseMap、effective state，以及后续 header/final 到达后的绑定    |
| L371 所属 tool call 从未出现       | 只证明孤儿 raw node 可见且无 assistant；未定义 orphan response 是否应进入 C、保留多久或发事件 | 覆盖不完整 / 契约缺口 | 检查 C key、correlation 隔离、孤儿清理和 listener/domain event                   |
| L387 tool response 永远丢失        | 只等待默认 2,500ms；没有 task terminal、next-assistant 或长 watchdog                          | 弱覆盖                | 增加明确屏障用例，并把“永远”改成可测时限                                         |
| L398 同一个 response 重复到达      | 两次复用了同一 envelope/app_message_id，只验证 R/listener 去重                                | 弱覆盖                | 用不同 app_message_id/seq_id 表达同一 tool，分别断言 C 的幂等和旧 seq 不覆盖新值 |
| L520 id 与 tool_call_id 不一致     | 只读 E 的 tool-1；当前 recordToolResponse() 会优先 tool.id，C 实际写入 wrong-tool-id          | 确定假阳性            | 断言 C 只命中协议主键、错误 key 不建孤儿状态，U 不应继续 loading                 |
| L559 tool 为数组                   | 只断言不抛异常，随后发送独立合法 response；数组会按 tool_call_id 建 key 并被展开到 C          | 确定假阳性风险        | 断言非法数组不建 Map、不覆盖既有终态、不发领域事件                               |
| L573 tool 为 null                  | helper 在 test:201-204 使用 tool ?? defaultTool，传 null 实际构造了默认合法 tool              | 确定假阳性            | 先修 fixture 构造 null，再断言拒绝/忽略及状态不污染                              |
| L587 未知 status                   | 只断言不属于三个终态；running、undefined 或 teleporting 均可能通过                            | 确定假阳性            | 先定义未知状态归一化/拒绝规则，再断言 C/U loading 语义                           |
| L760 ask_user 响应晚于新 assistant | 只检查下一轮 content 和迟到 raw node id，没有检查 ask_user C/U、correlation 或 loading        | 覆盖不完整            | 断言特殊生命周期保持 pending，迟到 response 精确覆盖同一 ask-1                   |
| L961 running 且无后续消息          | 在当前完全没有 response_missing 生成路径时也能通过；只跑 2,500ms，接近 vacuous                | 不能证明完整正确      | 保留负向断言，同时增加 finished/next-assistant 正向屏障和更长恢复边界            |

#### 额外 canonical 风险

- live 入队使用 tool.id 优先于 tool_call_id（index.ts:945-950），HTTP 初始化只接受 rawNode.tool.id（index.ts:506-511），分享消息却使用 tool_call_id 优先（index.ts:593-601）。三个入口的关联主键规则不一致。
- recordToolResponse() 只浅复制 tool payload，不保存 seq_id 或 correlation_id；同一 topic 内复用 tool id 会共享一个槽位，乱序旧响应也可能覆盖新响应。
- tool 为数组时，只要外层 tool_call_id 存在就可能污染 Map；tool 为 null 的真实输入也缺少 plain-object 校验。当前测试中的 null fixture 并未真实构造 null。
- 后续 partial response 会整体替换旧 snapshot；如果新响应缺少 detail、attachments、name 或 status，旧合法字段会丢失。
- ToolResponseState.status 是任意可选字符串（types.ts:182-193）；UI 对未知非空 status 会视为非 loading（ToolCall.tsx:75-79、249-257），但当前没有协议级降级规则。
- toolResponseMap 只按 topic + tool id 隔离，不包含 correlation；messageMap 又是全局 key Map（index.ts:149-151），跨轮 ID 复用和跨 topic message id 冲突仍需独立验证。

#### Store 问题优先级

| 优先级 | 问题                                                                                           | 影响用例                              | 建议的验收契约                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| P0     | 终态单调性与弱终态覆盖规则缺失：finished/error 会回退 running，response_missing 可覆盖真实结果 | 4、7，以及迟到/重放场景               | 定义状态格；强终态不可回退，response_missing 只能补缺且可被真实结果覆盖；按 seq 或明确优先级裁决                        |
| P0     | 缺失响应没有可靠结算屏障                                                                       | 16、20、22、23、24、25                | HTTP task terminal、下一轮 assistant、逐 tool_call.id 扫描都能生成弱 response_missing；正常 running 且无屏障不提前结算  |
| P1     | 三条入口的 ID 规范化不一致，且只用浅复制                                                       | 8、9、20、21及跨 HTTP/live/share 回放 | 统一 normalization boundary；明确 tool_call_id 与 tool.id 冲突策略；补 payload.id；拒绝数组/null；保留合法 partial 字段 |
| P1     | response 缺少 seq/correlation 元数据，Map 只按 topic + tool id、按到达顺序覆盖                 | 3、4、7及同 topic 多轮复用 ID         | 将 topic、correlation、seq 纳入裁决上下文；旧 seq 不得覆盖新结果，避免同 topic 不同轮串写                               |
| P2     | status/name/show_in_ui/MCP/ask_user/suspended 契约未集中定义                                   | 12、17、18、19、20及未来测试          | 形成协议矩阵并为未知状态、MCP 展示名、ask_user 等补专门测试；不要用 UI 现象反推 Store 已正确                            |

#### enterprise overlay 与生产对象检查

- 当前 checkout 没有 enterprise/src/pages/superMagic/stores/、enterprise 版 MessageNode/ToolCall，也没有目标测试的 enterprise 对应文件；结论为“无对应 overlay / adapter / test”。
- enterprise/src/main.tsx:19 仅直接导入 baseline 的 @/pages/superMagic/stores/test.ts，不是目标 Store 的替代实现。
- 当前 overlay 配置只会纳入实际存在的 layer source/config（vite/layers.ts:43-69）；本测试通过根 vitest.config.ts 加载，归因对象仍是 baseline src/pages/superMagic/stores/index.ts。
- 当前 checkout 不存在 src/pages/superMagic/stores/newVersion；不能把历史隔离实现或历史通过结果当成当前生产证据。

#### 测试断言调整方向（测试调整前记录）

- 测执行状态、detail、attachments 或 loading：应断言 C 与 U；只有明确测试 final assistant projection 时才断言 E。
- 测 buffer、messageMap、messages 或 listener：在用例名中写明 R 层和允许的队列延迟，不能据此否定 C 已立即入账。
- 测 ID 规范化：同时断言 Map key、Map value.id、错误 key 不存在以及 U 的最终绑定，不能只看 assistant tool call 自身的 id。
- 测状态优先级：直接构造并断言 C 的状态格，覆盖旧 seq、重复消息、finished/error/response_missing/running 的全部允许与禁止迁移。
- 测 response_missing：将“生成弱终态”和“迟到真实响应覆盖”拆成独立用例，避免前置失败导致后半段从未执行。
- 测 ask_user、MCP、show_in_ui 和 suspended：先固定协议/产品语义，再分别测试 Store 生命周期与组件展示，不把两层写进一个模糊断言。

#### 后续维护约定

- 本节对应且仅对应 `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`；新增、删除或重命名用例时，同步更新场景清单、统计和明细表。
- 每次运行记录日期、HEAD、目标文件工作区状态、Vitest 版本、通过/失败数量；WIP 快照与已提交基线必须明确区分。
- 默认用 `getEffectiveToolState()` 验证用户可见执行状态；只有明确测试 final assistant projection 时才使用 `getEmbeddedToolState()`（调整前 helper 名称为 `getResolvedToolState()`）。
- 测试 raw node、buffer 或 listener 时，在用例名和表格中显式标注观察层，不用它们替代 canonical/UI 状态。
- `response_missing` 是可被迟到真实 response 覆盖的弱终态；强终态不能回退到 `running`，弱终态也不能覆盖已存在的真实 `finished` / `error`。
- 缺失响应结算至少覆盖两种可靠屏障：HTTP 同步确认 task terminal，以及下一轮 assistant 到达；结算必须按 `tool_call.id` 逐项执行。
- `ask_user` 保持独立契约，不自动套普通工具缺失响应补偿；`suspended` 的触发角色/事件待后端协议确认后更新第 17 条。
- 修复或调整测试后保留原行，不删除历史；更新“当前状态”为已修复/已改测试，并附新的验证日期和结果。

#### Store 修复前历史快照：测试用例修正后验证（2026-07-23）

> 历史说明：本节记录 Store 业务修复前的阶段性结果，不再代表当前契约。其中“优先使用 `tool_call_id`”和“suspended 协议待确认”等结论已被后续用户决策废弃；当前规范以本章后面的“业务契约实施后验证”为准。

本节最初记录此前经授权完成的黑盒测试 fixture、观察层和等待方式调整。上面的 10 passed / 25 failed 是更早的历史快照，以下 20 passed / 14 failed / 1 todo 也只代表 Store 修复前状态。

验证上下文：

- HEAD：`456e6fbdfb5d64c5f8c810177c574f32af343d34`。
- Node：`v22.22.2`；Vitest：`3.2.6`。
- 开始复现时目标测试为 `AM`，`stores/index.ts` 为 `MM`；最终检查时两者工作区内容已与暂存区一致，状态分别显示为 `A`、`M`，当前文件内容和两次测试结果未变化。本次分析没有执行任何暂存命令。
- 命令：

```bash
npx vitest run \
  --config ./vitest.config.ts \
  src/pages/superMagic/stores/**tests**/tool-response-execution-state.test.ts
```

- 结果：`35 tests / 20 passed / 14 failed / 1 todo`，退出码为 `1`。
- 使用原命令复现后，又增加 `--silent --reporter=verbose` 重跑一次；两次失败数量、失败名称和首个断言位置一致，排除日志量、reporter 和偶发 timer 抖动导致的假失败。
- 14 个失败不能全部笼统归为 Store：本轮按实际业务可见影响、类型契约和真实 fixture 重新拆分为 `12 个 Store 问题 / 1 个测试断言问题 / 1 个协议待确认`。

##### 当前四层观察口径

| 观察层                | 当前测试 helper / 来源                                          | 用途                                                            |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --- | -------------------------------------------------- |
| E：assistant embedded | `getEmbeddedToolState()`，test:308-314                          | 只验证 assistant 快照是否更新；不把它当成 canonical 执行状态    |
| C：canonical          | `getCanonicalToolState()`，test:316-322；`toolResponseMap`      | 验证 role=tool 的权威状态、ID、detail、attachments 和状态格     |
| U：UI effective       | `getEffectiveToolState()`，test:324-334                         | 按 `Map                                                         |     | embedded`复现`ToolCall.tsx:66-79` 的用户可见优先级 |
| R/L：raw 与事件       | `getNode()`、`collectArrivals()`，test:286-355                  | 只验证 messageMap/messages/buffer/listener 到达和顺序           |
| S：topic/lifecycle    | `isTopicStreaming()`、`beginTopicSync()`、`completeTopicSync()` | 验证 HTTP/task 屏障与主题终态，不用 raw 到达替代 canonical 结算 |

##### 本轮测试脚本改动

- `createToolEnvelope()` 使用 `hasOwnProperty(options, "tool")` 区分“未提供”与显式 `null`，数组/null 不再被 fixture 默认合法对象吞掉（test:179-222）。
- MCP fixture 分离 `function.name="call_tool"`、embedded `tool.name="mcp_tool_call"`、canonical response `name="mcp.browser.search"`，三层各自断言（test:937-956）。
- 重复消息使用深拷贝 envelope，避免 Store 改写共享对象导致去重测试失真（test:337-338、445-461）。
- buffer 场景在 32ms 先验证 C/U 已完成、R/L 尚未到达，再用有界 16ms fake-timer 条件等待 raw 到达；不使用 `runAllTimers()`（test:270-284、816-850）。
- `ask_user` 保持 running/pending 且不自动生成普通工具终态；`suspended` 改为 `todo`，等待后端明确 task/role=tool 协议（test:873-892）。

##### 当前结果统计

| 结果                   |     数量 | 说明                                                                                                  |
| ---------------------- | -------: | ----------------------------------------------------------------------------------------------------- |
| 通过                   |       20 | 观察层切换、合法 partial payload、MCP 分层、ask_user 等测试脚本已与实际契约对齐                       |
| `stores/index.ts` 问题 |       12 | seq 裁决、状态单调性、关联主键、非法 payload 防御，以及 task/HTTP/下一轮 assistant 的缺失响应结算     |
| 测试用例问题           |        1 | 只有 `tool_call_id` 时 Map key 和 UI 状态均正确，测试额外要求可选的 `ToolResponseState.id` 必须被回填 |
| 协议待确认             | 1 failed | `ToolResponseState.status` 当前是开放字符串；未知 status 应拒绝、降级还是透传尚无枚举契约             |
| 协议待确认             |   1 todo | task suspended 时未完成工具的精确结算语义                                                             |

##### 真实数据与协议证据

- 跟踪文件 `mock_v1.json` 中共有 12 个 role=`tool` 节点，已观察到的 `tool.status` 全部为 `finished`；没有数组、`null` 或未知 status。数组/null 用例因此属于网络边界防御测试，不是已出现的正常协议分支。
- `mock_v1.json` 存在一个真实 ID 冲突：`finish_task` 的 `tool_call_id` 是 `call_01f6c7a8d7534ac7b29a421f`，而 `tool.id` 是消息 ID `930123765496365058`。UI 使用 assistant tool call 的 id 查询 `toolResponseMap`，所以 live path 必须优先使用 `tool_call_id`；当前 `recordToolResponse()` 反向优先 `tool.id`，会让真实结果写到 UI 永远查不到的 key。
- `ToolResponseState.id` 在 `stores/types.ts` 中是可选字段，生产 UI 也使用 tool call 自身 id 作为展示和查询标识。因此“只有 `tool_call_id`、payload 内没有 `tool.id`”时，当前 Map key 与 status 已满足可见业务；是否回填 value.id 应作为独立 normalization 契约，不能直接当成当前业务失败。
- `response_missing` 的完成屏障是本项目已经确立的兜底契约：后继 assistant 或 HTTP task terminal 证明流程已经推进时，为仍未收到 role=`tool` 的普通工具写入可被真实结果覆盖的弱终态；不能用纯超时提前结算，`ask_user` 仍保持独立等待语义。

##### 仍失败的 14 个用例逐条归因

|   # | 测试用例及断言行                               | 实际结果                                          | 业务契约                                                               | 输入标准化评估                                          | Canonical Store 评估                                      | UI effective 评估                             | 消息/事件评估                               | 主归因             | 次级风险                                                                 | 置信度 | 代码证据                                                                  |
| --: | ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | ------------------ | ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------- |
|   1 | 低 seq 覆盖高 seq；L493                        | C/U=`old`，期望 `latest`                          | 已到达的高 seq 不应被迟到旧响应覆盖                                    | 输入合法，但 seq 未进入合并裁决                         | `recordToolResponse()` 按到达顺序覆盖                     | U 直接显示旧 detail                           | 两个 R 节点均到达，非事件丢失               | Store 业务问题     | 同 topic 复用 tool id 还可能跨轮串写                                     | 高     | test:463-500；index.ts:945-950                                            |
|   2 | `finished → running`；L517                     | C/U=`running`，期望 `finished`                    | 强终态不可回退到 running                                               | 两条 payload 合法、ID 一致                              | 无条件 `Map.set()` 允许回退                               | UI 显示错误 loading                           | 两条 role=tool 消息均可到达                 | Store 业务问题     | 需定义 error 是否同样单调                                                | 高     | test:503-519；index.ts:945-950、1423-1456；ToolCall.tsx:66-79             |
|   3 | 真实 finished 被 `response_missing` 覆盖；L583 | C/U=`response_missing`，期望 `finished`           | 弱占位不能覆盖真实结果                                                 | payload 合法                                            | 当前 last-write-wins 覆盖真实状态                         | UI 进入错误弱终态                             | R 消息都已消费                              | Store 业务问题     | 需保留 late-real 覆盖窗口                                                | 高     | test:565-585；index.ts:945-950                                            |
|   4 | 冲突 `tool_call_id` / `tool.id`；L602          | C(tool-1)=`undefined`，错误 key 实际被写入        | 关联主键应为 `tool_call_id`；真实 `finish_task` 数据已证明两者可能不同 | 当前 live path 优先 `tool.id`，与真实 fixture 不兼容    | canonical 建在 `wrong-tool-id`                            | tool-1 只能回退 embedded running              | raw 节点保留冲突原值，事件可到达            | Store 业务问题     | HTTP/shared 入口的主键规则也不一致                                       | 高     | test:587-608；index.ts:945-950；mock_v1.json 的 finish_task tool 节点     |
|   5 | 只有 `tool_call_id`；L622                      | C key 和 status 正确，只有 value.id 缺失          | 当前类型允许 `id` 缺失，UI 也不读取 response.id                        | 关联与状态均成功，失败来自额外 shape 断言               | Map value 未补 id，但 canonical key 可正确命中            | U 已是 `finished`，无用户可见失败             | raw 输入合法且可到达                        | 测试用例问题       | 若未来要求可序列化 canonical value 自包含，再单独建立 normalization 契约 | 高     | test:610-630；index.ts:945-950；types.ts:182-193；ToolCall.tsx:66-99      |
|   6 | `tool` 为数组；L659                            | C 为带数字键对象，期望无 entry                    | 非 plain-object payload 应拒绝且不污染 Map                             | 数组被当作可展开对象                                    | `Map.set()` 写入畸形对象                                  | truthy 畸形 C 会遮蔽 embedded running         | raw/listener 仍可到达，问题在数据层         | Store 输入边界问题 | 不应覆盖既有终态；是否继续发 raw 事件可另定                              | 高     | test:646-668；index.ts:945-950；ToolCall.tsx:66-79                        |
|   7 | `tool=null`；L680                              | C 为 `{}`，期望无 entry                           | null 应被拒绝，不得生成空 canonical                                    | 缺少 plain-object 校验                                  | fallback 后浅复制出空对象                                 | 空 C 遮蔽 embedded，UI 会误判为非 loading     | raw 消费本身正常                            | Store 输入边界问题 | null 也会破坏 detail/status 读取                                         | 高     | test:670-689；index.ts:945-950；ToolCall.tsx:66-79                        |
|   8 | 未知 status；L699                              | C=`teleporting`，U 未回到 running                 | 未知状态应拒绝、降级还是透传尚未形成协议枚举                           | 类型允许任意字符串；tracked fixture 只观察到 `finished` | Store 当前原样接受任意 status                             | UI 将未知非空值视为非 loading，存在风险       | raw 节点正常到达                            | 测试契约待确认     | 协议确定后再归为 Store reject/normalize 或修改测试                       | 中     | test:691-701；types.ts:182-193；ToolCall.tsx:75-79、249-257；mock_v1.json |
|   9 | task finished 后缺失工具；L866                 | C 无 entry，U=`running`，期望 `response_missing`  | task terminal 后应逐 ID 生成可覆盖弱终态                               | 无 role=tool，输入本身是缺失响应场景                    | `completeTopicSync()` 只收敛快照，不扫描 unresolved tools | UI 继续显示 embedded running                  | S 已为非 streaming，assistant/card 内容正常 | Store 业务问题     | late real response 必须仍可覆盖                                          | 高     | test:852-871；index.ts:386-425、506-528                                   |
|  10 | `show_in_ui=false`；L975                       | C 无 entry，U=`running`，期望 `response_missing`  | 展示字段不能改变 canonical 生命周期                                    | fixture 中该字段只是额外输入；当前失败与字段位置无关    | 没有统一 unresolved tool 补缺                             | UI 仍回退 embedded running                    | S 已结束，失败不是消息到达                  | Store 业务问题     | 用例与普通 terminal 缺失场景部分重复，可保留为“不按展示字段排除”的防回归 | 高     | test:958-980；index.ts:1738-1771；MessageNode/index.tsx:62-73             |
|  11 | HTTP refresh terminal；L1047                   | sync accepted、card/content 正常，但 C 无 entry   | HTTP `taskStatus=finished` 应补 `response_missing`                     | `initializeMessages()` 接受 assistant 快照              | HTTP 初始化只从 raw `tool.id` 建 Map，未补缺              | U 仍为 running                                | R 初始化和 S terminal 均正常                | Store 业务问题     | 需保持 generation/topic 隔离                                             | 高     | test:1006-1054；index.ts:386-425、506-528                                 |
|  12 | 下一轮 assistant barrier；L1103                | following assistant 到达，C 无 entry，U=`running` | 新 assistant 应关闭上一轮 unresolved tool                              | 无 role=tool，依赖业务屏障推导                          | enqueue assistant 路径没有逐 ID 补 Map                    | UI 继续 loading                               | following R/card/content 正常               | Store 业务问题     | 不得误结算当前轮工具                                                     | 高     | test:1056-1110；index.ts:1152-1180、1738-1815                             |
|  13 | 弱终态后迟到真实响应；L1179                    | 前置 C 无 entry，后半段未执行                     | 先生成 `response_missing`，再允许真实 finished 覆盖                    | late role=tool fixture 合法                             | 缺的是前置 barrier；显式弱终态覆盖测试已通过              | U 无法进入覆盖阶段                            | following assistant 已正常到达              | Store 业务问题     | 当前用例是复合场景，建议未来拆成“生成占位/迟到覆盖”两个独立可观测断言    | 高     | test:1143-1211；index.ts:945-950、1152-1168                               |
|  14 | 多工具逐 ID 结算；L1259                        | completed C/U=`finished`，missing C 无 entry      | 同一 assistant 的缺失项必须逐 ID 补弱终态                              | completed payload 合法，missing 是无响应                | Store 只记录已到达工具，不扫描 missing id                 | completed 正常，missing 回退 embedded running | following assistant 和 completed R 均正常   | Store 业务问题     | ask_user 是否排除已有明确边界；其他特殊工具需继续维护矩阵                | 高     | test:1213-1266；index.ts:1760-1805                                        |

##### 已修正并通过的关键用例

- response 先于 assistant final/工具头：R、C、E、U 分层后，C/U 正确为 `finished`，E 保留 streamed `running` 快照。
- `error → finished`、`response_missing → finished`、detail/attachments partial payload：均改读 C/U，合法字段保留且真实结果可覆盖显式弱占位。
- 只有 `tool.id`、按 ID 绑定多工具、MCP 三层名称、ask_user 等特殊生命周期：测试不再要求 assistant projection 被 Store 反向写回。
- buffer 场景证明 C/U 不等待 assistant 动画，同时以 raw/listener 的独立条件等待验证最终消息到达。
- 任务仍 `running` 且无完成屏障时，C 不提前生成 `response_missing`；这保留了负向边界，避免把任意超时误当业务终态。

##### Store 缺口优先级（本轮只改测试，不修复）

| 优先级 | 缺口                       | 当前红测              | 验收契约                                                                                       |
| ------ | -------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| P0     | 状态单调性与弱终态优先级   | 2、3                  | `finished/error` 不回退；`response_missing` 只补缺且可被真实结果覆盖                           |
| P0     | 缺失响应完成屏障           | 9、10、11、12、13、14 | task terminal、下一轮 assistant、逐 `tool_call.id` 扫描均可生成弱终态；正常 running 不提前结算 |
| P1     | ID/非法 payload/seq 标准化 | 1、4、6、7            | 统一关联主键、拒绝数组/null，并按 seq 裁决；第 5 条不应阻塞业务，第 8 条等待 status 协议       |

##### enterprise 与辅助实现边界

- 当前 checkout 没有 `enterprise/src/pages/superMagic/stores/`、enterprise `MessageNode/ToolCall` 或目标测试对应文件；结论仍是“无对应 overlay / adapter / test”。
- `enterprise/src/main.tsx:19` 只是导入 baseline 的 `@/pages/superMagic/stores/test.ts`，不是替代 Store。
- `stores/newVersion` 即使存在，也只可作为辅助对照；本轮命令通过根 `vitest.config.ts`，归因对象始终是 baseline `src/pages/superMagic/stores/index.ts`。

##### 后续维护约定（历史版，已废弃）

- 新增、删除或重命名测试时，同步更新本节场景列表、统计和 14 条红测明细；每次运行记录日期、HEAD、Vitest 版本和工作区状态。
- 执行态、detail、attachments、loading 默认断言 C/U；E 只用于明确的 assistant projection characterization；R/L 只用于消息可观察性。
- 不使用 `vi.runAllTimers()` 代替业务屏障；渲染等待必须以公开 postcondition 和有界 frame 迭代为条件。
- `response_missing` 的生成与迟到真实覆盖应分别保证可观测；当前显式弱占位覆盖用例通过，屏障生成相关用例继续红。
- `ask_user` 保持独立等待契约；`suspended` 在协议确认前维持 todo，不把 assistant `status="suspended"` 冒充已确认的 role=tool suspend 事件。

### 业务契约实施后验证（2026-07-23）

本节是当前 “Tool response 与执行状态” 测试的有效记录。前面的失败归因和 Store 修复前快照仅用于追溯，不得再作为 `tool_call_id` 关联规则或 suspended 触发条件的实现依据。

#### 用户确认的当前契约

| 决策           | 当前验收规则                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未知 status    | 保留已定义的 detail、attachments 等载荷；已有合法 canonical 状态时沿用该状态，否则回退为 `running`。状态合并必须单调：`running` 不回滚到 `waiting`，`finished` 不回滚，`error` 只允许升级为 `finished`。 |
| task suspended | 只有 task-level `event="agent_suspended"` 或权威 HTTP topic `taskStatus="suspended"` 才批量结算普通未完成工具；单个 role=`tool` 消息的 `suspended` 只影响自身。                                          |
| 迟到真实结果   | 合成的 `suspended` 可被迟到的真实 `finished` / `error` 覆盖；`ask_user` 仍保持独立等待语义。                                                                                                             |
| ID 关联        | canonical Map、seq sidecar、buffer 判定和缺失结算只认非空字符串 `tool.id`；`tool_call_id` 只保留在 raw message 中用于观测。两者冲突时记录结构化 warning，不建立 alias 或 fallback。                      |

#### 当前验证上下文

- HEAD：`456e6fbdfb5d64c5f8c810177c574f32af343d34`。
- Node：`v22.22.2`；Vitest：`3.2.6`。
- 目标文件当前结果：`52 tests / 52 passed / 0 failed / 0 todo`。
- 当前工作区包含用户原有未提交改动；本轮没有暂存、提交或创建 worktree。
- `enterprise/src/pages/superMagic/stores/` 和对应 enterprise 测试均不存在，无 overlay / adapter / test 需要同步。
- 目标 ESLint：`0 errors / 9 existing warnings`，均为 `useTopicMessages.ts` 原有的 `no-explicit-any`；本轮相关代码、测试和本文档的 Prettier check 与 `git diff --check` 均通过。
- 项目级 `typecheck` 首次受 Node 默认堆限制 OOM；使用 8GB 堆后进入正常诊断，但被 enterprise、packages 和其他 src 目录的大量既有类型错误阻塞，因此不作为本轮目标 Store 的绿色门禁。

目标验证命令：

```bash
corepack pnpm exec vitest run --silent \
  --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts
```

#### 本轮 Store 修复点

- `recordToolResponse()` 对 live、`initializeMessages()`、`loadSharedMessages()` 统一使用 `tool.id` 建立 canonical 状态，并用 topic + tool.id 的 seq sidecar 阻止低版本覆盖和同版本冲突。
- 非 plain-object 的 `tool` payload 被拒绝；未知 status 归一化后仍保留合法载荷，并记录结构化 warning。
- 状态格统一阻止 `running → waiting`、`finished → running/error/suspended/response_missing` 等非法回滚；`response_missing` 与合成 `suspended` 允许被真实 `finished/error` 纠正。
- task-level suspended 入口同时覆盖 IM 事件与权威 topic 状态；单个 tool suspended 不再扩大成整个 topic 中断。
- finished assistant、HTTP finished、下一轮 assistant 三类完成屏障按 `tool.id` 逐项生成可覆盖的 `response_missing`，不因同轮已有部分 response 而整体短路。
- canonical tool response 在入队时立即记录；缺失结算同时检查 buffer 与尚未完成 UI 动画的 StreamState，避免被 assistant 动画阻塞。

#### 页面常驻轮询完成屏障（2026-07-23）

| 观察层                      | 新增黑盒契约                                                                                                                                                                                    | 当前结果      | 归因与调整                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| Store canonical / effective | `enqueueMessage()` 留下 running tool 后，空增量 HTTP 不重建消息；同 generation 的成功 `completeTopicSync(... taskStatus="finished")` 仍生成 `response_missing`                                  | `52/52` GREEN | Store 公开能力已满足，不需要为本场景修改 `stores/index.ts`                                              |
| Hook / HTTP 生命周期        | finished 轮询必须在请求前建立 generation，请求成功后使用同一 generation 提交；慢请求保持单飞；topic 恢复 running、其他 topic 正在同步、过期 syncing 元数据或消息处理异常均不得错误结算/永久阻塞 | `6/6` GREEN   | 缺口位于 `useTopicMessages.ts` 的常驻轮询集成；已补完成屏障、有效全局 active-sync guard、取消与异常释放 |
| UI effective                | 初始外层 `toolResponseMap` 尚无 topic，首次写入 canonical `response_missing` 后，真实 MobX observer 自动移除普通工具 spinner                                                                    | `5/5` GREEN   | UI 已正确消费 canonical 弱终态，不增加展示层兜底                                                        |

本轮核心组合验证为 `101 tests / 101 passed`：Tool response `52`、Hook `6`、ToolCall UI `5`、最终 Assistant Message `38`。相邻 HTTP 权威同步套件当前为 `25 tests / 18 passed / 7 failed`；这 7 条是 Store/HTTP 章节既有 TDD RED，且该套件不经过本轮修改的 Hook 路径，不归因于常驻轮询修复。

#### 历史关联测试运行记录

以下是本轮常驻轮询修复前的关联运行记录，仅用于追溯：`145 tests / 115 passed / 30 failed`，其中 HTTP 权威同步 `6` 条、最终 Assistant Message `9` 条、MessageList/UI 投影 `6` 条、Message Buffer `9` 条；当时目标 Tool response 套件为 `51/51`。当前结果以本节上方的 `101/101` 核心组合和 `25/18/7` HTTP 相邻套件记录为准。

```bash
corepack pnpm exec vitest run --silent \
  --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts \
  src/pages/superMagic/stores/__tests__/message-buffer.test.ts \
  src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts \
  src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts \
  src/pages/superMagic/stores/__tests__/message-list-ui-projection.test.ts
```

#### 后续维护约定（当前有效）

- 本节及顶部 52 个场景是当前 `tool-response-execution-state.test.ts` 的唯一有效结果；新增、删除或重命名用例时同步更新数量、命令和契约表。
- 新测试默认从 canonical / UI effective 层验证 status、detail、attachments；assistant embedded 只用于明确的投影 characterization。
- 不得重新引入 `tool_call_id` fallback、alias 或主键判断。需要观测冲突时只检查 raw message 与结构化 warning。
- 新增状态时必须同时更新合法枚举、状态迁移矩阵、未知状态回退测试和文档，不允许用 last-write-wins 绕过单调性。
- task-level suspended 的新协议入口必须有明确事件或权威 topic 状态证据；不得从单个 tool 节点状态推导全局中断。

## 最终 Assistant Message

- `finish_reason` 到达但 Final 尚未到达时，不启动本地 watchdog recovery。
- 最终 assistant message 先于尾部 chunk 到达。
- 最终 assistant message 先于 finish_reason 到达。
- 最终 assistant message 到达后，旧 chunk 继续写入。
- 最终 assistant message 重复到达。
- 同一个 correlation 收到两个不同的最终 assistant message。
- 最终 assistant message 显式 `content=""`。
- 最终 assistant message 显式 `content=null`。
- 最终 assistant message 只有 metadata。
- 最终 assistant message 缺少 `tool_calls`。
- IM Final 的 `tool_calls=undefined` 与字段 absent 同义，保留 streamed tools。
- 最终 assistant message 显式 `tool_calls=null`。
- 最终 assistant message 显式 `tool_calls=[]`。
- 最终 assistant message 的 `tool_calls` 不完整，Final 数组整体替换流式工具。
- Final tool 的 `function.arguments` absent 且存在同 identity streamed 值时继承该值。
- `finish_reason` 已清理 StreamState 后，late Final 的 nested arguments 仍从已投影 Assistant 值继承。
- HTTP Final 的 nested arguments absent 时继承活动流值，完成同步后不得被 raw snapshot 二次清空。
- HTTP Final 的 `tool_calls=undefined` 与字段 absent 同义，保留 streamed tools；只有显式 `null`/`[]` 才清空。
- 纯 `initializeMessages()` 没有 streamed 来源时，不为缺失 arguments 合成非空值。
- Final 显式 `function.arguments=""` 时覆盖 streamed 值。
- Final 数组重复 tool id 时末项胜出、只投影一个工具并记录结构化 warning。
- Final 删除 streamed tool 后不形成幽灵工具卡。
- 低 seq IM 不覆盖高 seq HTTP snapshot。
- 高 seq IM 覆盖低 seq HTTP snapshot。
- 最终 message 的 status 仍然为 running。
- 最终 message 的 tool 状态仍然为 running，但 tool response 已 finished。
- final message 缺少 token usage 时保留已有 canonical usage。
- final message 显式 `token_usage=null` 时清空已有 canonical usage。
- usage-only chunk 和 final message 的 token usage 不一致。
- final message 的 seqId 早于已有消息。
- Final 的有效 appMessageId 成为持久 canonical，并与流式占位收敛为一张逻辑卡。
- Final 与流式占位在 UI projection 中收敛为一张 correlation 稳定卡片。
- correlation 查询与当前 appMessageId 暴露相同 UI 语义。
- Final projection 保留真实 appMessageId，同时逻辑卡片 key 使用 correlation。
- Final 权威结算后公开流式生命周期结束。
- Final 后迟到 chunk 不得重新打开流或污染 canonical。
- 同一 appMessageId 的更高 seq Final 不得被重复判断跳过。
- final message 在 buffer 中被重复入队。

> 当前文件共 38 个 Vitest case，全部属于已确认契约并通过。`tool_calls=null/[]` 由参数化用例生成 2 个 case；TC-03、TC-07 和 IM/HTTP 运行时 `undefined`/absent 等价语义已进入正式回归门禁。

### 当前有效契约与验证（2026-07-23）

本节是“最终 Assistant Message”以及后续“Tool response 与执行状态”测试的当前统一判定基线。测试严格把 `src/pages/superMagic/stores/index.ts` 视为黑盒：只使用协议输入、公开 Store API、消息列表/UI 投影、公开 listener 和 Vitest 输出，不读取该文件实现。

#### 用户已确认的决策

> 本表中的 D1–D15、T1–T2 是“最终 Assistant Message”决策编号。本文后部 HTTP 章节中同名的 D1–D13 是更早的 HTTP 局部编号，不得混用。

| 决策        | 当前验收规则                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1=B        | `finish_reason` 只结束当前流式动画，不是 canonical Final。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D2=A        | Final 缺失时 Store 不设置本地 watchdog recovery；下一次消息获取或轮询触发 HTTP 拉取兜底。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D3=B        | Final transport 可以结束文本/推理流，但保留消息或任务的 `status=running/waiting`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D4=A        | `isTopicStreaming()` 只表示 Assistant 文本/推理流，不表示整个任务生命周期。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D5=自定义   | 流式阶段以 `topicId + correlationId` 作为临时聚合身份；chunk 的 `appMessageId` 不权威。Final IM 或 HTTP 初始化中的有效 `appMessageId` 是持久 canonical 身份。alias 收敛严格限定在同 topic、同 correlation、`role=assistant` 的逻辑消息域；Tool/User 等其他 role 始终按自身 appMessageId 独立保存，禁止被 Assistant canonical 覆盖。另一 topic 复用 correlation 时不得成为继承源或 alias 目标；全局 correlation key 已被其他 topic 占用时保留原 canonical，本 topic Final 仍按真实 appMessageId 独立保存并记录结构化 warning。找不到同 topic Assistant 目标时不得跨 role 回退，保留 correlation canonical 并记录结构化 warning；版本仍由 `seqId` 裁决。 |
| D6=A        | UI 逻辑消息卡 key 使用 correlation，不随 Final appMessageId 改变。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D7=B        | 旧 appMessageId 不要求永久重定向到最新对象；历史 revision 可以保留或不可查询，但不能伪装成当前 canonical。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D8=C        | HTTP 与 IM 没有来源优先级；同一逻辑消息始终由更高 `seqId` 胜出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D9=B        | 精确重复消息幂等；同 appMessageId 的更高 seq revision 必须被消费，不能被旧去重逻辑吞掉。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D10（修订） | 仅显式 `tool_calls: null` 或 `tool_calls: []` 清空 streamed tools；`tool_calls` 字段 absent 或运行时值为 `undefined` 时必须保留 streamed tools。该结论不自动外推到 `function.arguments` 等嵌套字段。                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| TC-03=确认  | Final tool 的 `function.arguments` absent/`undefined` 时，继承同 topic/correlation/tool id 的 streamed 值；没有继承源时不合成非空值；显式 `""`/`null` 仍由 Final 覆盖。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| TC-07=确认  | Final 数组内重复 tool id 使用末项胜出；canonical/UI 只保留一个工具，并记录结构化 warning。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D11=C       | Final `tool_calls` 是完整权威数组；存在该字段时整体替换流式工具及 arguments，不追加、不按长度猜测。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D12=B       | Final 中存在 `token_usage` 时以 Final 为权威；absent 保留已有值，显式 `null` 清空。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D13=自定义  | Store 保留 metadata-only 数据事实；UI 在没有任何用户可见内容时返回 `null` 隐藏。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D14=B       | Store 可以保留不同 revision；UI 对同一 correlation 只展示按 seq 裁决后的最新逻辑卡。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D15=B       | listener 只在 canonical 语义变化时触发；精确重复不触发，高 seq 有效更新必须触发。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T1=自定义   | Final 已删除的 streamed tool 不展示；已有 response 可以保留用于审计，但不得形成幽灵工具卡片。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T2=自定义   | 仅在既有完成屏障成立时生成 `response_missing`；只有 Final transport 且状态仍 running 时不生成。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

#### 当前黑盒评判标准

“测试用例问题”不能只以 UI 看起来正常为依据。每个用例应按需要同时检查以下层次：

| 观察层               | 必须验证的契约                                                                                                                                                                                           | 典型错误 oracle                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 协议 / fixture       | topic、correlation、appMessageId、seq、字段 absent/null/空值/空数组                                                                                                                                      | fixture 默认值把“省略”伪造成显式空值                            |
| `store.messages`     | revision 是否保留合理、最新逻辑消息是否正确、列表顺序与身份字段是否一致                                                                                                                                  | UI 单卡就推断 Store 数据一定干净                                |
| Canonical node       | correlation alias 只在同 topic Assistant 域内收敛；跨 topic 冲突时不覆盖既有 alias；有效 Final appMessageId 可寻址；Tool/User 仅按自身 appMessageId 独立查询；content/tool/token/status 满足权威与单调性 | 用对象引用相等代替语义一致                                      |
| UI projection        | `messagesConverter()` 后同 correlation 一张卡；真实 appMessageId 被保留；卡片 key 为 correlation                                                                                                         | 只检查 listener id 或 Store Map 数量代替 UI 卡片                |
| Tool effective state | `toolResponseMap` 优先，assistant embedded tool 仅 fallback；删除工具不形成幽灵卡                                                                                                                        | 强制要求 embedded snapshot 被回写                               |
| 生命周期 / 副作用    | 文本流、任务 status、listener 和 `response_missing` 屏障分别判断                                                                                                                                         | 把 Final transport、任务 terminal 和文本 streaming 混成一个状态 |

`projectUiNode()` 仅用于比较 UI 等价语义，会把 absent/null/empty 归一化；它禁止用于判断 D10/D12 的 canonical 字段存在性。这类用例必须直接检查字段是否存在及原始值。

#### 当前运行结果

验证命令：

```bash
corepack pnpm exec vitest run --silent \
  --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts
```

全文件结果：`38 tests / 38 passed`。TC-03 覆盖活跃 IM、StreamState 已清理的 late Final、活动流 + HTTP Final、纯刷新无继承源和显式空字符串；D10 额外覆盖 IM 与 HTTP 的运行时 `tool_calls=undefined` 均不清空；TC-07 覆盖末项胜出、单工具投影和结构化 warning exactly-once。D5 另在身份与 Tool response 套件覆盖跨 topic 不继承、Tool/User 跨 role 隔离及缺失 Assistant target 的 warning fallback。

六个相关文件联合验证结果为 `243 tests / 221 passed / 22 failed`：`final-assistant-message` 为 `38/38`、`chunk-transport-ordering` 为 `45/45`、`tool-response-execution-state` 为 `51/51`；其余 22 项仍是 `topic-correlation-message-identity` 的既有 9 项、`tool-call-argument-assembly` 的既有 6 项、`http-authoritative-sync-recovery` 的既有 7 项 TDD RED，没有新增失败。

相对上一版 `233 tests` 记录，本轮补入 10 个 D5 黑盒 case 且全部通过：两个 topic 同时存在 StreamState 时的 HTTP/IM 目标 topic 继承、IM correlation key 被 Tool 占用、流重启不清空 Tool canonical、HTTP correlation key 被 Tool/User 占用、task suspended 与其他终态结算不写脏 Tool canonical、suspended 完成不以 Tool node 覆盖已有 Assistant appMessageId、不可见话题完成流不覆盖 Tool canonical。结构化 alias warning 继续锁定事件名、冲突 role/appMessageId、处理策略和 exactly-once。

#### 修复前 7 个 RED 与本轮处置

下表保留修复前的可观察失败证据，作为后续回归归因基线；当前上述 7 项均已通过。

|   # | 失败用例                                                          | 修复前可观察结果                                                     | 违反决策    | 修复归因                                                                         |
| --: | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
|   1 | 同一个 correlation 收到两个不同的最终 assistant message           | correlation 已指向新内容，但新 Final appMessageId 查询为 `undefined` | D5、D8、D14 | Store 公开身份标准化契约 RED；测试断言准确                                       |
|   2 | 显式 `content=null` 清空旧 draft                                  | canonical 仍保留 `draft must be cleared`                             | D10         | Store 显式空值合并契约 RED；测试同时允许规范化为 `null` 或 `""`，未过拟合        |
|   3 | Final 缺少 `tool_calls`                                           | 流式 `tool-1` 被清空为 `[]`                                          | D10         | Store 把 absent 误当显式清空；测试断言准确                                       |
|   4 | 高 seq IM 覆盖低 seq HTTP snapshot                                | seq 201 IM 到达后仍保留 seq 200 snapshot                             | D8、D9      | Store 版本裁决契约 RED；测试同时检查 canonical、真实 appId、watermark 与消息列表 |
|   5 | 有效 Final appMessageId 与流式占位收敛                            | correlation 查询已是 canonical，但真实 `real-app-id` 不可查询        | D5          | Store 持久 canonical 身份契约 RED；UI 单卡通过不能掩盖该缺口                     |
|   6 | Final projection 保留真实 appMessageId，卡片 key 使用 correlation | 列表卡片的 `app_message_id` 仍是 correlation                         | D5、D6      | Store/UI 身份投影链路 RED；当前同一用例还会继续约束 correlation key              |
|   7 | 同一 appMessageId 的更高 seq Final                                | seq 101 Final 被旧 snapshot/去重逻辑跳过                             | D9、D15     | Store 幂等与 revision 更新契约 RED；精确重复仍保持幂等                           |

#### 当前通过项的解释与覆盖边界

- D1–D4：Final、`finish_reason`、文本 streaming 与 task status 已分层，未设置本地 watchdog recovery。
- D5：Assistant correlation alias 不跨 topic、也不跨 role；Tool/User 的 appMessageId、raw node 与消息列表身份保持独立。跨 topic alias 冲突保留既有 correlation canonical，并让新 Final 继续通过真实 appMessageId 可寻址；缺失 Assistant 目标时同样不向 Tool/User 回退。该隔离同时覆盖流重启、HTTP 初始化、task suspended、其他终态快照和不可见话题完成流；结构化 warning 锁定稳定事件名、冲突 role/appMessageId、处理策略和 exactly-once。
- D7、D14、D15：旧 revision 不强制永久 alias；UI 只保留一张最新 correlation 卡；精确重复 listener exactly-once。
- D10–D12：显式 `tool_calls=null/[]`、`tool_calls=undefined`/absent 保留、Final tool arguments replacement、token usage absent/null/Final 权威性已有独立用例。
- TC-03、TC-07：nested arguments absent 只继承同 topic/correlation/tool id 的有效值，匿名 index 槽位不是继承源；重复 Final tool id 按末项胜出收敛，不能依赖 UI 过滤掩盖 Store 重复项。
- D13：本文件验证 Store 保留 metadata 事实且用户可见字段为空；UI 组件实际 `return null` 的行为应由 UI 测试继续覆盖，不能要求 Store 丢弃 metadata 来代替。
- T1：本文件锁定 Final 删除的工具不再出现在 Assistant 可渲染 tool projection 中；role=`tool` 审计记录允许保留，是否形成独立 UI row 由 MessageTurnGroupList/UI 测试负责，不能用 `messagesConverter()` 的原始条目数代替最终可见性。
- T2：Final transport 到达但 `status=running` 时不生成 `response_missing`。

#### 后续维护门禁

- 调整“最终 Assistant Message”或“Tool response 与执行状态”测试时，先在本文记录协议决策、观察层和预期，再修改断言。
- 每次运行同步更新测试总数、通过/失败数量、失败名称与归因；保留仍符合契约的 RED。
- UI 正常不是 Store 标准化合理的充分条件；至少检查 fixture、`store.messages`、canonical node、UI projection、effective tool state、seq/listener/lifecycle 中与场景相关的层次。
- 不允许通过读取 `stores/index.ts` 来反推测试期望；测试应从确认协议与公开可观察行为出发。

### 历史：决策前黑盒判定与验证（2026-07-23）

> 以下 `24 tests / 15 passed / 9 failed`、9 个失败归因和 24 用例审计，是用户确认 D1–D15、T1–T2 之前的历史快照，不再代表当前状态。

当时的分析同样严格把 `src/pages/superMagic/stores/index.ts` 视为黑盒：只使用测试输入、公开 Store API、消息列表投影、UI 消费规则和 Vitest 输出，不读取该文件实现。

#### 验证上下文

- 当前 HEAD：`456e6fbdfb`。
- Node：`v22.22.2`；Vitest：`3.2.6`。
- 当前工作区并非干净提交基线：目标测试、`stores/index.ts` 和本文档均已有本地改动，因此结论只代表 2026-07-23 的当前工作树。
- 用户原命令中的目标 `src/pages/superMagic/stores/**tests**/final-assistant-message.test.test.ts` 不存在；真实文件是 `src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts`。
- 修正目标后连续运行两次，失败集合一致：`24 tests / 15 passed / 9 failed`。

验证命令：

```bash
npx --no-install vitest run \
  --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts
```

#### 评判标准：不能只看 UI，也不能锁死内部实现

| 观察层          | 必须验证的契约                                                                                                                                           | 不能据此单独推出的结论                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 协议 / fixture  | `topic_id`、`correlation_id`、`app_message_id`、`seq_id`、tool id；区分字段缺失、`null`、空字符串和 `[]`；明确 `finish_reason` 与 final assistant 的关系 | 未定义字段缺失语义前，不能把“省略”直接解释成“清空”                      |
| Canonical Store | 最新权威内容、reasoning、tool calls、token usage、status/event；同一逻辑消息的 seq 单调性、幂等、关联键和标准化语义                                      | 两个查询 key 返回同一个 JavaScript 对象引用不是业务契约                 |
| UI effective    | `messagesConverter()` 后只有一张逻辑卡片；稳定 key；最终 content；工具实际 loading/status/detail/attachments                                             | UI 的过滤和 fallback 可能掩盖 Store 中的脏字段、旧 alias 或不一致 shape |
| 生命周期 / 恢复 | `isTopicStreaming()`、公开的 stream state、晚到 chunk 不污染 final、recovery callback、HTTP/IM 权威顺序                                                  | 不应直接断言内部 Map/Set、timer 数量或具体容器结构                      |
| 工具执行态      | `toolResponseMap.get(topicId)?.get(toolCallId)` 优先，assistant embedded `toolCall.tool` 只作 fallback                                                   | embedded tool 状态没有被回写，不等于 UI 仍然 loading                    |

项目消费者进一步限定了这些标准：

- `MessageList/helpers.ts:22-55` 按 `correlation_id` 反向保留最新消息，`:103-112` 默认使用 `app_message_id` 作为列表 key。
- `MessageNode/index.tsx:87-123` 使用列表项的 `app_message_id` 查询节点，并过滤缺少稳定 `id` 或 `function.name` 的工具。
- `MessageNode/ToolCall.tsx:66-79` 明确使用 `toolResponseMap` 优先、assistant embedded tool 兜底来计算真实工具状态。
- `topic-conversation-loading.ts:84-94` 会把最后一个非用户节点的 `status=running/waiting` 判为 loading；因此“final status 仍是 running，但 UI 已彻底结束”不能在没有额外标准化说明时同时成立。
- `stores/types.ts:85-109` 的 `MessageItem` 说明 `app_message_id`、`correlation_id`、`seq_id`、role/status/topic 是公开消息投影的一部分；标准化应检查这些语义字段，而不是对象 identity。

因此，“测试用例问题”的判断不能只证明 UI 看起来正常。每一项还必须检查：

1. `store.messages` 是否只有预期的逻辑消息，且 seq、role、topic、app/correlation 关系正确。
2. `getMessageNode()` 的 canonical 语义字段是否一致，是否残留旧 content/tool/status。
3. 工具状态是否以 `toolResponseMap` 与 UI effective state 为准。
4. 重复、乱序、晚到数据是否满足幂等与单调性。
5. 字段缺失、`null`、`[]` 是否有已确认的协议语义。

“标准化合理”不等于 `toBe()` 引用相等，也不等于对完整对象做无差别 `toEqual()`。应先定义需要一致的语义字段，再对这些字段做结构化断言。

#### 9 个失败用例归因

主归因汇总：`测试/契约问题 6 项`、`Store 业务问题 2 项`、`测试断言与 Store 标准化同时需处理 1 项`。

|   # | 用例 / 失败行                                             | 本轮实际结果                                                                                | 主归因          | 精准判断与建议                                                                                                                                                                                            |
| --: | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------- |
|   1 | L332，失败 L343：chunk 完整但 final 长时间不来            | content 已稳定、stream state 已结束，5.1 秒后 recovery 仍为空                               | 测试 / 协议问题 | 现有 chunk-ordering 用例把完整 `finish_reason=stop` 视为已完成且不 recovery；本用例却要求 recovery，契约互相冲突。先明确“final assistant 是否必达”及恢复 SLA，再决定 Store 是否错误；不要直接归因 Store。 |
|   2 | L387，失败 L397：最终 assistant 重复到达                  | topic listener 只有 1 次；两侧 content 均为 `canonical`，但 alias 不是同一对象引用          | 测试问题        | 去重核心行为已通过，失败来自 `toBe()`。改为断言一张逻辑卡片、最新语义字段和 listener 的 exactly-once 副作用；另行记录 alias shape 标准化，不要求引用相等。                                                |
|   3 | L401，失败 L416：同 correlation 两个不同 final            | correlation 查询已是 `new`；旧 app id 仍保留旧节点                                          | 测试问题为主    | UI 会按 correlation 保留最新卡片；“所有历史 app id 永久重定向到最新对象”没有现成契约。改为验证一张卡片和最新内容；如产品确需历史 alias 收敛，应拆成独立标准化测试。                                       |
|   4 | L505，失败 L517：HTTP 快照先到，更新 IM 后到              | seq=201 的 `new IM` 没有覆盖 seq=200 的 `snapshot`                                          | Store 业务问题  | 同一 app/correlation 的更高 seq 应成为最新 canonical 状态，反向旧 IM 不覆盖新快照的用例已经通过。保留红测，并补 `messages`、canonical node 和 latest seq 三层断言。                                       |
|   5 | L536，失败 L556：embedded tool running，response finished | assistant embedded 仍为 `running`                                                           | 测试问题        | 生产 UI 使用 `toolResponseMap                                                                                                                                                                             |     | embedded`；应断言 canonical/effective status 为 `finished`，不要求旧 assistant 快照被回写。 |
|   6 | L617，失败 L632：final 与流式占位卡合并                   | correlation 占位节点保持原引用且 content 已变为 `canonical`；真实 app id 查询为 `undefined` | 混合问题        | UI 合并核心已成功，`toBe()` 仍是错误 oracle；但真实 app id 无法寻址暴露潜在 alias/标准化缺口。应拆成“单卡/UI 合并”与“app id alias 规范”两个测试，后者再决定是否为 Store 缺陷。                            |
|   7 | L653，失败 L662：correlation alias 与真实 app id          | 两个 key 都能读到 canonical content/status，但默认字段 shape 不同且引用不同                 | 测试问题为主    | 引用相等无依据；应先定义 normalized semantic projection，再比较 role/topic/correlation/message/content/status/tool/token 等必要字段。若语义字段仍分叉，才归 Store 标准化。                                |
|   8 | L691，失败 L707：同 app id 的更新 final 被跳过            | seq=101 的 `new final` 没有覆盖 seq=100 的 `old snapshot`                                   | Store 业务问题  | 与第 4 项同根：更新消息被去重逻辑当作重复而不是新版本。测试输入和预期充分，应保留红测。                                                                                                                   |
|   9 | L711，失败 L722：final 在 buffer 中重复入队               | listener 已正确去重为 1 次；失败只来自 app/correlation alias 的 `toBe()`                    | 测试问题        | buffer 幂等核心已经通过。改为断言 listener exactly-once、`messagesConverter()` 后一张卡片以及 normalized semantic state。                                                                                 |

#### 24 个用例逐条准确性审计

|   # | 起始行 | 用例简写                               | 当前结果 | 用例质量           | 后续动作                                                                                                |
| --: | -----: | -------------------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
|   1 |    332 | chunk 完整、final 缺失                 | 失败     | 契约冲突           | 先定义 `finish_reason` 与 final/recovery 关系，再修改预期。                                             |
|   2 |    347 | final 先于尾部 chunk                   | 通过     | 合格               | 保留；可补一张 logical card 的 postcondition。                                                          |
|   3 |    360 | final 先于 finish_reason               | 通过     | 合格               | 保留；核心是 final 不被尾部 marker 改写。                                                               |
|   4 |    373 | final 后旧 chunk 继续写入              | 通过     | 合格               | 保留；这是晚到数据不污染 canonical 的有效契约。                                                         |
|   5 |    387 | final 重复到达                         | 失败     | 断言过拟合         | 删除对象引用要求，改查语义、单卡和 exactly-once 副作用。                                                |
|   6 |    401 | 同 correlation 两个 final              | 失败     | 断言过拟合         | 保留 latest-content 断言；历史 alias 重定向另立契约。                                                   |
|   7 |    420 | final content 为空                     | 通过     | 合格               | 显式空字符串应清掉旧 draft，属于可见业务契约。                                                          |
|   8 |    431 | final 只有 metadata                    | 通过     | 覆盖不足           | 已验证 role/status/event；还应检查是否产生无意义空卡及缺省字段语义。                                    |
|   9 |    452 | final 缺少 `tool_calls`                | 通过     | 协议依据不足       | 省略、`null`、`[]` 必须分开建 fixture；当前 mock 中 assistant 均携带该字段。                            |
|  10 |    463 | final `tool_calls` 不完整              | 通过     | 条件性合格         | 只有在 final 明确定义为 canonical replacement 时，2 项收敛为 1 项才成立；应把该规则写入测试名/注释。    |
|  11 |    481 | 旧 final 不覆盖新 HTTP 快照            | 通过     | 合格               | 保留 canonical content + seq watermark。                                                                |
|  12 |    505 | 新 IM 覆盖旧 HTTP 快照                 | 失败     | 合格红测           | Store 的 higher-seq-wins 行为未满足。                                                                   |
|  13 |    521 | final node status 仍为 running         | 通过     | 假阳性风险         | 当前只验证 stream 停止，没有验证最终 status；需明确 Store 是否标准化为终态，否则 UI loading 语义矛盾。  |
|  14 |    536 | response finished、embedded running    | 失败     | 观察层错误         | 改断 canonical/effective tool state。                                                                   |
|  15 |    559 | final 缺少 token usage                 | 通过     | 覆盖不足           | 标题测试 usage，但没有任何 `token_usage` 断言；需定义缺失时保留、清空或 fallback。                      |
|  16 |    574 | usage-only 与 final usage 冲突         | 通过     | 合格               | final 被定义为权威时，应以 final usage 为准。                                                           |
|  17 |    590 | 独立 final 的 seq 早于已有消息         | 通过     | 覆盖不足           | node 与 watermark 合理，还应验证列表排序不被打乱。                                                      |
|  18 |    617 | final 与流式占位卡合并                 | 失败     | 混合               | UI 单卡合并与 app id alias 标准化拆开验证。                                                             |
|  19 |    636 | final 生成第二张 assistant 卡          | 通过     | 代理不充分         | listener id 集合不等于 MessageList 卡片数；应检查 `store.messages` + `messagesConverter()` + 稳定 key。 |
|  20 |    653 | correlation/app id alias               | 失败     | 断言过拟合         | 用 normalized semantic projection 取代 `toBe()`。                                                       |
|  21 |    666 | final 后 stream state 残留             | 通过     | 合格               | 公开生命周期表现合理；继续断言无 loading/late mutation。                                                |
|  22 |    678 | final 后 late chunk 不得重启           | 通过     | 合格，但命名内部化 | 断言本身是黑盒；测试名改成“late chunk 不得重新打开流”比提内部 Set 更准确。                              |
|  23 |    691 | 更新 final 被 `hasMessage`/buffer 跳过 | 失败     | 合格红测           | Store 的 newer-seq 更新被错误丢弃。                                                                     |
|  24 |    711 | final 在 buffer 重复入队               | 失败     | 断言过拟合         | listener 幂等已通过；改查语义和卡片数。                                                                 |

本轮 15 个绿测中，9 个核心契约足够明确，另有 6 个存在覆盖不足、协议未定义或错误代理，不能因为当前是绿色就视为测试准确。

#### 建议的测试调整顺序

1. 先修测试 oracle：第 2、3、5、7、9 个失败项，以及第 13、15、19 个假阳性/弱覆盖项。
2. 把第 6 个失败项拆成 UI 合并与 alias 标准化两个测试，避免一个 `toBe()` 同时混合两层结论。
3. 保留第 4、8 个 Store 红测，统一要求 higher-seq-wins，并同时验证 `messages`、canonical node 和 latest seq。
4. 第 1 项先形成协议决定：完整 `finish_reason` 后是否仍必须等待 final assistant，以及 watchdog 的可测 SLA。
5. `tool_calls`、`token_usage` 的 absent / `null` / `[]` 分别建 fixture；真实 `mock_v1.json` 的 11 条 assistant 与 `mock_v2.json` 的 32 条 assistant 均包含这两个字段，当前“完全省略”的输入不能代表常规线上形态。

本轮按“只分析、不修改代码”的约束，没有修改 `final-assistant-message.test.ts`。上表中的测试修改项是后续实施清单；在实施前，应以本节的分层标准为唯一归因基线。

#### 与“Tool response 与执行状态”的统一维护约定

- 工具 status/detail/attachments/loading 默认断言 canonical/effective state；只有明确测试 assistant projection 时才断言 embedded tool。
- UI 正常不是 Store 标准化正确的充分条件；同时记录 `messages`、canonical node、tool response Map、seq 与生命周期。
- alias 需要比较定义过的语义字段，不得使用对象引用相等证明业务一致。
- listener exactly-once、消息列表单卡和 canonical 幂等是三项不同契约，不得互相替代。
- 新增、删除、重命名或调整这两组测试时，必须同步更新本文档的场景清单、运行结果、归因和协议待确认项。

## 渲染状态机与 Timer

- `currentToolIndex` 大于最终 tool_calls 长度。
- `currentToolIndex` 指向已经被 final 删除的工具。
- tool_calls 顺序变化后 `currentToolIndex` 未重置。
- 当前 arguments 更长，算法只检查 `<`，无法回退。
- 当前 arguments 内容分叉但长度较短，继续从错误偏移追加。
- 当前 arguments 内容分叉且长度相同，永久不相等。
- `isToolCallsEqual()` 永远为 false。
- `stage="tool"` 永远无法进入 `"done"`。
- `isFinalMessageReceived=true`，但 stage 仍不是 done。
- final 状态下 `progressed=false`，仍然每 16ms 创建 timer。
- timer 回调持续运行但每次没有任何数据变化。
- timer 被清理，但 StreamState 仍保留。
- StreamState 被删除，但 timer 未清理。
- timer 回调执行时 topic 已经切换。
- timer 回调执行时 correlation 已经 finalized。
- recovery timer 与渲染 timer 同时存在。
- recovery timer 属于旧 correlation，却恢复新 correlation。
- final 状态不触发 recovery watchdog。
- 非 final 状态持续有无意义 heartbeat，导致 recovery 一直被延后。
- 一个 topic 多个 StreamState，但只有一个 topic timer。
- 第一个 StreamState 永不完成，后续 StreamState 永远饥饿。
- content Map 的插入顺序与消息顺序不同。
- `completeStreamRendering()` 清除了错误的 correlation。
- complete 后 buffer 没有继续消费。
- complete 后立即被晚到 chunk 重新创建。
- 后台标签页 timer 被浏览器降频，导致追平极慢。
- 大量同步 MobX 更新造成渲染阻塞。
- final 内容很大，逐字追平耗时过长，业务看上去像卡死。
- `renderPolicy` 在 live、catchup、instant 间错误切换。
- catchup 结束后没有恢复 live。
- terminal topic 被 instant settle，但仍有真实 chunk 在途。

## Message Buffer

- buffer 中同一个 appMessageId 重复入队。
- buffer 中同一个 correlation 的不同 appMessageId 重复入队。
- `isProcessing=true` 后异常返回，未恢复为 false。
- assistant message 因 timer 存在而反复放回队头。
- 队头 assistant 永不完成，后续消息永久阻塞。
- tool response 被排在永不完成的 assistant 后面。
- tool response 已写入 toolResponseMap，但消息列表迟迟没有该 tool message。
- buffer 中消息顺序与 seqId 顺序不一致。
- buffer 到达顺序正确，但 `sortMessages()` 重排错误。
- seqId 缺失。
- seqId 重复。
- seqId 是超大数字字符串。
- seqId 带本地后缀，例如 `_timestamp`。
- 使用字符串 `localeCompare()` 导致数字顺序异常。
- finalized assistant 的 buffer 副本未被丢弃。
- finalizedCorrelationIds 错误导致合法 assistant 被丢弃。
- processMessageBuffer 递归处理大量消息造成长任务。
- buffer 长期增长而没有清理。
- topic 被删除后 buffer 仍保留。
- 切换 topic 时旧 buffer 继续产生领域事件。

## Topic 切换与后台运行

- 流式过程中从 topic A 切到 topic B。
- topic A 后台继续收到 chunk。
- topic A 后台收到 final。
- topic A 后台收到 tool response。
- topic A 后台完成后切回，错误重播打字机。
- topic A 未完成时切回，但 timer 未恢复。
- topic A 已完成时切回，却重新创建 StreamState。
- 快速执行 A → B → A。
- 快速执行 A → B → C → A。
- 多个 topic 同时收到流式 chunk。
- activeTopicId 更新晚于 chunk 到达。
- topic 切换时旧 timer 回调已经进入任务队列。
- inactiveAt/lastActiveAt 记录顺序错误。
- 浏览器休眠后恢复，错误判断为长时间离开。
- 系统时间变化导致 inactive 时长异常。
- 切回时 HTTP 同步和 replayPendingSnapshots 同时执行。
- 切回时 resumeActiveStreams 早于 HTTP 权威快照。
- terminal topic 切回时仍进入 live 模式。
- 后台 topic final 后 streamSnapshots 未清理。
- topic 被关闭或删除，但 topicMeta 没有释放。
- 同一个页面存在两个 Store 订阅实例，chunk 被消费两次。
- React Strict Mode 或热更新导致 PubSub 重复订阅。

## HTTP 权威同步与恢复

- 已有 HTTP sync 时 watchdog 必须复用该请求，不再发起 recovery。
- 同一 correlation 的 recovery 开始同步后必须合并后续 watchdog。
- 旧恢复请求的低 seq HTTP 数据进入 `initializeMessages()` 后仍不得回退。
- HTTP 外层 transport topic 负责路由，内层 Agent topic 保留业务映射。
- HTTP 响应没有包含目标 correlation。
- 分页结果必须先聚合，再以一次 authoritative snapshot 替换 topic 视图。
- 同逻辑消息的低 seq HTTP 快照不得回退 IM canonical 数据。
- HTTP 响应比本地 StreamState 更新。
- HTTP 响应到达时 final chunk 同时到达。
- HTTP assistant 与 tool response 并发时以 `tool.id` 的 canonical Map 状态为准。
- 同 `appMessageId`、不同 `correlationId` 的 HTTP 记录必须整体拒绝。
- `initializeMessages()` 按 correlationId 隔离不同 role 的消息。
- 后到 HTTP assistant 快照不得覆盖 `tool.id` 对应的 canonical response。
- terminal HTTP snapshot 的 `tool_calls` 必须完整替换本地流式 tool slot。
- nonterminal HTTP snapshot 的 `tool_calls` 必须与本地流式 slot 合并。
- 权威快照完成后公开流式生命周期结束。
- 过期 generation 的 HTTP payload 仍进入版本裁决，只有生命周期副作用被拒绝。
- syncState 离开 syncing。
- HTTP 请求失败后的 recovery 退避必须有界且单调递增。
- 收到新的有效 chunk 后 recovery 退避应重置到初始有界区间。
- 连续 recovery 失败必须在有界次数后进入可观察终态。
- 最终任务已 finished 且 HTTP 同步失败时停止 stream/loading，保留 draft 并允许独立 retry。
- canonical message 完成后结束自身 stream，即使服务端 task 仍 running。
- 服务端任务状态 finished，但本地仍有 buffer。
- 已完成消息仍可接受更高 seq 的 authoritative revision。

### 黑盒判定基线与最终验证（2026-07-23）

#### 范围与约束

- 本节将 `src/pages/superMagic/stores/index.ts` 视为黑盒；最终判断与测试调整只使用目标测试输入、公开 Store API/字段、`store.messages`、`getMessageNode()`、`toolResponseMap`、`messagesConverter()`、UI loading/tool 消费规则和 Vitest 输出。
- 边界审计：一次辅助只读搜索因 glob 排除规则写错，终端意外打印了该文件约 17 行；输出随即废弃，没有用于结论、断言或修改。主分析与最终复验没有打开该文件，但团队级过程并非“零曝光”，后续必须使用精确文件白名单而不是排除 glob。
- 本轮按已确认的 HTTP-D1～HTTP-D13 调整目标测试，没有修改 Store 业务实现。
- `enterprise/src/pages/superMagic/stores/` 当前不存在，没有对应 overlay 测试需要同步。

#### 验证上下文

- 当前 HEAD：`456e6fbdfb`。
- Node：`v22.22.2`；Vitest：`3.2.6`。
- 当前工作区不是干净提交基线：目标测试为新增文件，本文档已有其他未提交修改；结论只代表 2026-07-23 的当前工作树。
- 最终冻结版本连续运行两次结果一致：`25 tests / 18 passed / 7 failed`，退出码均为 `1`。
- 7 项失败全部是业务断言失败；没有导入错误、运行时异常、pending、skip 或未收集用例。
- 四个相邻套件（Final Assistant、Tool response、MessageList/UI、Message Buffer）组合复验为 `130 tests / 115 passed / 15 failed`。该结果只用于观察跨层漂移，15 项失败仍归各自章节，不并入本节的 7 个 HTTP RED。

本轮调整后的失败基线不是“测试框架坏了”，而是 7 个保留的 Store RED，分布在 HTTP-D1（2 项）、D2、D3、D4、D6、D11。HTTP-D7/D9 的低 seq 与 stale generation 场景在当前工作树已通过；工具 Map/effective、消息列表顶层字段、fixture app id、D10 reset 证据、D11/D4 强制删除 StreamState 等测试 oracle 问题已修正。

验证命令：

```bash
corepack pnpm exec vitest run \
  --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts
```

局部质量门禁：目标测试 TypeScript ESLint 为 `0 errors / 0 warnings`；两个目标文件 Prettier check 与 `git diff --check` 均通过。本轮直接执行 `pnpm exec eslint src/pages/superMagic/stores/tests.md` 在 Node 约 4 GB heap 上限触发 OOM，因此 `.md` 没有形成可用的 ESLint 门禁；该结果不能解释为文档内容通过或失败。

#### 评判标准：UI、Store 标准化与生命周期必须分层

“测试用例问题”不能只用“UI 看起来正常”来判断。UI 可能通过去重、过滤或 fallback 掩盖 Store 中的脏数据；反过来，assistant 内嵌快照没有被回写，也不等于 UI effective state 错误。

| 观察层                     | 黑盒观察点                                                                                                                        | 必须验证的契约                                                                               | 不能单独推出的结论                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 协议 / fixture             | outer transport topic、inner Agent topic、app/correlation、role、seq、`tool.id`/`tool_call_id`；字段缺失、`null`、空字符串和 `[]` | 输入是否代表已确认协议；冲突字段按 HTTP-D3/D7/D8/D12 处理                                    | 不能用 UI 结果反推未覆盖的协议字段                                                                |
| 消息列表                   | `store.messages.get(topicId)`                                                                                                     | 逻辑消息数量、顺序、role/topic、app/correlation、seq；同一逻辑消息不应留下互相矛盾的版本     | UI 最终只显示一张卡片，不代表 Store 列表没有重复或脏 alias                                        |
| Canonical node             | `getMessageNode(appMessageId/correlationId)`                                                                                      | content、status、tool calls 和身份字段的语义投影一致；高低版本满足已确认的单调性             | 两个查询 key 返回同一 JavaScript 对象引用不是业务契约                                             |
| Tool canonical / effective | `toolResponseMap.get(topicId)?.get(toolId)`；Map 优先、assistant embedded 兜底                                                    | role=`tool` 的 status/detail/attachments 和用户实际 loading                                  | embedded tool 未被回写，不等于工具仍在 loading                                                    |
| UI 投影                    | `messagesConverter()` 的卡片去重/顺序/identity，MessageNode 的 canonical node，ToolCall 的 Map-first effective state              | 卡片数量与稳定 key；内容/status 从 canonical node 观察；工具 loading 从 effective state 观察 | `messagesConverter()` 不承载 node content/terminal status，不能把缺失的顶层字段误判为 UI 内容丢失 |
| 同步生命周期               | `beginTopicSync()`、`isTopicSyncCurrent()`、`completeTopicSync()`、`cancelTopicSync()`                                            | generation、topic 隔离；generation 只控制 completion/cancel/lifecycle 副作用                 | 不应把 generation guard 当成 `initializeMessages` 的版本裁决                                      |
| 恢复调度                   | `registerOnStreamRecoveryRequested()`、`getStreamState()`、`isTopicStreaming()`                                                   | watchdog 去重、bounded monotonic backoff、有效 chunk 重置和有界 terminal                     | 不锁死 5.1/10.1 秒；失败态必须通过公开 state/event 观察                                           |
| Buffer / listener          | `enqueueMessage()` 后的列表、节点和公开 listener                                                                                  | 消息最终消费、顺序、exactly-once 副作用                                                      | canonical tool 状态已可用，不代表 raw tool 消息已穿过 buffer                                      |

每一项被判断为“测试用例问题”时，至少同时检查：

1. `store.messages` 中是否只有预期逻辑消息，顺序和 app/correlation/role/topic/seq 是否合理。
2. `getMessageNode()` 的语义字段是否一致，是否存在旧 content、旧 status、错误 alias 或错误 role 合并。
3. 工具状态是否读取了 `toolResponseMap` 和 UI effective state，而不是只读 assistant embedded 快照。
4. `messagesConverter()` 后是否只有预期卡片、identity/key 是否稳定；内容/status 必须结合 canonical node，工具 loading 必须结合 Map-first effective state，不能要求这些字段出现在消息列表顶层。
5. 重复、乱序、晚到和跨传输更新是否满足已确认的 seq/identity 单调性。
6. fixture 是否明确区分字段缺失、`null`、空值和空数组。

“Store 数据标准化合理”应比较定义过的语义字段，不使用 `toBe()` 对象引用相等，也不对未定义的全部字段做无差别深比较。HTTP-D5 已确认 Map/effective 是工具状态契约，assistant embedded 可以滞后，不要求回写。

#### 当前 7 个失败的归因

当前 7 项均为保留的 Store RED；本轮没有为了全绿而弱化业务断言。其余 18 项已经按公开观察层校准：D5 使用 Map/effective 状态，D7/D9 使用 higher-seq-wins，D10 同时验证时间窗口与公开 `recoveryAttempts` reset，D11/D4 只要求停止公开 streaming/loading，不再要求 StreamState 对象必须删除。

|   # | 用例 / 失败行                                                             | 实际结果 → 当前期望                                                        | 当前主归因     | 黑盒依据                                                                                                                                       | 决策     |
| --: | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
|   1 | L292，失败 L301：已有 HTTP sync 时 watchdog 必须复用该请求                | recovery event `1` → `0`；current generation 仍有效                        | Store 业务问题 | 同一 topic 已有公开 current generation，watchdog 仍发出 recovery；HTTP-D1 明确要求抑制/合并                                                    | HTTP-D1  |
|   2 | L306，失败 L326：recovery 已进入 current sync 后必须合并新 watchdog       | 同 correlation recovery event `2` → `1`                                    | Store 业务问题 | 首次 recovery 后已开始 current sync，再发送有效 chunk 明确重新挂起 watchdog；第二个 event 证明原绿测确为假阳性                                 | HTTP-D1  |
|   3 | L437，失败 L471/L483/L492：authoritative snapshot 应替换 topic 视图       | 旧 node 仍可读，`store.messages` 与 UI 均为 `3` 条 → 应为 `2` 条           | Store 业务问题 | 聚合快照只提交一次；断言不要求 Store 排序，只验证快照外旧 node/list/UI 卡片全部移除，高 seq 同逻辑消息保留                                     | HTTP-D2  |
|   4 | L598，失败 L621/L622/L629/L637：同 app、不同 correlation 必须整体拒绝     | 新 correlation 覆盖 list/UI，latest seq `200` → 应保持旧 correlation/`100` | Store 业务问题 | 基线和冲突输入都走 HTTP canonical 路径；canonical node、消息列表、UI identity 与 watermark 四层同时证明冲突记录被错误接纳                      | HTTP-D3  |
|   5 | L721，失败 L746/L747/L750/L754：nonterminal snapshot 应合并本地 tool slot | 仅剩 `http-tool`，`local-tool`/arguments 丢失，StreamState 也被结束        | Store 业务问题 | fixture 明确 `nodeStatus="running"`；按 HTTP-D6 应按 `tool.id` 保留两个 slot，并保留 nonterminal streaming 生命周期                            | HTTP-D6  |
|   6 | L883，失败 L909/L913：连续 recovery 失败必须进入公开终态                  | `isTopicStreaming()` 仍为 `true`，额外观察窗 event 从 `24` 增至 `25`       | Store 业务问题 | 已移除“StreamState 必须删除”的过严 oracle；仅凭公开 loading 与 recovery 调度仍无法终止，直接违反 HTTP-D11                                      | HTTP-D11 |
|   7 | L917，失败 L930：task finished + HTTP failure 应停止 stream/loading       | `isTopicStreaming()` 仍为 `true` → 应为 `false`                            | Store 业务问题 | 已移除“StreamState 必须删除”的过严 oracle；同一用例中 draft canonical/UI 保留及独立 retry 均通过，剩余缺口仅是 finished barrier 未停止 loading | HTTP-D4  |

#### 25 个用例逐条准确性审计

|   # | 起始行 | 用例简写                                              | 当前结果 | 准确性结论                          | 后续动作                                                                                                     |
| --: | -----: | ----------------------------------------------------- | -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
|   1 |    292 | 已有 sync 时 watchdog 抑制 recovery                   | 失败     | Store RED；HTTP-D1                  | 保留；已有 current generation 时不得产生新 recovery event。                                                  |
|   2 |    306 | recovery 开始同步后合并后续 watchdog                  | 失败     | Store RED；原假绿已修正             | 首次 recovery 后发送同 correlation 有效 chunk 重新挂起 watchdog，第二个 event 证明 current sync 未被复用。   |
|   3 |    333 | 旧恢复低 seq 进入初始化仍不得回退                     | 通过     | 合格；HTTP-D7/D9                    | 旧 payload 真实进入 `initializeMessages()`，node/list/latest seq 均保持高版本，旧 completion 被拒绝。        |
|   4 |    375 | outer topic 路由、inner Agent topic 映射              | 通过     | 合格；HTTP-D8                       | 外层写入 TOPIC_B，内层 node 保留 Agent topic，不要求两个 ID 相等。                                           |
|   5 |    406 | HTTP 未包含目标 correlation                           | 通过     | 核心合格；耗尽形态待决              | 未命中的 draft 保留并重新触发 recovery；非 task-finished 的最终 draft/failure 形态仍由 D11 子协议决定。      |
|   6 |    437 | 分页聚合后一次 authoritative replace                  | 失败     | Store RED；HTTP-D2                  | 输入已按调用边界顺序聚合，断言不测试排序；旧 node、列表记录和 UI 卡片均应移除，高 seq 同逻辑消息按 D7 保留。 |
|   7 |    496 | 低 seq HTTP 不回退高 seq IM                           | 通过     | 合格；已修正观察层                  | content 从 canonical node 验证；列表/UI 只验证 identity、seq、卡片数量，不要求顶层 content。                 |
|   8 |    527 | HTTP 比本地 StreamState 新                            | 通过     | 合格                                | fixture 的 app id 为 `assistant-sync`；node、列表、UI identity、latest seq 和生命周期一致。                  |
|   9 |    546 | HTTP 与 final chunk 并发                              | 通过     | 合格；覆盖可加强                    | HTTP canonical 保持，旧 final tail 不覆盖，StreamState 被清理；未来可补 bounded no-recovery。                |
|  10 |    568 | tool response 并发时 Map/effective 优先               | 通过     | 原测试观察层问题已修正              | 只以 `tool.id` 查询 Map/effective；允许 embedded `running` 滞后，不使用 `tool_call_id` 关联。                |
|  11 |    598 | 同 app、不同 correlation 整体拒绝                     | 失败     | Store RED；HTTP-D3                  | canonical、`store.messages`、UI identity 与 latest seq 同时验证整条拒绝。                                    |
|  12 |    640 | 同 correlation 不同 role 隔离                         | 通过     | 合格；Assistant-only alias 已确认   | Tool/User 按自身 appMessageId 独立保留；裸 correlation alias 仅属于 Assistant，不得跨 role 覆盖。            |
|  13 |    671 | HTTP assistant 不覆盖 tool.id canonical response      | 通过     | 原测试观察层问题已修正              | Map/effective 断言优先；HTTP-D5 不要求 embedded 回写。                                                       |
|  14 |    699 | terminal snapshot 完整替换本地工具                    | 通过     | 合格；HTTP-D6 terminal 分支         | 有效 local tool 被完整 canonical 数组替换，StreamState 结束。                                                |
|  15 |    721 | nonterminal snapshot 合并本地工具                     | 失败     | Store RED；HTTP-D6 nonterminal 分支 | 同时验证两个 `tool.id`、各自 arguments 与继续 streaming；本地 slot 被删除且生命周期被错误结束。              |
|  16 |    757 | 权威快照后公开流式生命周期结束                        | 通过     | 合格                                | 只观察公开 lifecycle，不依赖内部 Map/Set。                                                                   |
|  17 |    776 | 过期 generation payload 仍做版本裁决                  | 通过     | 合格；HTTP-D7/D9                    | stale payload 进入初始化但未回退 canonical/list/latest seq；旧 generation completion 被拒绝。                |
|  18 |    811 | syncState 可离开 syncing                              | 通过     | 基础合格；覆盖可加强                | current generation complete 后失效，下一代支持 cancel；旧 generation cancel 与重复 complete 可另补覆盖。     |
|  19 |    831 | recovery backoff 有界且单调                           | 通过     | 已修正测试 oracle                   | 只断正延迟、单调性和测试观察上界，不锁死 5.1s/10.1s；正式 SLA 仍待决。                                       |
|  20 |    860 | 新有效 chunk 重置 backoff                             | 通过     | 合格；原假绿风险已消除              | 除首轮观察窗外，直接验证公开 `recoveryAttempts` 从大于 0 重置为 0。                                          |
|  21 |    883 | recovery 耗尽进入可观察终态                           | 失败     | Store RED；HTTP-D11                 | 不再要求删除 StreamState；仅断 `isTopicStreaming=false` 与终态后 event 不增长，当前两项均失败。              |
|  22 |    917 | task finished + HTTP failure 停止 loading、保留 draft | 失败     | Store RED；HTTP-D4                  | 只在 `isTopicStreaming=false` 失败；draft canonical/UI 保留和独立 retry 均通过。                             |
|  23 |    948 | canonical message 完成即结束自身 stream               | 通过     | 合格；HTTP-D13                      | task running 不得重开该消息；额外两个 recovery 观察窗口内无 event。                                          |
|  24 |    977 | task finished、本地 buffer 最终消费                   | 通过     | 合格；UI 覆盖可加强                 | 两条 canonical node、列表顺序/identity 与 topic loading 一致。                                               |
|  25 |   1025 | 已完成消息接受更高 seq revision                       | 通过     | 合格；HTTP-D7                       | higher-seq authoritative revision 更新 canonical；UI 仍为单卡，latest seq 前进。                             |

18 个用例通过、7 个保留 Store RED。通过不代表所有协议分支都已定义；未锁定的字段存在性、同 tool id 合并优先级和失败信号结构列在后文。alias 归属已确认：裸 correlation alias 仅属于 Assistant 逻辑消息域。

#### Fixture 与覆盖边界

- 同一个 `app_message_id` 对应不同 `correlation_id` 的冲突由 HTTP-D3 定义为非法输入；测试使用公开列表、node alias 和 watermark 验证整条拒绝。
- 本文件 `createEnvelope()` 默认 assistant `nodeStatus="finished"`；nonterminal D6 用例显式使用 `running`，因此“消息完整”和“节点 status 终态”不会被 fixture 默认值混淆。
- tool response fixture 显式让 `tool_call_id` 与 `tool.id` 冲突；HTTP-D12 要求只按 `tool.id` 建立 canonical Map，不创建 legacy key 孤儿项。
- D11 的公开失败 oracle 暂定为：有界观察窗口内 `isTopicStreaming()` 为 false，且终态后额外窗口不再产生 recovery event。StreamState 可以被删除，也可以保留为明确 terminal/error 状态；draft 保留和错误 payload 仍是未决子协议。D4 单独锁定 task finished 时保留 draft。
- 本文件 fixture helper 与其他 Store 套件重复较多；helper 的当前实现不是协议证据，后续抽取复用时必须保持每次返回新对象。

#### D1～D13 之外的子协议状态

| 子协议         | 待决问题                                                                           | 可选方向                                                                   | 当前推荐                                              | 当前测试处理                                                 |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| D2-empty       | authoritative snapshot 为空时，是清空 topic，还是把空响应视为 no-op？              | A. 清空；B. no-op；C. 按请求是否完整区分                                   | A：空快照仍是权威快照，避免旧消息永久残留             | 未写断言，避免替协议决定                                     |
| D2-order       | 多页聚合后的列表顺序由谁保证？                                                     | A. 调用方按服务端顺序聚合，Store 保序；B. Store 按 seq 排序；C. 不保证顺序 | A：边界职责清晰，避免初始化入口暗含第二套排序规则     | fixture 使用稳定输入；断言只看成员与数量，不测 Store 排序    |
| D6-presence    | terminal `tool_calls` 缺失、`null`、`[]` 是否有不同语义？                          | A. 缺失保留、`null/[]` 清空；B. 三者都清空；C. 三者都保留                  | A：区分未提供字段与显式空值，最能表达部分协议         | 当前只覆盖非空 terminal replacement 与 running merge         |
| D6-content     | terminal `content` 缺失、`null`、空字符串是否有不同语义？                          | A. 缺失保留、`null/""` 清空；B. 三者都清空；C. 三者都保留                  | A：保持 absent 与显式清空的语义差异                   | 未写断言；helper 当前默认总会提供 content                    |
| D6-collision   | nonterminal snapshot 与本地 slot 有相同 `tool.id` 时，字段如何合并？               | A. HTTP 字段覆盖；B. 本地字段覆盖；C. 按 seq/字段逐项合并；D. 冲突拒绝     | C：按字段和 seq 合并，避免丢失已到达 arguments/detail | 当前只用不同 `tool.id`，未预设冲突优先级                     |
| D7-equal       | 同一逻辑消息 seq 相等但 payload 不同怎么办？                                       | A. 首个胜出；B. 最后来源胜出；C. 标记冲突并拒绝                            | C：不伪造高低版本关系，并保留可观察冲突信号           | 当前只断言严格 higher-seq-wins                               |
| D8-role-alias  | assistant/tool/user 共用 correlation 时，裸 `getMessageNode(correlationId)` 归谁？ | **已确认：Assistant**；Tool/User 仅按自身 appMessageId 独立查询            | Assistant-only alias；禁止跨 role 回退                | 已补 Tool/User 隔离与 missing-target structured warning 覆盖 |
| D10-effective  | heartbeat、metadata-only、usage-only chunk 是否算“有效 chunk”并重置 backoff？      | A. 全部算有效；B. 只有内容/工具/推理算有效；C. 按协议字段白名单            | B：避免心跳掩盖真实数据停滞                           | 当前只用 content chunk，未锁定其它类型                       |
| D10-sla        | initial/retry backoff 是否需要正式最大时间 SLA？                                   | A. 分阶段固定上限；B. 只定义总恢复预算；C. 不定义，只保留测试安全窗        | B：对用户等待时间可衡量，同时允许实现调整退避曲线     | 当前 8s/20s 只是 fake-timer 观察窗，不是产品常量             |
| D11-budget     | recovery 的正式最大 attempts/总时长如何定义？                                      | A. 固定 attempts；B. 固定总时长；C. 两者任一先到；D. 完全实现自定          | C：同时防止高频重试和低频无限等待                     | 当前 32 窗口只是防挂死安全上界                               |
| D11-failure    | retry 耗尽后是否必须有 `status="error"`、error reason 或独立 failure event？       | A. lifecycle 终止即可；B. error status；C. failure event/payload；D. B+C   | D：UI 和调用方都能稳定区分“完成”和“恢复失败”          | 当前只要求公开 lifecycle 终止，未断言错误结构                |
| D11-draft      | 非 task-finished 的 recovery 耗尽是否必须保留 draft 到 node/list/UI？              | A. 必须保留；B. 允许清除；C. 由 failure payload 决定                       | A：失败恢复不应丢失用户已看到的内容                   | 当前由 D4 覆盖 task finished 场景，D11 泛化场景未断言        |
| D12-missing-id | tool response 缺少 `tool.id` 时如何处理？                                          | A. 忽略 canonical 关联；B. 以 `tool_call_id` 兜底；C. 生成临时 id          | A：保持 `tool.id` 唯一主键，不引入猜测关联            | 相邻 tool-response 套件覆盖；本 HTTP 文件不重复定义          |

#### 已确认的 HTTP 契约（HTTP-D1～HTTP-D13）

| ID       | 已确认契约                                                                                                                                                                                               | 影响用例        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| HTTP-D1  | topic 已有 current sync 时，watchdog 抑制/合并到现有请求，不发重复 recovery 或新 generation。                                                                                                            | 1、2            |
| HTTP-D2  | HTTP 是当前 topic 的 authoritative snapshot replacement；多页先聚合，再只调用一次 `initializeMessages()`。                                                                                               | 6、8、24        |
| HTTP-D3  | 同一 `app_message_id` 对应不同 `correlation_id` 是非法 identity 冲突；整条拒绝，不建新 alias/revision。                                                                                                  | 11              |
| HTTP-D4  | `taskStatus="finished"` 是独立 terminal barrier；即使 HTTP 失败也停止原 stream/loading，保留 draft，retry 走独立生命周期。                                                                               | 22              |
| HTTP-D5  | `toolResponseMap` 是工具执行态 canonical；UI Map-first、assistant embedded fallback，embedded 可滞后且不要求回写；只有未来协议明确要求回写时，才另立 normalization 断言。                                | 10、13          |
| HTTP-D6  | terminal/final snapshot 的 `tool_calls` 完整替换；nonterminal snapshot 只能合并，不删除未出现在快照中的有效流式 slot。                                                                                   | 14、15          |
| HTTP-D7  | HTTP、IM、chunk 无来源优先级；同一逻辑 identity 统一 higher-seq-wins，低 seq 不得回退 canonical。                                                                                                        | 3、7、17、25    |
| HTTP-D8  | outer topic 是 transport scope，inner node topic 是 Agent 业务域；验证映射关系，不要求字面相等。                                                                                                         | 4、12           |
| HTTP-D9  | `initializeMessages()` 自己负责版本裁决；stale HTTP 仍进入该方法但不能回退 canonical/messages/latest seq；generation 只管 complete/cancel/lifecycle。                                                    | 3、17           |
| HTTP-D10 | recovery backoff 只承诺有界、单调递增；新有效 chunk 重置到首轮区间，不锁死 5s/10s。                                                                                                                      | 1、2、5、19、20 |
| HTTP-D11 | recovery 重试必须有边界；耗尽/停止调度后必须有公开可观察 terminal/failure 表现，不能永久重试/loading。测试使用安全观察窗口，不锁定产品 retry 次数；目标是“停止 stream/loading + 终态后 event 不再增长”。 | 5、21、22       |
| HTTP-D12 | `tool.id` 是唯一 canonical 关联键；`tool_call_id` 忽略，不建立 legacy 孤儿项。                                                                                                                           | 10、13、14      |
| HTTP-D13 | canonical message 完成即结束自己的 stream；topic/task 仍 running 不得覆盖或重开已完成卡片。                                                                                                              | 8、9、16、23    |

#### 测试更新门禁与维护约定

- HTTP-D1～HTTP-D13 已锁定；先修正 fixture/oracle，再保留能准确暴露业务缺口的 RED，不以全绿为目标。
- 后续调整每个“测试用例问题”时，必须同时添加或确认 `store.messages`、canonical node、tool canonical/effective、`messagesConverter()` 和 lifecycle 中与该场景相关的断言。
- 新增、删除、重命名或调整本文件用例时，必须同步更新本节的场景清单、验证命令、通过/失败数量、失败归因和决策状态。
- 调整测试后至少连续运行目标文件两次，并补跑 `final-assistant-message.test.ts`、`tool-response-execution-state.test.ts`、`message-list-ui-projection.test.ts` 和 `message-buffer.test.ts`，防止跨观察层契约再次漂移。
- 历史 `23/17/6`、`25/16/9` 与初次校准后的 `25/19/6` 基线保留用于对照；补强 watchdog/reset 与修正 D11/D4 oracle 后，当前冻结基线为 `25/18/7`，7 项 RED 只有在对应契约实现后才应转绿。
- HTTP-D11 测试使用 `RETRY_TERMINAL_MAX_WINDOWS` 作为防挂死的本地安全上界，不是产品 retry 次数。若未来需要固定最大尝试次数或公开 failure payload，必须新增明确契约并替换该安全观察策略。

### 2026-07-23 分享路由缺失 Tool response 结算

分享路由通过 `superMagicStore.loadSharedMessages()` 加载历史消息，不经过普通 Topic 的 `enqueueMessage()`、buffer 和 StreamState。生产流水 `mock_v3.json` 中，`list_dir` 工具 `call_00_ubXA326klb3xa4Tb6f8F5818` 只有 Assistant 内嵌的 `running` 状态，没有对应 role=`tool` 响应；但后续不同 correlation 的 Assistant 已经展示目录结果，因此满足“下一 Assistant”完成屏障。

本轮锁定以下分享契约：

1. 分享消息顶层 `topic_id` 缺失时，Store 与 UI 投影统一回退到 `raw_content.super_magic_message.topic_id`。
2. 同 topic、不同 correlation 的后续 Assistant 到达时，上一 Assistant 中仍无真实响应的普通工具进入 canonical `response_missing`。
3. `ask_user` 不生成缺失响应占位。
4. 同 correlation revision 的 `tool_calls` absent 保留当前待结算工具；显式 `null` 或 `[]` 清空。
5. 分享播放重复加载旧前缀时，旧 Assistant 不得反向成为最新 Assistant 的完成屏障。
6. 迟到的真实 role=`tool` 响应继续通过 `recordToolResponse()` 覆盖 `response_missing`。
7. UI 继续保持 `toolResponseMap` 优先、Assistant embedded tool 兜底，不增加展示层 loading 特判。

新增回归覆盖：

| 场景                                    | 观察层                         | 期望                                                             |
| --------------------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| raw topic 存在、顶层 topic 缺失         | Share message projection       | `topic_id` 投影为 raw topic，和 canonical Map 使用同一个 key     |
| Tool response 丢失、下一 Assistant 到达 | Store canonical / UI effective | 对应工具变为 `response_missing`，embedded `running` 可保留       |
| 真实 Tool response 迟到                 | Store canonical                | `response_missing` 升级为真实 `finished` 及其 detail/attachments |
| 播放器从头重复回放旧 Assistant          | Share replay lifecycle         | 最新 Assistant 的未完成工具不得被旧消息误结算                    |

验证结果：

- `tool-response-execution-state.test.ts` 与分享 `utils.test.ts`：`55/55` 通过。
- 本地分享地址复验：目标“查看目录”卡片存在，目录结果存在，`.animate-spin` 从修复前的 `1` 变为 `0`。
- 目标 TypeScript ESLint：`0 errors`；现有文件保留 `13 warnings`，均不位于本轮新增逻辑。
- 全量 `pnpm lint` 仍受仓库基线影响失败：`9038 problems / 4541 errors / 4497 warnings`；首批错误位于 Agent、MCP、通用 utils 等非本轮文件，不能归因于分享修复。
- 目标文件 `git diff --check` 通过。

## MessageList 和 UI 投影

- MessageList 渲染缺少 id 的匿名工具。
- 多个匿名工具使用相同的 `key={undefined}`。
- 临时 id 与真实 id 切换导致 React 组件错误复用。
- tool_calls 包含稀疏数组空洞。
- tool_calls 同时存在匿名工具和合法工具。
- 合法工具已 finished，但匿名工具仍显示 spinner。
- toolResponseMap 已 finished，但 toolCall 内嵌状态仍显示 running。
- tool response 按错误 topicId 查询不到。
- MessageList 读取 correlation alias，但 node 只存于真实 appMessageId。
- MessageList 读取真实 appMessageId，但 node 只存于 correlationId。
- `isTopicStreaming()` 因残留 StreamState 永远为 true。
- `showLoading && !isStreamLoading` 条件导致全局 LoadingMessage 被隐藏。
- 工具 spinner 和全局 LoadingMessage 状态相互矛盾。
- tool-role message 因 status 非终态被隐藏。
- tool-role message 已 finished，但外层消息 status 仍 running。
- 工具执行失败但 UI 没有 error 状态。
- 工具名称为空，UI 渲染默认工具图标。
- 工具 action/remark 缺失，只剩 spinner。
- invalid tool 被 UI 过滤后，store 仍然持续 timer。
- UI 渲染正确，但后台 buffer/content Map 泄漏。
- 两张 assistant 卡片使用相同 correlation。
- 消息排序变化导致 React 卡片重新挂载。
- 流式过程中 tool_calls 数组被 slice，后续工具短暂消失。
- UI 从两条工具回退到一条工具时组件状态错位。
- 大型 arguments 导致 MobX observer 高频刷新。
- 自动滚动在永久 streaming 状态下持续触发。
- 用户手动滚动后，幽灵 timer 持续尝试自动滚动。

## 持久化和回放

- chunk 已实时消费，又从 IndexedDB 回放一次。
- IndexedDB 中消息顺序不按 `i`。
- IndexedDB 记录按字符串 key 排序导致时间顺序异常。
- 使用 `performance.now()` 作为 key 时发生碰撞。
- 页面刷新时只恢复 arguments chunk，没有恢复工具头。
- 页面刷新时只恢复 final，没有恢复前序 chunk。
- 页面刷新时恢复旧 StreamState，又收到实时 final。
- 本地持久化数据来自旧协议版本。
- 持久化数据中的 tool 字段类型与当前类型不一致。
- 序列化时丢失 `undefined` 字段，匿名槽位形态发生变化。
- 大型 HTML arguments 重复持久化造成存储膨胀。
- IndexedDB 写入失败，但实时状态继续运行。
- IndexedDB 数据部分写入，形成不完整回放。
- clear/reset 只清理 messages，没有清理 topicMeta。
- clear/reset 只清理 messageMap，没有清理 buffer。
- 多次执行调试 replay，共用同一个单例 Store。
- 测试回放没有在开始前清理 finalizedCorrelationIds。
- 测试 helper 发布了错误的 PubSub 事件名。
- 测试 helper 修改了原始 mock 对象，第二次运行数据已被污染。
- 单测使用 `vi.runAllTimers()`，遇到无限 timer 时测试自身卡死。
- 大型生产 fixture 作为单测输入，导致测试慢且难以定位失败。

## 资源和性能

- 重复 chunk 导致 arguments 内存成倍增长。
- 超大 HTML arguments 在 StreamState 和 messageMap 各保留一份。
- final snapshot 再复制一份完整 arguments。
- MobX 对每个字符片段产生观察更新。
- 16ms timer 在无进展状态下永久运行。
- 多个 topic 各自残留 timer/recovery timer。
- buffer 长期积压大量完整消息对象。
- streamSnapshots 长期不清理。
- finalizedCorrelationIds 无界增长。
- toolResponseMap 无界增长。
- messageMap 无界增长。
- 调试日志序列化完整 buffer 或大 arguments。
- 持久化对每个小 chunk 执行 JSON 序列化。
- 重复 chunk 导致 IndexedDB 写入量翻倍。
- 页面后台时积压大量 timer 和 MobX action，切回瞬间卡顿。
- 多个大型工具并行流式导致主线程长任务。
- 最终快速覆盖时一次性渲染超大参数导致 UI 卡顿。

- 工具调用没有响应，下一条消息到来后，工具直接永久 loading
