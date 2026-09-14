# Magic 文件系统与目录边界指南

本文说明 Super Magic 运行时几个重要目录的职责、持久性和 checkpoint 边界。新增文件前先判断它属于哪一类数据，再选择目录；不要仅因为某个目录「看起来方便」就写入。

## 五条基本规则

```text
.chat_history/       = 运行期聊天记录持久状态，即 agfs localfs 空间的挂载，随 checkpoint 增量记账
.topic/chat_history/ = 话题卷上的交接源：启动时从它恢复（一次性迁移/兜底）
.runtime/       = 可重新生成的运行数据，不需要 checkpoint，不进入归档
.workspace/     = 用户文件，由现有文件 checkpoint 机制单独处理
.checkpoints/   = checkpoint 自身，不能复制进自己
```

这些目录不是同一层级的不同叫法，而是不同的数据责任：

- `.chat_history/` 保存 Agent 运行期继续理解和恢复一个话题所需的持久数据。沙箱内它是指向 agfs localfs 空间挂载的 symlink（`/app/.chat_history` → `/mnt/agfs/localfs/chat_history`，gateway 在 bind 时创建）：数据只落 agfs-server 容器本地盘，无元数据服务/S3 依赖，每次保存由 checkpoint hook 以 per-file 帧增量记账进 checkpoint。本地开发环境（无 agfs 挂载）它是普通本地目录，功能不受影响，只是没有帧记账。
- `.topic/chat_history/` 是话题卷上的交接副本：沙箱启动时若它有数据则据此恢复本地 `.chat_history/`（一次性迁移/兜底）；每轮运行结束后聊天历史打包上传 zip。
- `.runtime/` 保存进程运行期间的临时文件、调试日志和可重新计算结果。
- `.workspace/` 保存用户需要长期保留、下载或继续编辑的文件。
- `.checkpoints/` 保存文件 checkpoint 和操作流水、内容帧本身。

## 目标目录结构

```text
project_root/
├── .chat_history/                          运行期聊天记录（localfs 空间挂载的 symlink；本地开发为普通目录）
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
│   ├── llm_requests/                      LLM 调试日志
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

checkpoint 数据保存在 `.checkpoints/`，挂载内文件由 agfs 侧 checkpoint hook 按空间分区记录内容帧（project / topic 由 magicfs 插件记账，chat_history 由 localfs 插件记账）：

```text
.checkpoints/checkpoint_manifest.json          共享清单（Python 写、agfs 侧 hook 读）
.checkpoints/<checkpoint_id>/checkpoint_info.json      Python 簿记（id/created_time，只写一次）
.checkpoints/<checkpoint_id>/project/operations.json   project 操作流水 + file_snapshots/
.checkpoints/<checkpoint_id>/user/operations.json      user 挂载内文件的流水 + file_snapshots/
.checkpoints/<checkpoint_id>/topic/operations.json     topic 挂载内文件的流水 + file_snapshots/
.checkpoints/<checkpoint_id>/chat_history/operations.json   聊天历史空间的流水 + file_snapshots/
```

- `checkpoint_info.json` 是 Python 私有的；`operations.json` 与内容帧由 agfs 侧 hook 写入各自空间分区，Python 只读。
- `.chat_history/` 的每次保存（含子代理保存）由 localfs 的 checkpoint hook 增量记账：initial 帧 = 本 checkpoint 内该文件首次变更前的字节，latest 帧 = 最近一次变更后的字节。Python 侧不再做整目录快照。
- manifest 带 `activity` 字段（idle / rollback / restore）：任何非 idle 活动期间 hook 跳过记账——rollback 表示 Python 正在按流水重放历史状态，restore 表示正在从远端归档恢复会话数据；创建新 checkpoint 时回到 idle。
- 流水条目带两个协议字段：`file_path` 是 agent 可见绝对路径，恢复目标即路径本身；`space` 标记来源空间，用于按空间施加策略。
- 恢复顺序契约：沙箱启动时聊天历史恢复（zip 解压 / topic 恢复 / 清空）必须先于 checkpoint manifest 落地——恢复阶段 hook 因"无 manifest"静默跳过，恢复出的文件不会被记成 created。manifest 下载挪到恢复之前会把整个聊天历史灌进旧 checkpoint。

checkpoint 由主 Agent 创建：每个用户回合开始前登记新 checkpoint 并写入簿记，此后 agfs 侧 hook 自动对挂载内所有空间的变更入账。

回滚时 `RollbackExecutor` 读聚合后的流水：工作区回放非内部状态空间条目，topic 与 chat_history 条目走同一条尽力而为重放路径，共用同一套 operation 感知重放——反向（undo）用 initial 帧、正向（redo）用 latest 帧。文件版本创建只针对工作区条目。未被帧追踪的杂散文件保持现状；某空间没有 operations.json 时视为该空间无条目。

空间分类（工作区 / 内部状态）的唯一事实来源是空间注册表（`entity/checkpoint.py` 的 `WORKSPACE_SPACES` / `INTERNAL_SPACES` + `is_internal_space`）：新增需要回滚的空间 = 注册表登记一行 + agfs/gateway 侧挂载，回滚执行器与附件过滤零改动。

升级前旧 checkpoint 的远端归档中可能仍存在聊天历史整目录快照目录（`initial/latest_chat_history_snapshots/`）；回滚执行器不再读取它们——回滚到这类 checkpoint 时工作区与 topic 照常按帧恢复，聊天历史以 zip 启动恢复兜底。

聊天历史帧覆盖 `.chat_history/` 下全部持久数据：

- 主 Agent 的 history、session、Horizon、token usage 和其它话题辅助 JSON。
- `compacted/` 中的压缩前历史。
- `subagents/` 中主 Agent 产生的子 Agent 目录的全部持久状态。

不进入聊天历史记账的：

- `llm_request/` 调试日志目录（现位于 `.runtime/llm_request/`，不在聊天历史目录内）。
- `.runtime/` 下的临时上下文、后台 shell 日志和 MCP 大结果。
- `.workspace/` 下的用户文件走工作区帧；`.checkpoints/` 本身不在任何挂载内，也不会复制进自己。

## 文件放置判断

| 问题 | 放置位置 |
|---|---|
| Agent 之后还需要从中恢复话题或查找历史吗？ | `.chat_history/`（运行期，localfs 空间挂载），随归档交接 |
| 进程结束后能否重新生成，或只是调试、临时、中间结果？ | `.runtime/` |
| 用户需要长期保留、下载或继续编辑吗？ | `.workspace/` |
| 它是 checkpoint 的索引、快照或文件操作记录吗？ | `.checkpoints/` |

如果一个文件同时满足多类描述，优先按它的持久责任放置，而不是按生成它的 Agent 放置。例如：

- 后台压缩 Agent 的临时 history 放 `.runtime/background_compact/`，不放 `.topic/chat_history/subagents/`。
- 压缩前的主 Agent 完整历史是用户话题的可检索证据，放 `.topic/chat_history/compacted/`，并随 checkpoint 恢复。
- LLM 请求调试日志放 `.runtime/llm_requests/`，不进入聊天历史归档或 checkpoint。
- 旧版本聊天历史中的 `.chat_history/llm_request/` 与当前的 `llm_requests/` 都由迁移和归档逻辑排除；已挂载的 `.topic/chat_history/llm_request/` 会在启动后异步删除，不阻塞启动主链路。

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
