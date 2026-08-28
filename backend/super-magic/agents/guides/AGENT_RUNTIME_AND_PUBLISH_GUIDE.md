# Agent 运行时与发布链路

本文说明两类彼此独立的流程：

- Agent 运行时：把一个 Built-in、Crew 或 MagicClaw 定义准备成可以直接运行的 `Agent`。
- 发布链路：把工作区文件打包并上传，供安装、分发和产品展示使用。

运行时解决「当前任务如何正确运行」，发布解决「如何把定义交付给其他环境」。两者可以读取部分相同文件，但职责、缓存和错误处理不能混在一起。

## 一、统一运行时入口

所有业务入口统一调用：

```python
agent = await AgentRuntime.get_instance().acquire(
    target=AgentTarget(...),
    lifetime=AgentLifetime.CACHED,
    context=agent_context,
    agent_id=None,
)
```

`AgentRuntime.acquire()` 成功返回时，调用方拿到的已经是可运行实例。调用方不需要、也不允许再单独执行编译、构造或动态初始化。

当前入口包括：

- 主对话：`AgentDispatcher`，使用 `CACHED`。
- `call_subagent`：使用 `TRANSIENT`。
- cron 和后台上下文压缩：通过 `run_isolated_agent()` 使用 `TRANSIENT`。
- 维护接口、回滚和 cron 通知：只通过 Runtime 查询或失效主缓存，不直接访问 Dispatcher 内部字典。

运行时核心文件：

```text
app/core/models/agent_runtime.py

app/service/agent_runtime/
├── __init__.py
├── errors.py
├── providers.py
└── service.py

app/service/claw_agent_runtime_service.py
app/service/crew_agent_runtime_service.py
```

## 二、AgentTarget 如何确定运行来源

`AgentMode` 是消息和 cron 使用的产品协议字段；`AgentProviderType` 是 Runtime 已经确认的定义来源。入口先用 `AgentTarget.from_mode()` 或 `AgentTarget.from_name()` 把协议输入规范化，后续 Runtime、Context、缓存和 runner 只传递这个目标对象。

`AgentTarget` 只有两个字段：

```python
AgentTarget(
    provider_type=AgentProviderType.BUILTIN,
    agent_name="magic",
)
```

其中 `agent_name` 表示 Runtime 要加载的 `.agent` 定义名称，不是 Profile 的展示名称。Crew Provider 在自己的边界把它命名为 `agent_code`，Claw Provider 把它命名为 `claw_code`；通用 Runtime 不保存第二份 code。

| 输入 | Provider type | 最终定义 |
|---|---|---|
| 已知 Built-in mode | `BUILTIN` | `AgentMode.get_agent_type()` 对应的本地 `.agent` |
| `mode=custom_agent` + SMA code | `CREW` | 编译后的 `agents/<code>.agent` |
| `mode=magiclaw` + Claw code | `CLAW` | 编译后的 `agents/<code>.agent` |
| 无 mode，名称是 SMA code | `CREW` | 保留 `call_subagent` 直接调用 Crew 的能力 |
| 无 mode，其他明确名称 | `BUILTIN` | 对应的本地 `.agent` |

校验规则：

- 显式名称和 code 会先去除首尾空白。
- 空值、`..`、`/`、`\` 会被拒绝。
- Crew code 继续使用项目统一的 SMA code 校验。
- MagicClaw 只能由明确的 `mode=magiclaw` 进入 Claw Provider。
- 名称恰好等于某个 Claw code、Claw 目录存在或编译产物存在，都不会触发隐式识别。
- Provider 准备失败时不会回退到 `magic.agent`。

`from_mode()` 对未知且没有 code 的字符串会把它当作明确的 Agent 名称；未知 mode 携带 code 会直接报错。`from_name()` 会复用 `AgentMode.resolve_agent_type()` 处理 `ppt → slider` 等已知别名，但永远不会仅凭名称把目标识别成 Claw。

## 三、AgentRuntime.acquire() 的固定顺序

一次 acquire 按以下顺序完成：

1. 规范化并校验 `AgentTarget`。
2. 确定 Builtin、Crew 或 Claw Provider。
3. 获取当前 `context_id` 的 acquire lock。
4. 检查该 Context 的 cached Agent 是否仍在运行。
5. Provider 准备最终 `.agent`、有效 profile 和 `revision`。
6. 对比现有缓存的 `target` 与 `revision`。
7. 需要重建时，先关闭空闲旧实例。
8. 将同一个 `AgentTarget` 和有效 profile 写入 Context。
9. 构造 `Agent(...)`。
10. 按实例生命周期和 Provider 策略完成动态初始化。
11. 只有完整成功的 `CACHED` 实例才写入 Runtime cache。
12. 返回可运行 Agent。

取消期间的 `asyncio.CancelledError` 原样传播。已经构造但尚未交付的 Agent 会关闭；构造中途失败时会清理 Context registry，并恢复 acquire 前的 `AgentTarget` 和 profile。

## 四、三个 Provider 的职责

Provider 只准备静态定义，不修改 `AgentContext`，不构造 `Agent`，也不管理主缓存。

### 4.1 Builtin Provider

Builtin Provider：

1. 确定 canonical agent name，例如 `magic`、`slider`、`data-analyst`。
2. 异步读取 `agents/<agent_name>.agent`。
3. 读取当前 Context 已确定的基线 `AgentProfile`。
4. 计算 revision。
5. 返回 `DynamicInitPolicy.CACHED_ONLY`。

本地文件缺失或不可读时直接返回定义准备错误，不做其他 Agent 的降级尝试。

### 4.2 Crew Provider

Crew Provider 复用 `CrewAgentRuntimeService.ensure_compiled()`：

```text
SMA code
  │
  ├─ 本地定义不存在：下载到 agents/crews/<code>/
  │
  ├─ 计算 Crew source fingerprint
  │    ├─ manifest 一致：复用现有编译产物
  │    └─ source 变化：重新编译
  │
  └─ CrewAgentCompiler.compile()
       ├─ agents/crew.template.agent
       ├─ IDENTITY.md
       ├─ AGENTS.md
       ├─ SOUL.md
       ├─ TOOLS.md
       └─ SKILLS.md
            │
            ▼
       agents/<code>.agent
```

Crew source fingerprint 只决定「是否需要重新编译」。最终内存 Agent 是否重建，由 Runtime 对最终 `.agent` 和 profile 计算出的 revision 决定。

主 Agent 的 Crew 重新编译继续失效全局 Skill cache。isolated Crew 准备不会在子 Agent 创建期间重置父 Agent 的全局 Skill 状态。

### 4.3 Claw Provider

Claw Provider 复用 `ClawAgentRuntimeService.prepare()`：

```text
明确 mode=magiclaw + claw_code
  │
  ├─ agents/claws/<code>/ → .workspace/.magic/
  │    ├─ 首次初始化：复制完整模板
  │    └─ 已初始化：只补缺失文件，排除 BOOTSTRAP.md 和 memory/
  │
  ├─ 首次初始化时处理 memory/1900-01-01-none.md
  │
  └─ 每次 prepare 都执行 ClawAgentCompiler.compile()
       ├─ agents/claw.template.agent
       ├─ .magic/IDENTITY.md
       ├─ .magic/SOUL.md
       ├─ .magic/AGENTS.md
       └─ .magic/TOOLS.md
            │
            ▼
       agents/<code>.agent
```

Claw 准备锁按规范化后的 `.workspace/.magic/` 路径建立。不同 Claw code 也会写同一个目录，因此不能只按 code 加锁。

`.agent` 是可再生编译产物，每次 prepare 都重新生成。用户已经写入 `.magic` 的文件继续使用 `CopyConflict.SKIP` 保留。

## 五、revision 管理什么

`revision` 只回答：当前内存 Agent 的静态定义是否仍和磁盘最终定义一致。

计算输入：

```text
revision contract version
+ provider type
+ canonical agent name
+ final .agent bytes
+ AgentProfile canonical JSON
```

canonical JSON 使用 UTF-8、排序 key、固定 separators 和 `ensure_ascii=False`，最终计算 SHA-256。

以下内容不进入 revision：

- 当前时间、随机 ID、cron run id、Agent instance id。
- workspace 普通文件。
- 用户语言、模型选择和 ChatHistory。
- `.magic/IDENTITY.md` 正文、`SOUL.md`、`AGENTS.md`、`USER.md`。
- `.magic/MEMORY.md`、`.magic/memory/*.md`。
- `BOOTSTRAP.md` 和 MagicClaw startup 已读状态。
- 全局 Skill 正文和 Python 工具代码热更新。

Claw `TOOLS.md` 会通过最终 `.agent` 间接进入 revision；`IDENTITY.md` frontmatter 会通过有效 profile 间接进入 revision。

动态 workspace、memory、语言和 startup 状态由 Horizon 管理，不需要额外的 `context_revision`。

## 六、核心对象与动态初始化

运行时只保留四个有独立语义的对象：

| 对象 | 负责什么 | 不负责什么 |
|---|---|---|
| `AgentTarget` | 表达已经确认的 Provider 类型和 Runtime 定义名称 | 不保存模型、Context、缓存、run 参数或展示名称 |
| `AgentDefinition` | 保存 Provider 准备出的 profile、静态定义 revision 和动态初始化策略 | 不是 live Agent，不拥有 Context，也不管理缓存 |
| `Agent` | 绑定 Context、ChatHistory、Horizon 并执行 Agent run | 不负责决定定义来自哪个 Provider，也不负责 Runtime 缓存 |
| `AgentRuntime` | 统一负责 Provider 准备、缓存判断、构造、动态初始化、失败回滚和关闭 | 不改变消息协议、cron 持久化格式或 `.agent` 文件格式 |

`AgentContext` 只保存当前已绑定的 `AgentTarget`。现有业务需要 code 时，`get_agent_code()` 从 Crew/Claw target 的 `agent_name` 派生，Builtin 返回 `None`。`is_magiclaw()` 直接检查 `target.provider_type == AgentProviderType.CLAW`，只有 acquire 之前才回退读取 `ChatClientMessage`。

`AgentTarget.agent_name`、`agent_id` 和 `display_name` 的语义必须分开：`agent_name` 是定义名称，`agent_id` 是一次运行实例的 session 标识，`display_name` 只用于 Profile/UI 展示。

动态初始化策略：

| 场景 | lifetime | 动态初始化 |
|---|---|---|
| 主对话 Builtin | `CACHED` | 新建或重建时执行 |
| 主对话 Crew | `CACHED` | 新建或重建时执行 |
| 主对话 MagicClaw | `CACHED` | 新建或重建时执行 |
| `call_subagent` Builtin/Crew | `TRANSIENT` | 不执行 |
| 普通 cron Builtin/Crew | `TRANSIENT` | 不执行 |
| MagicClaw cron | `TRANSIENT` | 每个实例执行 |
| 后台上下文压缩 | `TRANSIENT` | 不执行 |

`Agent.async_complete_dynamic_init()` 负责把 workspace snapshot、用户语言和 memory 写入 Horizon。它由 `AgentRuntime` 在构造完成后、首次 `agent.run()` 前按 `DynamicInitPolicy` 调用，不由各入口分别决定。MagicClaw 还会恢复 `.magic` 必读文件、已读记录和 `BOOTSTRAP.md` 状态，确保首次 LLM 请求已经具备 startup 上下文。

## 七、缓存、并发和资源清理

Runtime cache 按 `context_id` 管理，并遵守：

- 一个 Context 最多一个 `CACHED` Agent。
- `TRANSIENT` Agent 不进入主缓存，由 runner 或 `call_subagent` 在执行 `finally` 中关闭。
- cache hit 必须同时满足 `target` 和 `revision` 一致。
- Provider 准备失败时，尚未关闭的旧缓存继续保留，但本次请求返回错误。
- 旧实例正在运行时，不重编译、不替换，返回 `AgentRuntimeBusyError`。
- 新实例构造或动态初始化失败时不写缓存，并恢复 Context 原有的 target 和 profile。
- `invalidate_context()` 用于 restart 等维护操作。
- `close_all()` 在服务关闭时清理所有 cached Agent。

每个 Context 的 acquire 使用独立 `asyncio.Lock`。业务逻辑仍运行在主线程主事件循环，不增加线程锁。

## 八、MagicClaw cron 身份

新建 MagicClaw cron 会在任务 Markdown 中同时保存：

```yaml
payload:
  kind: agent_turn
  agent_mode: magiclaw
  agent_name: <claw_code>
```

执行时：

1. 持久化层保留 `agent_mode` 字符串，不猜 Provider type。
2. executor 把已知 mode 转成 `AgentMode`。
3. `magiclaw` 和 `custom_agent` 都要求 `agent_name` 非空，并通过 `AgentTarget.from_mode()` 生成明确目标。
4. runner 接收完整 `AgentTarget`，通过 `TRANSIENT` Runtime acquire 创建 Agent。
5. Claw Provider 完成模板同步和编译。
6. Runtime 在首次 `agent.run()` 前执行 MagicClaw 动态初始化。

没有 `agent_mode` 的历史 cron 继续按普通明确名称运行。系统不会根据名称、目录或已有 `.agent` 文件把旧任务猜成 MagicClaw，也不会自动改写历史任务。

## 九、发布链路

发布入口仍是 `POST /workspace/export`：

```text
前端发起发布请求
  │
  ▼
export_workspace(type, code, upload_config, source_path)
  │
  ├─ 读取工作区 frontmatter 元数据
  │    ├─ IDENTITY.md
  │    ├─ TOOLS.md
  │    └─ SKILLS.md
  │
  ├─ 打包 <code>_<timestamp>.zip
  │
  └─ 上传对象存储
       │
       ▼
返回 file_key 和 metadata
```

发布链路不会：

- 调用 `AgentRuntime.acquire()`。
- 构造 Agent。
- 执行动态初始化。
- 读取 `crew.template.agent` 或 `claw.template.agent` 来编译运行产物。
- 管理 Runtime cache 或 revision。

发布只负责打包、元数据和上传；运行时只负责当前进程中的定义准备和实例生命周期。

## 十、修改代码前的检查表

| 需求 | 应查看的位置 |
|---|---|
| 目标识别、缓存、构造、动态初始化 | `app/service/agent_runtime/service.py` |
| Builtin/Crew/Claw definition 与 revision | `app/service/agent_runtime/providers.py` |
| Runtime 类型与 Target 绑定 | `app/core/models/agent_runtime.py`、`app/core/context/agent_context.py` |
| Crew 下载、指纹和编译 | `app/service/crew_agent_runtime_service.py`、`crew_agent_cache_manager.py`、`crew_agent_compiler.py` |
| Claw 模板同步和编译 | `app/service/claw_agent_runtime_service.py`、`claw_agent_compiler.py` |
| 主对话入口 | `app/service/agent_dispatcher.py` |
| isolated Agent | `app/service/agent_runner.py`、`app/tools/call_subagent.py` |
| MagicClaw cron 身份 | `app/tools/manage_cron.py`、`app/service/cron/` |
| 发布打包与元数据 | `app/service/workspace_export_service.py` |

检查原则：

- 业务入口是否绕过 `AgentRuntime.acquire()` 直接构造 `Agent`。
- 是否把动态 workspace/startup 状态错误加入 revision。
- 是否根据名称或目录猜测 MagicClaw。
- 是否把发布打包逻辑和运行时编译逻辑写到一起。
- 是否让 `TRANSIENT` Agent 进入主缓存，或忘记在执行结束时关闭。
