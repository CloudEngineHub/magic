# Magic 文件系统与目录边界指南

本文说明 Super Magic 运行时几个重要目录的职责、持久性和 checkpoint 边界。新增文件前先判断它属于哪一类数据，再选择目录；不要仅因为某个目录「看起来方便」就写入。

## 五条基本规则

```text
.chat_history/       = 运行期聊天记录持久状态（本地普通目录），需要随 checkpoint 备份
.topic/chat_history/ = 话题卷上的交接源：启动时从它恢复，运行结束后归档上传即清空
.runtime/       = 可重新生成的运行数据，不需要 checkpoint，不进入归档
.workspace/     = 用户文件，由现有文件 checkpoint 机制单独处理
.checkpoints/   = checkpoint 自身，不能复制进自己
```

这些目录不是同一层级的不同叫法，而是不同的数据责任：

- `.chat_history/` 保存 Agent 运行期继续理解和恢复一个话题所需的持久数据。它是本地普通目录，不在 magicfs 挂载内，magicfs 无法按文件记录内容帧，因此由 Python 侧整目录快照进 checkpoint。
- `.topic/chat_history/` 是话题卷上的交接副本：沙箱启动时从它恢复本地 `.chat_history/`；每次运行结束后本地目录被打包上传，随后清空话题卷副本。
- `.runtime/` 保存进程运行期间的临时文件、调试日志和可重新计算结果。
- `.workspace/` 保存用户需要长期保留、下载或继续编辑的文件。
- `.checkpoints/` 保存文件 checkpoint 和聊天记录快照本身。

## 目标目录结构

```text
project_root/
├── .chat_history/                          运行期聊天记录（本地普通目录）
│   ├── magic<main>.json                    主 Agent 聊天记录
│   ├── magic<main>.session.json            主 Agent 会话配置和运行状态
│   ├── magic<main>.horizon.json            主 Agent Horizon 持久状态
│   ├── magic<main>.token_usage.json        主 Agent token 使用记录
│   ├── magic<main>.tools.json              主 Agent 能力盘点输入
│   ├── compacted/                          压缩前历史
│   └── subagents/                          子 Agent 持久状态
├── .topic/                                 话题持久卷（agfs-fuse 挂载）
│   └── chat_history/                       启动交接源（见上文），结构与 .chat_history/ 相同
├── .runtime/                              可重新生成的运行数据
│   ├── background_compact/                后台压缩临时上下文
│   ├── llm_request/                       LLM 调试日志
│   ├── bg_shell/                          后台 shell 日志
│   ├── mcp_outputs/                       MCP 自动保存的大结果
│   └── slide-template-maker/              幻灯片模板作者过程的中间文件
│
└── .workspace/                            用户文件
    ├── .magic/                            工作区级 Agent、Skill、cron 配置
    └── ...                                 用户创建或需要保留的文件
```

## checkpoint 边界

`.topic/` 由基础设施在容器启动阶段通过 agfs-fuse 挂载为当前 topic 的持久卷。应用层不重复判断操作系统挂载点，只检查 `.topic/chat_history/` 是否可用；聊天历史状态未确认或恢复失败时继续使用 zip 下载/上传兜底。

checkpoint 数据保存在 `.checkpoints/`，挂载内文件由 magicfs 的 checkpoint hook 按空间分区记录内容帧，聊天历史由 Python 侧整目录快照补充：

```text
.checkpoints/checkpoint_manifest.json          共享清单（Python 写、magicfs 读）
.checkpoints/<checkpoint_id>/checkpoint_info.json      Python 簿记（id/created_time，只写一次）
.checkpoints/<checkpoint_id>/project/operations.json   project 操作流水 + file_snapshots/
.checkpoints/<checkpoint_id>/topic/operations.json     topic 挂载内文件的流水 + file_snapshots/
.checkpoints/<checkpoint_id>/initial_chat_history_snapshots/   checkpoint 创建时 .chat_history/ 整目录快照
.checkpoints/<checkpoint_id>/latest_chat_history_snapshots/    每次聊天记录保存后整目录快照
```

- `checkpoint_info.json` 与两个聊天历史快照目录是 Python 私有的；`operations.json` 与内容帧由 magicfs 写入各自空间分区，Python 只读。
- `.chat_history/` 不在 magicfs 挂载内，没有内容帧可记，因此由 Python 侧复制整目录：checkpoint 创建时拍 initial 快照（= 上一回合结束状态），每次聊天记录保存时刷新 latest 快照。
- 流水条目带两个协议字段：`file_path` 是 agent 可见绝对路径，恢复目标即路径本身；`space` 标记来源空间，用于按空间施加策略。

checkpoint 由主 Agent 创建：每个用户回合开始前登记新 checkpoint 并写入簿记，此后 magicfs 自动对挂载内的变更入账，监听器同步刷新聊天历史快照。

回滚时 `RollbackExecutor` 读聚合后的流水：工作区回放非 topic 条目，共用同一套 operation 感知重放——反向（undo）用 initial 帧、正向（redo）用 latest 帧。文件版本创建只针对非 topic 条目。未被帧追踪的杂散文件保持现状；某空间没有 operations.json 时视为该空间无条目。

聊天历史目录恢复与帧重放并行：反向取回滚范围内第一个 checkpoint 的 initial 快照（= target 执行后状态），正向取范围内最后一个 checkpoint 的 latest 快照（= target 最后一次保存后状态）。恢复是破坏性替换（先清空本地目录再拷回），尽力而为——快照缺失（旧版本沙箱创建的 checkpoint）或恢复失败只告警，不影响工作区回滚结果。

聊天历史快照包括：

- 主 Agent 的 history、session、Horizon、token usage 和其它话题辅助 JSON。
- `compacted/` 中的压缩前历史。
- `subagents/` 中主 Agent 产生的子 Agent 目录的全部持久状态。

聊天历史快照不包括：

- `llm_request/` 调试日志目录（历史遗留位置，快照与恢复时跳过；现位于 `.runtime/llm_request/`）。
- `.runtime/` 下的临时上下文、后台 shell 日志和 MCP 大结果（不在快照源目录内）。
- `.workspace/` 下的用户文件走工作区帧；`.checkpoints/` 本身不在任何挂载内，也不会复制进自己。

## 文件放置判断

| 问题 | 放置位置 |
|---|---|
| Agent 之后还需要从中恢复话题或查找历史吗？ | `.chat_history/`（运行期），随归档交接 |
| 进程结束后能否重新生成，或只是调试、临时、中间结果？ | `.runtime/` |
| 用户需要长期保留、下载或继续编辑吗？ | `.workspace/` |
| 它是 checkpoint 的索引、快照或文件操作记录吗？ | `.checkpoints/` |

如果一个文件同时满足多类描述，优先按它的持久责任放置，而不是按生成它的 Agent 放置。例如：

- 后台压缩 Agent 的临时 history 放 `.runtime/background_compact/`，不放 `.chat_history/subagents/`。
- 压缩前的主 Agent 完整历史是用户话题的可检索证据，放 `.chat_history/compacted/`，并随 checkpoint 恢复。
- LLM 请求调试日志放 `.runtime/llm_request/`，不进入聊天历史归档或 checkpoint。

## subagent 目录和父 Agent

`subagents/` 的目录只说明「这一组文件属于谁」：

```text
.chat_history/subagents/
├── magic<research-01>/
└── explore<check-02>/
```

父 Agent 不通过目录层级推断，而记录在对应 `.session.json` 的 `subagent` 区域：

```json
{
  "parent_agent_name": "magic",
  "parent_agent_id": "main"
}
```

如果未来开放一层 subagent 调用 subagent，仍然只记录直接父 Agent；不增加祖先链文件，也不依赖目录嵌套表达关系。

## 维护要求

- 新增目录 getter 前，先确认数据责任，避免复制已有职责。
- 异步运行时代码中的文件操作必须使用 `app/utils/async_file_utils.py`。
- 可重新生成的数据不得写入 `.chat_history/` 或 `.workspace/`。
- 需要修改 checkpoint 边界时，必须同步更新本文、`RollbackExecutor` 的模块注释和相关方案；topic 挂载的 hook 排除范围由 sandbox-gateway 的 `AGFS_MAGICFS_CHECKPOINT_TOPIC_EXCLUDE_PREFIXES` 管理。
- 不要为聊天记录新增 `manifest`、`bundle`、`segment`、`transcript` 等项目未采用的抽象；使用现有目录、文件名和 `.session.json`。
