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

checkpoint 数据保存在 `.checkpoints/`，由 magicfs 的 checkpoint hook 统一维护：project 挂载和 topic 挂载都开启 hook（topic 侧 `exclude_prefixes` 排除 `tool_detail/` 等非历史子树），所有挂载的文件变更记入同一份操作流水和 `file_snapshots/<file_id>/` 帧布局。Python 侧不自行复制任何持久目录。

流水条目的两个关键字段由网关挂载配置决定：

- `file_path` 是 agent 可见绝对路径（如 `/mnt/agfs/magicfs/project/a.txt`、`/mnt/agfs/magicfs/topic/chat_history/main.json`），网关为每个挂载下发对应的 `path_prefix`。恢复目标就是路径本身，消费方不需要猜测挂载根。
- `space` 标记来源空间（`project` / `topic`），用于按空间施加策略；空值是旧格式条目，视为工作区。

checkpoint 由主 Agent 创建：每个用户回合开始前把新的 checkpoint_id 写入 manifest，此后 magicfs 自动对挂载内的变更入账。会话期间的消息追加不再触发任何 Python 侧快照复制。

回滚时 `RollbackExecutor` 重放这些帧：工作区回放非 topic 条目，聊天历史回放 `space=topic` 条目，两者共用同一套 operation 感知恢复实现——反向（undo）用 initial 帧、正向（redo）用 latest 帧（created 反向删除、deleted 反向写回、renamed 原路改名）。目标 checkpoint 之后创建的压缩前历史和子 Agent 文件会被删除，存在变更的内容会被恢复；未被帧追踪的杂散文件保持现状。旧版本沙箱创建的 checkpoint 没有新格式帧，遇到时跳过并告警。文件版本创建只针对非 topic 条目——聊天历史随 checkpoint 恢复，不进用户文件版本链路。

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
