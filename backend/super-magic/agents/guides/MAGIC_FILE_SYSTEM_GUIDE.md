# Magic 文件系统与目录边界指南

本文说明 Super Magic 运行时几个重要目录的职责、持久性和 checkpoint 边界。新增文件前先判断它属于哪一类数据，再选择目录；不要仅因为某个目录「看起来方便」就写入。

## 四条基本规则

```text
.topic/chat_history/  = 话题的持久状态，需要 checkpoint 和归档
.runtime/       = 可重新生成的运行数据，不需要 checkpoint，不进入归档
.workspace/     = 用户文件，由现有文件 checkpoint 机制单独处理
.checkpoints/   = checkpoint 自身，不能复制进自己
```

这四个目录不是同一层级的不同叫法，而是四种不同的数据责任：

- `.topic/chat_history/` 保存 Agent 继续理解和恢复一个话题所需的持久数据。
- `.runtime/` 保存进程运行期间的临时文件、调试日志和可重新计算结果。
- `.workspace/` 保存用户需要长期保留、下载或继续编辑的文件。
- `.checkpoints/` 保存文件 checkpoint 和聊天记录快照本身。

## 目标目录结构

```text
project_root/
├── .topic/                                 话题持久卷
│   ├── chat_history/                       话题持久状态
│   │   ├── magic<main>.json                主 Agent 聊天记录
│   │   ├── magic<main>.session.json        主 Agent 会话配置和运行状态
│   │   ├── magic<main>.horizon.json        主 Agent Horizon 持久状态
│   │   ├── magic<main>.token_usage.json    主 Agent token 使用记录
│   │   ├── magic<main>.tools.json          主 Agent 能力盘点输入
│   │   ├── compacted/                      压缩前历史
│   │   └── subagents/                      子 Agent 持久状态
├── .runtime/                              可重新生成的运行数据
│   ├── background_compact/                后台压缩临时上下文
│   ├── llm_request/                       LLM 调试日志
│   ├── bg_shell/                          后台 shell 日志
│   └── mcp_outputs/                       MCP 自动保存的大结果
│
└── .workspace/                            用户文件
    ├── .magic/                            工作区级 Agent、Skill、cron 配置
    └── ...                                 用户创建或需要保留的文件
```

## checkpoint 边界

`.topic/` 由基础设施在容器启动阶段通过 agfs-fuse 挂载为当前 topic 的持久卷。应用层不重复判断操作系统挂载点，只检查 `.topic/chat_history/` 是否可用；聊天历史状态未确认或恢复失败时继续使用 zip 下载/上传兜底。

checkpoint 数据保存在 `.checkpoints/`，由 magicfs 的 checkpoint hook 统一维护，并按空间分区落盘：

```text
.checkpoints/checkpoint_manifest.json          共享清单（Python 写、magicfs 读）
.checkpoints/<checkpoint_id>/checkpoint_info.json      Python 簿记（id/created_time，只写一次）
.checkpoints/<checkpoint_id>/project/operations.json   project 操作流水 + file_snapshots/
.checkpoints/<checkpoint_id>/topic/operations.json     topic（聊天历史）流水 + file_snapshots/
```

- `checkpoint_info.json` 是 Python 私有的簿记文件；`operations.json` 与内容帧由 magicfs 写入各自空间分区，Python 只读。两个名字不再混用。
- topic 挂载的 hook 同样开启（`exclude_prefixes` 可选排除非历史子树），`.topic/chat_history/` 的变更自动入账。Python 侧不自行复制任何持久目录。
- 流水条目带两个协议字段：`file_path` 是 agent 可见绝对路径，恢复目标即路径本身；`space` 标记来源空间，用于按空间施加策略。

checkpoint 由主 Agent 创建：每个用户回合开始前登记新 checkpoint 并写入簿记，此后 magicfs 自动对挂载内的变更入账。会话期间的消息追加不触发任何 Python 侧快照复制。

回滚时 `RollbackExecutor` 读聚合后的流水：工作区回放非 topic 条目，聊天历史回放 `space=topic` 条目，共用同一套 operation 感知重放——反向（undo）用 initial 帧、正向（redo）用 latest 帧。文件版本创建只针对非 topic 条目。未被帧追踪的杂散文件保持现状；无分区的旧格式 checkpoint 视为空条目，降级跳过并告警，随 max_count 自然淘汰。

聊天历史帧包括：

- 主 Agent 的 history、session、Horizon、token usage 和其它话题辅助 JSON。
- `compacted/` 中的压缩前历史。
- `subagents/` 中主 Agent 产生的子 Agent 目录的全部持久状态。

聊天历史帧不包括：

- `.runtime/` 下的临时上下文、LLM 调试日志、后台 shell 日志和 MCP 大结果（不在 topic 挂载内）。
- `.topic/tool_detail/` 等非聊天历史子树，由 topic hook 的 `exclude_prefixes` 排除。
- `.workspace/` 下的用户文件走工作区帧；`.checkpoints/` 本身不在任何挂载内。

## 文件放置判断

| 问题 | 放置位置 |
|---|---|
| Agent 之后还需要从中恢复话题或查找历史吗？ | `.topic/chat_history/` |
| 进程结束后能否重新生成，或只是调试、临时、中间结果？ | `.runtime/` |
| 用户需要长期保留、下载或继续编辑吗？ | `.workspace/` |
| 它是 checkpoint 的索引、快照或文件操作记录吗？ | `.checkpoints/` |

如果一个文件同时满足多类描述，优先按它的持久责任放置，而不是按生成它的 Agent 放置。例如：

- 后台压缩 Agent 的临时 history 放 `.runtime/background_compact/`，不放 `.topic/chat_history/subagents/`。
- 压缩前的主 Agent 完整历史是用户话题的可检索证据，放 `.topic/chat_history/compacted/`，并随 checkpoint 恢复。
- LLM 请求调试日志放 `.runtime/llm_request/`，不进入聊天历史归档或 checkpoint。

## subagent 目录和父 Agent

`subagents/` 的目录只说明「这一组文件属于谁」：

```text
.topic/chat_history/subagents/
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
- 可重新生成的数据不得写入 `.topic/chat_history/` 或 `.workspace/`。
- 需要修改 checkpoint 边界时，必须同步更新本文、`RollbackExecutor` 的模块注释和相关方案；topic 挂载的 hook 排除范围由 sandbox-gateway 的 `AGFS_MAGICFS_CHECKPOINT_TOPIC_EXCLUDE_PREFIXES` 管理。
- 不要为聊天记录新增 `manifest`、`bundle`、`segment`、`transcript` 等项目未采用的抽象；使用现有目录、文件名和 `.session.json`。
