# `~/.magic` 用户级持久化目录规范

本文定义 Super Magic 在线沙箱中 `~/.magic` 的目录职责、写入边界和扩展规则。

`~/.magic` 是**用户级持久化根目录**。它用于保存跨沙箱、跨会话仍应继续生效的用户资产，例如个人环境变量、第三方 CLI 安装产物、CLI 注册表和 CLI 状态目录。

不要把 `~/.magic` 当作临时缓存目录，也不要把它和工作区级 `.workspace/.magic` 混用。

---

## 核心边界

| 路径 | 范围 | 典型内容 | 生命周期 |
|---|---|---|---|
| `~/.magic` | 用户级 | 个人环境变量、用户级 CLI、跨工作区配置 | 跨沙箱保留 |
| `.workspace/.magic` | 工作区级 | 当前工作区的 agent 定义、skills、cron、workspace env | 随工作区保留 |
| `/tmp`、`~/.cache` 非托管目录 | 沙箱级 | 运行时缓存、临时下载、可重建数据 | 沙箱销毁后可丢失 |

判断标准：

- 属于用户身份、用户工具链，且未来工作区也应复用：放入 `~/.magic`。
- 属于某个工作区、某个 agent 或某个项目：放入 `.workspace/.magic`。
- 可重建、可下载、可丢弃：放入沙箱本地缓存，不进入 `~/.magic`。

---

## 设计原则

1. **单一归属**
   每个一级子目录必须有明确 owner。不能多个服务混写同一目录。

2. **工具写入**
   Agent、Skill、Code Mode 不能手写 `registry.json`、shim、manifest 或内部索引文件。必须通过对应 service/tool 写入。

3. **结构稳定**
   `~/.magic` 下的公共路径一旦被 skill 或 service 使用，就视为稳定接口。迁移必须兼容旧结构。

4. **最小持久化**
   只持久化无法安全重建、或重建成本高、或用户明确期望保留的资产。构建产物、下载缓存、日志默认不持久化。

5. **凭证隔离**
   明文密钥只允许进入受控 env 存储。业务 service 的 registry 不保存 token、API key、password、license value。

6. **启动可恢复**
   写入 `~/.magic` 的能力必须定义启动恢复流程：恢复 PATH、软链、配置目录或注册状态时，失败不能阻塞主初始化。

7. **冲突显式化**
   任何会影响用户命令、配置或路径归属的冲突，必须返回明确错误和处理选项，不能静默覆盖。

---

## 当前目录布局

```text
~/.magic/
  super-magic.env
  cli/
    bin/
    prefixes/
    apps/
    state/
    registry.json
```

### `super-magic.env`

个人级环境变量文件，由 `env-manager` 维护。

规则：

- 只能通过 env-manager 相关 service/tool 写入。
- 用于保存个人级、跨工作区生效的环境变量。
- 进程环境加载优先级最高，高于 workspace env。
- 值可能包含敏感信息，不应被普通工具读取后回显。

环境变量加载顺序从低到高：

```text
.workspace/.magic/skills/.env
.workspace/.env
.workspace/.magic/.env
~/.magic/super-magic.env
```

### `cli/`

第三方 CLI 持久化根目录，由 `cli-manager` 维护。

任何第三方 CLI 的安装、接管、恢复、查看和移除都应通过 `cli-manager` skill 和 Code Mode 工具完成。不要手写 `registry.json`，不要手写 shim，不要直接移动 CLI 包目录。

```text
~/.magic/cli/
  bin/
    <command>
  prefixes/
    <name>/
      bin/
        <command>
  apps/
    <name>/
      <install-id>/
  state/
    <name>/
      home/
        ...
  registry.json
```

#### `cli/bin/`

稳定命令入口目录。

规则：

- 由 `cli-manager` 创建 shim。
- 运行时会把该目录注入 `PATH` 前缀。
- 文件名必须是安全命令名，不能使用系统保留命令，例如 `python`、`node`、`git`、`rm`。
- shim 只负责转发到已登记目标，不承载业务逻辑。

#### `cli/prefixes/`

包管理器或安装器支持 prefix 时的首选安装位置。

规则：

- npm、pipx、uv、go、cargo 等包管理器应优先安装到这里。
- shell 安装器如果支持 `--bin-dir`、`--prefix`、`--root`，也应优先安装到：

```text
~/.magic/cli/prefixes/<name>/bin
```

- 已经落在 `~/.magic/cli/prefixes/<name>/bin` 的命令，`cli-manager` 可默认发现。

#### `cli/apps/`

无法 prefix 安装、需要接管当前沙箱安装产物时的托管目录。

规则：

- `cli-manager` 会把真实安装根目录移动到 `apps/<name>/<install-id>/`。
- 原路径会创建软链指向托管目录，用于兼容 CLI 自身路径假设。
- 不允许移动过宽目录，例如 `HOME`、`~/.local`、`~/.cache`、系统目录、共享包管理器根目录。

#### `cli/state/`

CLI 的 HOME 配置或状态持久化目录。

规则：

- 只保存该 CLI 需要跨沙箱保留的配置目录。
- 通过软链把原 HOME 配置目录指向 `cli/state/<name>/home/...`。
- 凭证值仍应优先放在 env-manager；`cli/state` 不作为通用密钥库。

#### `cli/registry.json`

CLI 恢复的唯一元数据入口。

规则：

- 只能由 `cli-manager` 写入。
- 第一版采用单文件 JSON：

```json
{
  "schema_version": 1,
  "items": []
}
```

- 每个 item 至少描述：名称、命令、安装策略、目标命令路径、app links、config dirs、env keys、平台信息和状态。
- 启动恢复只信任 registry，不扫描目录猜测状态。
- registry 损坏时应降级为报错或空列表，不能静默生成不确定记录。

---

## 写入规则

### 允许写入

| 能力 | 允许写入路径 | 入口 |
|---|---|---|
| env-manager | `~/.magic/super-magic.env` | env-manager service/tool |
| cli-manager | `~/.magic/cli/**` | cli-manager service/tool |
| HOME 持久化初始化 | `~/.magic` 软链恢复 | `HomePersistenceService` |

### 禁止写入

- Agent 手写 `~/.magic/cli/registry.json`。
- Agent 手写 `~/.magic/cli/bin/<command>`。
- Agent 把任意下载缓存、日志、大文件临时产物放入 `~/.magic`。
- 任意功能把明文 token/API key 写入自己的 registry。
- 未登记 owner 的新一级目录直接落入 `~/.magic`。

---

## 新增子目录准入

需要在 `~/.magic` 下新增一级目录时，必须先补充本规范，并满足以下条件：

1. 目录 owner 明确。
2. 数据必须跨沙箱保留。
3. 有唯一 service 负责读写。
4. 有 schema 或 manifest 版本。
5. 有启动恢复或加载策略。
6. 有冲突处理策略。
7. 有清理/卸载策略。
8. 有敏感信息边界说明。
9. 有单元测试覆盖核心读写和恢复行为。

推荐目录命名：

```text
~/.magic/<capability-name>/
```

避免命名：

```text
~/.magic/tmp/
~/.magic/cache/
~/.magic/data/
~/.magic/tools/
```

这些名字过宽，无法体现 owner 和数据边界。

---

## 恢复策略

启动期恢复应遵循：

1. 先恢复 `~/.magic` 本身的 HOME 软链。
2. 再恢复依赖 `~/.magic` 的子能力，例如 CLI shim、配置目录软链。
3. 单项恢复失败只记录 warning，不阻塞工作区初始化。
4. 恢复动作必须幂等，多次执行结果一致。
5. 遇到用户新建的同名真实路径，不能强制覆盖；应返回冲突或跳过。

---

## 安全与隐私

- `~/.magic` 属于用户级持久空间，内容可能跨工作区复用。
- 写入前必须确认数据是否适合跨工作区存在。
- 凭证值只能进入 env-manager 或专门的安全存储。
- 最终回答、工具详情和日志不应回显明文密钥。
- registry、manifest 中只记录环境变量名，例如 `AIDATA_API_KEY`，不记录 value。

---

## 常见场景

### 第三方 CLI 安装

优先顺序：

1. 能直接安装到持久 prefix：安装到 `~/.magic/cli/prefixes/<name>/bin`。
2. 不能 prefix，但安装根目录安全：用 `cli-manager` 接管并移动到 `~/.magic/cli/apps/<name>/...`。
3. 安装根目录过宽或共享：拒绝接管，提示用户改用 prefix 安装、改名或取消。

### CLI 配置目录

需要保留的 HOME 配置目录，例如 `~/.cache/aidata`，应由 `cli-manager` 映射到：

```text
~/.magic/cli/state/<name>/home/.cache/aidata
```

然后在原路径创建软链。

### 环境变量

CLI 依赖的密钥使用 env-manager 保存 value。`cli-manager` 只记录 key：

```text
AIDATA_API_KEY
```

---

## 维护要求

- 修改 `PathManager` 中 `~/.magic` 相关路径时，同步更新本文。
- 新增 `~/.magic` 子目录时，同步更新目录布局和写入规则。
- 修改启动恢复顺序时，同步更新恢复策略。
- 修改 env 加载优先级时，同步更新 `super-magic.env` 章节。
- 修改 cli-manager registry schema 时，同步更新 `cli/registry.json` 章节。
