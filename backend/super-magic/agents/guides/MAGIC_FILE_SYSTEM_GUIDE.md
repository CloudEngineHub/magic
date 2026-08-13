# Magic 文件系统与目录边界指南

本文说明 Super Magic 运行时几个重要目录的职责、持久性和 checkpoint 边界。新增文件前先判断它属于哪一类数据，再选择目录；不要仅因为某个目录「看起来方便」就写入。

## 四条基本规则

```text
.chat_history/  = 话题的持久状态，需要 checkpoint 和归档
.runtime/       = 可重新生成的运行数据，不需要 checkpoint，不进入归档
.workspace/     = 用户文件，由现有文件 checkpoint 机制单独处理
.checkpoints/   = checkpoint 自身，不能复制进自己
```

这四个目录不是同一层级的不同叫法，而是四种不同的数据责任：

- `.chat_history/` 保存 Agent 继续理解和恢复一个话题所需的持久数据。
- `.runtime/` 保存进程运行期间的临时文件、调试日志和可重新计算结果。
- `.workspace/` 保存用户需要长期保留、下载或继续编辑的文件。
- `.checkpoints/` 保存文件 checkpoint 和聊天记录快照本身。

## 目标目录结构

```text
project_root/
├── .chat_history/                         话题持久状态
│   ├── magic<main>.json                   主 Agent 聊天记录
│   ├── magic<main>.session.json           主 Agent 会话配置和运行状态
│   ├── magic<main>.horizon.json           主 Agent Horizon 持久状态
│   ├── magic<main>.token_usage.json       主 Agent token 使用记录
│   ├── magic<main>.tools.json             主 Agent 能力盘点输入
│   ├── compacted/                         压缩前历史
│   │   ├── magic<main>_20260809102030.json
│   │   └── magic<main>_20260809164500.json
│   └── subagents/                          子 Agent 持久状态
│       ├── magic<research-01>/
│       │   ├── magic<research-01>.json
│       │   ├── magic<research-01>.session.json
│       │   ├── magic<research-01>.horizon.json
│       │   └── magic<research-01>.token_usage.json
│       └── explore<check-02>/
│           ├── explore<check-02>.json
│           ├── explore<check-02>.session.json
│           ├── explore<check-02>.horizon.json
│           └── explore<check-02>.token_usage.json
│
├── .runtime/                              可重新生成的运行数据
│   ├── background_compact/                后台压缩临时上下文
│   ├── llm_request/                       LLM 调试日志
│   ├── bg_shell/                          后台 shell 日志
│   └── mcp_outputs/                       MCP 自动保存的大结果
│
├── .workspace/                            用户文件
│   ├── .magic/                            工作区级 Agent、Skill、cron 配置
│   └── ...                                 用户创建或需要保留的文件
│
└── .checkpoints/                          checkpoint 自身
    ├── checkpoint_manifest.json
    └── <checkpoint-id>/
        ├── file_snapshots/                用户文件快照
        ├── initial_chat_history_snapshots/
        │   └── .chat_history/ 的完整内容
        ├── latest_chat_history_snapshots/
        │   └── .chat_history/ 的完整内容
        └── checkpoint_info.json
```

## checkpoint 边界

checkpoint 由主 Agent 创建和管理，但聊天记录快照代表整个话题的持久状态，不只代表主 Agent 的三个文件。

因此聊天记录快照包括：

- 主 Agent 的 history、session、Horizon、token usage 和其它话题辅助 JSON。
- `compacted/` 中的压缩前历史。
- `subagents/` 中主 Agent 产生的子 Agent 目录，包括子 Agent 自身的 history、session、Horizon、token usage 和其目录内的持久历史。

聊天记录快照不包括：

- `.runtime/` 下的临时上下文、LLM 调试日志、后台 shell 日志和 MCP 大结果。
- `.workspace/` 下的用户文件；这些文件由 `file_snapshots/` 的现有机制负责。
- `.checkpoints/` 本身；checkpoint 不能把自己再次复制进聊天记录快照。

回滚 `.chat_history/` 时，目标目录必须与目标 checkpoint 的目录状态一致：目标 checkpoint 之后创建的压缩前历史和子 Agent 文件会被删除，目标 checkpoint 中存在的内容会被恢复。

## 文件放置判断

| 问题 | 放置位置 |
|---|---|
| Agent 之后还需要从中恢复话题或查找历史吗？ | `.chat_history/` |
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
- 需要修改 checkpoint 边界时，必须同步更新 `ChatHistorySnapshotManager` 的模块注释、本文和相关方案。
- 不要为聊天记录新增 `manifest`、`bundle`、`segment`、`transcript` 等项目未采用的抽象；使用现有目录、文件名和 `.session.json`。
