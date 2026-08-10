# Super Magic 模块迁回 magic-service 方案

## 一、背景

当前超级麦吉产品的主要调用链路如下：

```text
magic-web => magic-service => super-magic-module（PHP 扩展包）=> super-magic
```

`super-magic-module` 是高频开发模块，当前架构带来以下效率问题：

### 1. 发布效率低效

每个功能从测试、预发布到生产，都需要额外执行一次 Composer 更新。每次耗时约 3 分钟，预发布和生产还需要额外审核。

当前约有 7 个后端研发，平均每天约 5 次构建，按现有估算，一年累计需要额外消耗约 26.61 天。

### 2. 开发效率低效

- AI 不容易理解 vendor 包的真实开发目录，可能错误修改 vendor，或者撤回了真实目录中的修改。
- 扩展包之间的 `composer.json` 依赖版本容易发生冲突。
- 代码、配置、路由和运行时注册分散在主工程与扩展包，定位问题和进行 vibe coding 的成本较高。

## 二、目标

1. 将 `super-magic-module` 代码迁移到 `magic-service` 仓库内，保证原有功能不变。
2. 保持原有路由、请求参数、响应结构和调用方不变，`magic-web` 无需改造。
3. 将 Super Magic 按业务域和分层重新组织，降低代码理解和维护成本。
4. 本次迁移只做目录、文件名、namespace、引用和运行时注册的等价迁移，不删除类、方法、API 或改变业务实现；无效代码和 API 清理由后续独立迁移处理。
5. 为各业务域补充清晰的目录和说明文件，方便后续开发和 AI 理解。
6. 最终调用链路变为：

```text
magic-web => magic-service => super-magic
```

## 三、具体方案落地

### 3.1 依赖关系梳理

当前确认只有 `magic-service` 在 Composer 层面直接依赖 `super-magic-module`，其他扩展包没有继续声明该 Composer 依赖。因此本次迁移的代码仓范围主要是 `magic-service`。

但运行时扫描确认，`dtyq/billing-manager` 和 `dtyq/magic-enterprise-service` 虽未声明直接 Composer 依赖，其源码仍有 88 处、涉及 40 个有效旧 FQCN 的 `Dtyq\SuperMagic` 类型引用。完整调用点必须冻结到 `docs/migration/super-magic/external-vendor-references.csv`。在这两个包完成独立升级前，主工程需要提供由逐类映射清单自动生成的惰性 `class_alias` 兼容层；兼容层只服务外部 Composer 包和可能残留的旧序列化类型，新写或迁移后的 magic-service 业务代码禁止继续使用旧 FQCN。

但“没有其他 Composer 包直接依赖”不等于“模块边界独立”。Super Magic 已被 magic-service 的 Chat、Design、Speech、KnowledgeBase、MagicBase、MCP、Bootstrap、Mode、LongTermMemory 和 Permission 等功能直接使用，迁移范围还包括这些调用方的 namespace、配置、测试和运行时注册调整。

#### 3.1.1 magic-service 对模块命名空间的引用规模

通过扫描 `app/` 和 `config/` 下的生产代码，当前主工程直接引用 `Dtyq\SuperMagic\...` 的范围如下：

| 引用范围 | 引用次数 | 主要用途 |
|---|---:|---|
| `Dtyq\SuperMagic\Domain\SuperAgent` | **112** | Project、Topic、Task、TaskFile、Sandbox、Message 等核心能力 |
| `Dtyq\SuperMagic\Domain\Agent` | **10** | Agent 管理和数字员工权限 |
| `Dtyq\SuperMagic\Infrastructure\ExternalAPI` | **8** | SandboxOS、ASR、文件转换等外部能力 |
| `Dtyq\SuperMagic\Application\SuperAgent` | **7** | Task、Message、File 等应用服务 |
| `Dtyq\SuperMagic\Domain\Share` | **5** | 分享和资源访问 |
| `Dtyq\SuperMagic\Infrastructure\Utils` | **5** | 文件路径、访问令牌等工具 |
| `Dtyq\SuperMagic\Domain\Chat` / `Domain\Skill` / `Application\Agent` 等 | **19** | Chat、Skill、Agent 和其他边界适配 |
| `ErrorCode`、`Interfaces`、`Application\MagicFS` 等 | **6** | 错误码、RPC 和 MagicFS 接口 |

以当前迁移分支为准，整体为 **58 个生产文件、172 条 import**。引用并不是平均分布的，主要集中在以下主工程功能：

- Chat：跟进建议、会话、用户任务、消息 DTO。
- Design：图片/视频生成任务读取 TaskFile、Project 和 Sandbox 能力。
- Speech：ASR 文件、目录、Sandbox、音频项目和 TaskFile。
- KnowledgeBase：项目文件、Super Magic Agent 权限 RPC、文件变更通知。
- MagicBase：项目、成员和 Share 资源访问。
- MCP：项目级 MCP 配置和 Agent/Skill 能力。
- Bootstrap、Mode、LongTermMemory、Permission 等基础流程。

这部分不需要改造 `magic-web`，但迁移时必须同步处理这些主工程引用的类加载路径和 namespace。应将它们作为“外部调用方清单”，在迁移分支完成全部目录和 namespace 改造后统一扫描，确保 `app/`、`config/`、`test/` 和 `migrations/` 不再引用旧 namespace 或 vendor 路径。

迁移实施以当前分支代码为唯一输入。在进入迁移冻结窗口时，需要记录当前分支 HEAD，并重新生成文件、路由、注册项和资源清单；文档中的数量用于方案评审，最终验收以冻结时生成的清单为准。

建议使用以下命令生成迁移前后对比清单：

```bash
rg -n '^use Dtyq\\SuperMagic\\' app config -g '*.php'
rg -n 'vendor/dtyq/super-magic-module|SUPER_MAGIC_MODULE_PATH' . -g '*.php'
```

#### 3.1.2 迁移时需要同步处理的引用

主工程引用主要分为三类：

1. **业务依赖**：`Domain/SuperAgent`、`Domain/Agent`、`Domain/Share`、`Domain/Skill` 等。它们随对应业务域一起迁移。
2. **技术依赖**：`Infrastructure/ExternalAPI`、`Infrastructure/Utils`、`Application/Contract` 等。它们需要先于依赖它们的 Application Service 迁移。
3. **注册依赖**：`config/autoload/dependencies.php`、`config/autoload/error_message.php`、RPC Service 和路由装配。它们必须在代码迁移完成后统一切换，不能保留两套注册源。
4. **外部 Composer 包的源码类型依赖**：由 `external-vendor-references.csv` 和自动生成的 `legacy_class_aliases.php` 承接。兼容层不得包含业务实现，也不得成为主工程新代码的依赖入口；待 billing-manager、enterprise-service 切换到新 FQCN 后单独删除。

模块内部已经与主工程存在双向代码依赖，迁移时仍需检查以下边界：

- `super-magic-module` 大量引用 `App\...` 命名空间。
- `magic-service` 的多个 API、Application Service、事件订阅者和测试直接引用 `Dtyq\SuperMagic\...`。
- Go Engine 通过 IPC 调用 PHP 侧 Super Magic 权限能力，IPC 方法名和响应结构不能改变。
- Hyperf 的 `ConfigProvider`、路由、DI、迁移、监听器和资源目录需要从扩展包注册方式切换为主工程注册方式。

本次迁移一步到位，所有业务实现均切换到 `App\...\SuperMagic` namespace。代码移动到最终目录时，同步修改模块内部 namespace、模块内部 import、主工程 172 条 import、配置 class-string、注解、RPC 注册和测试引用。唯一允许保留的旧 FQCN 文本是 `app/Infrastructure/SuperMagic/Legacy/legacy_class_aliases.php` 中自动生成的兼容映射，以及 `external-vendor-references.csv`、迁移方案等审计材料；不得在业务代码中定义或实现新的 `Dtyq\SuperMagic` 类。

#### 3.1.3 namespace 与目录映射

最终文件目录和 namespace 必须符合主工程现有 PSR-4 规则：

| 旧 namespace | 新 namespace / 目录 |
|---|---|
| `Dtyq\SuperMagic\Interfaces\SuperAgent\...` | `App\Interfaces\SuperMagic\<Domain>\...` / `app/Interfaces/SuperMagic/<Domain>/` |
| `Dtyq\SuperMagic\Interfaces\Agent\...` | `App\Interfaces\SuperMagic\Agent\...` / `app/Interfaces/SuperMagic/Agent/` |
| `Dtyq\SuperMagic\Interfaces\Skill\...` | `App\Interfaces\SuperMagic\Skill\...` / `app/Interfaces/SuperMagic/Skill/` |
| `Dtyq\SuperMagic\Application\SuperAgent\...` | `App\Application\SuperMagic\<Domain>\...` / `app/Application/SuperMagic/<Domain>/` |
| `Dtyq\SuperMagic\Domain\SuperAgent\...` | `App\Domain\SuperMagic\<Domain>\...` / `app/Domain/SuperMagic/<Domain>/` |
| `Dtyq\SuperMagic\Domain\Agent\...` | `App\Domain\SuperMagic\Agent\...` / `app/Domain/SuperMagic/Agent/` |
| `Dtyq\SuperMagic\Domain\Skill\...` | `App\Domain\SuperMagic\Skill\...` / `app/Domain/SuperMagic/Skill/` |
| `Dtyq\SuperMagic\Domain\Share\...` | `App\Domain\SuperMagic\Common\Share\...` / `app/Domain/SuperMagic/Common/Share/` |
| `Dtyq\SuperMagic\Infrastructure\...` | `App\Infrastructure\SuperMagic\...` / `app/Infrastructure/SuperMagic/` |
| `Dtyq\SuperMagic\ErrorCode\...` | `App\ErrorCode\...` / `app/ErrorCode/` |

例如：

```text
旧：Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity
新：App\Domain\SuperMagic\Project\Entity\ProjectEntity

旧：Dtyq\SuperMagic\Application\SuperAgent\Service\MessageQueueAppService
新：App\Application\SuperMagic\Message\Service\MessageQueueAppService
```

迁移完成后的强制检查：

```bash
rg -n 'Dtyq\\SuperMagic' app config test migrations \
  --glob '!app/Infrastructure/SuperMagic/Legacy/legacy_class_aliases.php'
rg -n 'vendor/dtyq/super-magic-module|SUPER_MAGIC_MODULE_PATH' .
```

第一条除自动生成的兼容别名文件外必须为空；第二条除迁移方案文档、历史记录等非运行时文本外必须为空。

#### 3.1.4 逐类映射清单

本次迁移涉及跨目录、跨业务域的 namespace 重命名，不能只依赖一级目录映射。冻结迁移输入后，必须生成并纳入迁移 MR 的逐类映射清单：

```text
docs/migration/super-magic/class-map.csv
```

清单每行至少包含：

```text
old_file,old_fqcn,new_file,new_fqcn,symbol_type,business_domain,registration_type,external_reference_count
```

其中 `symbol_type` 覆盖 Class、Interface、Trait 和 Enum，`registration_type` 标记 Route Handler、DI、Listener、Consumer、Crontab、Command、RPC、Migration 引用或普通类。清单以冻结时的 `vendor/dtyq/super-magic-module/src/` 为输入自动生成，禁止仅手工维护。

迁移完成后必须自动校验：

1. 每个旧 FQCN 有且只有一个新 FQCN。
2. 不存在多个旧 FQCN 映射到同一个新 FQCN。
3. 旧、新 Class、Interface、Trait、Enum 数量一致。
4. `new_file`、`new_fqcn` 和根 Composer 的 `App\\` PSR-4 规则一致。
5. 所有外部引用、配置 class-string、注解参数、测试和 Migration 中的类引用均已使用清单中的新 FQCN。
6. 迁移 MR 未新增清单之外的类删除、类合并或业务实现变更。

迁移后还必须执行 AST 归一化对比：忽略 namespace、import 顺序和逐类 FQCN 替换后，所有剩余语义差异必须记录到 `docs/migration/super-magic/code-semantic-differences.txt` 并逐项说明原因。未进入该清单的语句结构变化必须阻断合并。

迁移分支建议按以下 commit 顺序组织，便于审查：原始文件搬入、逐类 namespace 替换、主工程调用方替换、运行时注册切换、资源与 Migration 切换、删除 Composer 依赖。最终仍作为同一个完整版本发布。

#### 3.1.5 开工前 Go/No-Go 门禁

以下核心前置项不是迁移过程中的补充文档，而是开始复制代码、修改 namespace 或切换注册之前必须完成并提交评审的冻结基线。任意一项缺失、校验失败或仍存在未决映射时，本次迁移状态均为 **No-Go**，不得开始批量搬迁：

| 前置项 | 必须落盘的产物 | 开工条件 |
|---|---|---|
| 逐类映射清单 | `docs/migration/super-magic/class-map.csv` | 覆盖全部 Class、Interface、Trait、Enum；旧 FQCN、新 FQCN、旧文件、新文件均一对一且无冲突 |
| Migration identity 与全局顺序 | `migrations-before.txt`、`migration-order-before.txt`、`migration-order-after.txt` | 已识别所有同名 identity、跨模块排序变化和显式前置依赖；每个冲突已有书面处置结论 |
| 两个 priority DI | `registration-before.json` 中的 DI 最终解析结果，以及方案内明确的新 binding | `AgentExecuteInterface` 必须最终解析到 `App\Application\SuperMagic\Message\Event\Subscribe\SuperAgentMessageSubscriberV2`，`SuperAgentMessageInterface` 必须最终解析到 `App\Domain\SuperMagic\Message\Chat\DTO\Message\ChatMessage\SuperAgentMessage`；同时记录主工程 fallback，禁止继续依赖 ConfigProvider 加载顺序隐式覆盖 |
| 有效注册快照 | `registration-before.json` | Route、DI、Listener、Consumer、Crontab、Command、RPC、ErrorCode、Migration 均取框架最终生效结果，而非只扫描源码声明 |
| 外部 vendor 隐式引用 | `external-vendor-references.csv` 和 `legacy_class_aliases.php` | 所有有效旧 FQCN 均存在逐类映射；移除旧包 Provider 后 billing-manager、enterprise-service 监听器可以被容器实例化 |

开工评审记录必须同时包含冻结分支 HEAD、产物生成命令或脚本版本、生成时间和校验结果。迁移过程中如果旧模块发生紧急修复，必须重新生成上述基线并再次通过门禁，不能继续使用过期清单。

Migration 门禁必须由脚本自动判定，而不是仅人工检查文件数。脚本至少需要断言：迁移前后 Super Magic identity 集合完全相等且唯一、同 identity 冲突只有已确认的 canonical 文件、迁移前已经执行的 identity 与迁移后 pending 集合交集为空、迁移后只剩根 `migrations/` 一个注册路径。任一断言失败都必须退出非零并阻断开工或发布。

### 3.2 迁移清单

| 类型 | 数量 | 统计口径 |
|---|---:|---|
| HTTP/API 接口 | **357 个** | `config/routes-v1/*.php` 中实际注册的 `Router::get/post/put/patch/delete...` 路由 |
| API Handler 类 | **49 个** | 上述路由涉及的去重后的 API 类 |
| 定时任务 | **8 个定义** | `#[Crontab]` 注解类 |
| 当前启用定时任务 | **7 个** | `MessageCompensationCrontab` 明确配置了 `enable: false` |
| RabbitMQ 消费者 | **7 个** | `#[Consumer]` 注解类 |
| 迁移前有效事件监听器 | **18 个注册** | 17 个 `#[Listener]` 注解类，加上 `AddRouteListener`；迁移后删除 `AddRouteListener` 注册，仅保留 17 个注解 Listener |
| 数据库 Migration | **182 个文件** | `vendor/dtyq/super-magic-module/migrations/*.php` 下的建表、字段变更、索引、数据回填和初始化迁移 |
| 模块测试类 | **33 个验证输入** | `vendor/dtyq/super-magic-module/tests/**/*Test.php`；允许临时迁入或通过临时映射执行，验证结束后删除新增测试文件 |

此外还需要迁移或重新注册：

- Application Service、Domain Service。
- Repository Interface、Repository 实现和 Model。
- Command、Crontab、Consumer、Event Subscriber。
- Sandbox、SandboxOS、文件转换和批量下载等 Infrastructure 实现。
- 路由、配置、错误码、语言包和 Agent/Skill 模板。
- Migration 文件需要整体迁移到主工程根 `migrations/`，保留原文件名、时间戳和 migration identity。迁移前必须检查与主工程现有 Migration 是否重名；当前分支已确认存在 1 个同名 identity：`2026_07_07_120000_create_magic_super_agent_micro_apps_table`。主工程与 vendor 文件 SHA-256 均为 `e731d8ff1ea6f2d4c9ae7b535f78ed59263fae8c992d984981de75fac4ffd333`，内容完全一致，因此保留主工程现有文件作为唯一 canonical 文件，迁移时不得再次复制或注册 vendor 中的同名文件。
- 模块自身 33 个测试类作为迁移验证输入使用。可以临时复制到主工程测试目录并切换 namespace，也可以通过临时 bootstrap 映射执行；按交付要求，验证结束后必须删除本次新增的测试文件，不作为最终交付物。主工程原有测试中因 FQCN 迁移产生的必要修改仍需保留。

Migration 迁移不能只复制“建表”文件，还需要覆盖后续的字段变更、索引调整、数据回填、初始化数据和历史兼容逻辑。迁移时要确保：

- 已在线上执行过的 Migration 不会因为目录变化而重复执行。
- 新环境可以从零完整执行全部 Super Magic Migration。
- 存量环境只执行未完成的 Migration，不改变已有 migration 记录。
- 所有 Migration 只通过一个路径注册，不能同时保留 vendor 和主工程两套 migration path。
- Migration 中引用的 Model、表名、字段名和数据转换逻辑保持不变。

#### 3.2.1 Migration 身份、顺序和防重复执行

Hyperf 以 Migration 文件名的 basename（去掉 `.php`）作为 migration identity，目录路径不参与已执行判断。因此将文件从 vendor 目录移动到主工程根 `migrations/` 时，必须原样保留 182 个文件名；只要 migration identity 与存量 `migrations.migration` 记录一致，目录变化不会导致已执行 Migration 再次执行。

迁移前生成并纳入 MR：

```text
docs/migration/super-magic/migrations-before.txt
docs/migration/super-magic/migrations-after.txt
docs/migration/super-magic/migration-order-before.txt
docs/migration/super-magic/migration-order-after.txt
```

其中：

- `migrations-before.txt`：182 个原始文件的文件名、migration identity 和文件 SHA-256。
- `migrations-after.txt`：迁入根目录后的文件名、migration identity 和文件 SHA-256。
- `migration-order-before.txt`：当前“主工程 Migration 全部执行后，再执行 vendor Migration”的完整顺序。
- `migration-order-after.txt`：迁入根目录后默认 `migrate` 按 migration identity 全局排序的完整顺序。

必须满足：

1. 迁移前后 182 个 Super Magic migration identity 必须完整对应；其中 181 个文件从 vendor 迁入，已存在且完全相同的 `2026_07_07_120000_create_magic_super_agent_micro_apps_table` 复用主工程 canonical 文件。除该已确认重合项外，其余文件名、identity 和文件 SHA-256 必须一致；namespace/import 调整确需修改 Migration 内容时，必须单独列出差异并证明仅为类引用替换。
2. 除上述 1 个已确认且哈希一致的 canonical 重合项外，不得存在其他 Super Magic migration identity 与主工程 Migration 重名。复制工具必须在目标文件已存在时比较 SHA-256：完全一致则跳过复制并记录，内容不同则立即失败，禁止覆盖或自动改名。
3. 存量环境不得修改、删除或重新插入已有 migration 记录，也不得修改其 batch。
4. 发布前从生产同结构的存量库导出 `migrations.migration`，确认所有已执行的 Super Magic identity 均能在迁移后的根目录找到同名文件。
5. 在存量库副本上执行默认 `migrate --pretend`；输出中不得包含任何已经存在于 `migrations` 表的 Super Magic Migration。若该环境已执行全部 Migration，应输出 `Nothing to migrate`。
6. 新版本只允许根 `migrations/` 注册这 182 个文件；Composer `extra.hyperf.migrate` 和其他自定义 path 中不得再出现 `super-magic-module/migrations`。
7. `migrate:vendor` 可以继续服务其他 Composer 包，但其合并配置和执行输出中不得再出现 `dtyq/super-magic-module`。
8. 发布完成后再次执行默认 `migrate --pretend`，确认不存在本次已执行 Migration 的重复 pending 项。

迁移后的根目录应只存在 **182 个 Super Magic migration identity 对应的 182 个唯一文件**，而不是在现有文件基础上机械新增 182 个文件。本次预期物理新增 181 个文件、复用 1 个已存在的 canonical 文件；任何同 identity 双文件或双路径注册都必须阻断发布。

存量库防重复验收不能只比较文件数量，需要同时保存以下证据：

```text
迁移前 migrations 表中的 Super Magic identity 集合
= 迁移后默认 migrate 识别为 already-ran 的 Super Magic identity 集合

迁移后 pending Super Magic identity 集合
= 迁移前尚未执行的 Super Magic identity 集合
```

当前部署流程先执行主工程 `migrate`，再执行 `migrate:vendor`。迁入根目录后，空库会按文件名将主工程与 Super Magic Migration 统一排序，整体顺序可能与原两阶段流程不同。因此还必须：

- 对比 `migration-order-before.txt` 和 `migration-order-after.txt`，识别跨模块相对顺序变化。
- 分别使用原两阶段流程和迁移后的默认流程初始化空库，对比最终表、字段、索引、约束和初始化数据。
- 发现顺序依赖时，在合并前修复 Migration 的显式前置条件或部署迁移编排；不得通过修改已经发布过的 migration identity 规避问题。
- 核验 `AUTO_MIGRATION` 策略。由于主工程 `CustomMigrator` 在 `AUTO_MIGRATION=false` 时仍会记录 migration identity，migration 记录存在不等于 Schema 已实际执行；此类环境必须额外完成关键表、字段和索引检查。

#### 3.2.2 ConfigProvider 和运行时注册迁移清单

`super-magic-module` 的 `ConfigProvider` 和 Composer `extra.hyperf` 不只是负责代码自动加载，还负责 DI、监听器、命令、扫描路径、Migration 和语言资源注册。迁移时需要逐项建立旧注册项到新注册位置的映射：

| 注册类型 | 旧来源 | 新注册位置 | 验收方式 |
|---|---|---|---|
| DI dependencies | 模块 `ConfigProvider` | `config/autoload/dependencies.php` | 输出 interface → implementation 快照 |
| dependencies priority | 模块 `ConfigProvider` | `config/autoload/dependencies.php` 中的最终直接 binding | 验证容器最终解析实现 |
| Listener | `ConfigProvider` / `#[Listener]` | 主工程 Annotation 扫描路径 | Listener 类清单对比 |
| RabbitMQ Consumer | `#[Consumer]` | 主工程 Annotation 扫描路径 | Consumer、queue、routing key 清单对比 |
| Crontab | `#[Crontab]` | 主工程 Annotation 扫描路径 | class、name、rule、enable 状态对比 |
| Command | `ConfigProvider` / 注解 | `app/Command` 或对应 SuperMagic Application 目录 | CLI 命令列表对比 |
| HTTP Route | `AddRouteListener`、模块 routes | `config/routes-v1/*.php` | method、URI、Handler 快照对比 |
| RPC Service | `#[RpcService]` / `#[RpcMethod]` | 主工程 RPC 扫描路径 | service name、method name 清单对比 |
| Migration | Composer `extra.hyperf.migrate` | 主工程根 `migrations/` | 使用默认 migrate 命令完成新库和存量库验证 |
| Language | Composer `storage-languages` | 合并到主工程 `storage/languages/<locale>/` | 多语言错误码、文案及同名翻译合并结果验证 |
| Agent/Skill Template | vendor storage | `storage/agent_template/` | 初始化和发布场景验证 |

迁移交付中必须提供一份实际的注册快照。代码文件已经移动但注册项未被新应用发现，不视为完成迁移。

模块当前通过 `dependencies_priority` 覆盖两个主工程默认 binding，删除 ConfigProvider 前必须将最终 binding 显式写入主工程依赖配置：

| Interface | 当前主工程 fallback | 迁移后的最终实现 |
|---|---|---|
| `App\\Domain\\Chat\\Event\\Agent\\AgentExecuteInterface` | `MagicAgentEventAppService` | 逐类映射清单中迁移后的 `SuperAgentMessageSubscriberV2` |
| `App\\Domain\\Chat\\DTO\\Message\\ChatMessage\\SuperAgentMessageInterface` | `UnknowChatMessage` | 逐类映射清单中迁移后的 `SuperAgentMessage` |

验收时不能只检查配置数组，需要从容器实际 `get()` 两个 Interface，断言解析到清单中的新 FQCN，并执行 Agent 消息触发和 Super Agent Card 反序列化 Smoke Test。

#### 3.2.3 有效注册快照

迁移前后统一生成：

```text
docs/migration/super-magic/registration-before.json
docs/migration/super-magic/registration-after.json
```

快照记录框架最终生效的注册结果，而不是简单统计源码中的注解或 ConfigProvider 数组：

- Route：method、URI、Handler、middleware、group prefix、route name/options 和注册顺序。
- DI：Interface、容器最终解析实现及其来源，特别包含两个 priority binding。
- Listener：event、Listener class、priority；以 `event + class` 去重。
- Consumer：class、exchange、queue、routing key、nums、enable、QoS、retry 和并发相关参数。
- Crontab：class、name、rule、enable、callback、singleton、mutex pool 和执行参数。
- Command：命令名和 class。
- RPC：service name、method name、Handler class 和 method。
- ErrorCode：Enum class 和允许范围。
- Migration：注册路径、identity、pending/already-ran 状态。

`ProjectOperatorLogSubscriber`、`SandboxKeepAliveCleanupSubscriber`、`FileRecycleBinSubscriber`、`CustomAiAbilitySubscriber` 和 `ImageModelVersionListAddDynamicConfigSubscriber` 当前既出现在 ConfigProvider listener 配置中，又带有 `#[Listener]`。迁入 `app/` 后统一只保留 Annotation 注册，不再复制到 `config/autoload/listeners.php`；`CustomAiAbilitySubscriber` 的 priority 必须保持为 `2`。

`AddRouteListener` 不再作为 Listener 注册，路由统一由主工程 `config/routes.php` 加载 `config/routes-v1/`。注册快照必须证明同一 `event + Listener class`、同一 Consumer queue 和同一 Crontab name 均不存在重复 owner。

#### 3.2.4 原子交付范围

以下内容必须在同一个迁移 MR 中完成，并作为一个完整版本发布：

1. 代码移动到最终业务域目录。
2. 模块内部 namespace 和 import 全量修改。
3. magic-service 调用方 import 全量修改。
4. 路由、DI、Listener、Consumer、Crontab、Command 和 RPC 注册切换。
5. Migration、语言包和 Agent/Skill 模板迁移。
6. 使用模块自身测试完成临时验证，以及 Composer、PHPStan、PHPUnit、CI 和 Docker 配置修改；最终删除本次新增的测试文件。
7. 删除 `dtyq/super-magic-module` Composer 依赖。
8. 删除全部运行时 vendor 路径引用和旧模块源码。

本次原子交付不包含无效代码、无效 API、废弃类或废弃方法清理，也不主动调整业务实现。发现的清理项只记录到后续迁移清单，不在本 MR 中删除。

为便于审查，迁移分支内部可以拆分多个 Git commit；这些 commit 不允许分别合并主干或分别发布。

### 3.3 迁移后的业务域

Super Magic 统一按以下业务域管理：

- **Workspace**：工作区、工作区版本、工作区与项目关系。
- **Project**：项目管理、项目成员、项目协作、项目操作日志、项目复制。
- **Topic**：话题、话题状态、话题与项目关系、话题调度。
- **Task**：任务、任务状态、任务文件、沙箱、Warm Pool、任务初始化，以及面向任务执行编排的 `TopicTaskAppService`。
- **Message**：任务消息、消息队列、消息调度、消息补偿、消息处理。
- **File**：TaskFile、MagicFS、文件管理、文件编辑、文件版本、文件转换、批量下载；Application 层中的 MagicFS 用例与普通 File 用例平级，不再建立单独的 `File/MagicFS` 应用目录。
- **Agent**：数字员工、Agent 市场、Playbook、MagicClaw、Agent 权限。
- **Skill**：Skill、Skill 版本、Skill 市场、Skill 发布和 Skill 权限。
- **Common**：Share 分享、RecycleBin 回收站、Collaboration 协作者、跨域资源访问策略。

Admin API 并入 `magic-service` 现有的 Admin 目录，不作为 `Interfaces/SuperMagic` 下的普通用户 API 管理。

### 3.4 迁移后的目录结构

以下只列新增或迁移后需要关注的目录，不重复展开主工程已经存在的通用目录。

```text
backend/magic-service/
├── config/
│   ├── routes-v1/
│   │   ├── super-magic.php
│   │   ├── super-magic-open-api.php
│   │   ├── super-magic-internal.php
│   │   ├── super-magic-agent.php
│   │   ├── super-magic-share.php
│   │   ├── super-magic-skill.php
│   │   ├── super-magic-magicfs.php
│   │   └── super-magic-recycle-bin.php
│   └── autoload/
│       └── super-magic.php
│
├── app/
│   ├── Interfaces/
│   │   ├── SuperMagic/
│   │   │   ├── Workspace/
│   │   │   ├── Project/
│   │   │   ├── Topic/
│   │   │   ├── Task/
│   │   │   ├── Message/
│   │   │   ├── File/
│   │   │   ├── Agent/
│   │   │   ├── Skill/
│   │   │   └── Common/
│   │   │       ├── Share/
│   │   │       ├── Collaboration/
│   │   │       └── RecycleBin/
│   │   └── Admin/
│   │       └── SuperMagic/
│   │           ├── Agent/
│   │           └── Skill/
│   │
│   ├── Application/
│   │   └── SuperMagic/
│   │       ├── Workspace/
│   │       ├── Project/
│   │       ├── Topic/
│   │       ├── Task/
│   │       │   ├── Command/
│   │       │   ├── Crontab/
│   │       │   └── Event/
│   │       ├── Message/
│   │       │   ├── Command/
│   │       │   ├── Crontab/
│   │       │   └── Event/
│   │       ├── File/
│   │       │   └── Service/
│   │       │       ├── FileManagementAppService.php
│   │       │       ├── FileConverterAppService.php
│   │       │       └── MagicFSFileAppService.php
│   │       ├── Agent/
│   │       │   ├── Command/
│   │       │   ├── Event/
│   │       │   └── Initializer/
│   │       ├── Skill/
│   │       │   ├── Event/
│   │       │   └── Initializer/
│   │       └── Common/
│   │           ├── Share/
│   │           ├── Collaboration/
│   │           └── RecycleBin/
│   │               ├── Command/
│   │               └── Crontab/
│   │
│   ├── Domain/
│   │   └── SuperMagic/
│   │       ├── File/
│   │       │   ├── DTO/
│   │       │   │   └── UpsertProjectFileNodeDTO.php
│   │       │   └── Service/
│   │       │       ├── MagicFSFileDomainService.php
│   │       │       ├── TaskFileDomainService.php
│   │       │       └── UpsertProjectFileNodeDTO.php
│   │       ├── Workspace/
│   │       ├── Project/
│   │       ├── Topic/
│   │       ├── Task/
│   │       ├── Message/
│   │       ├── Agent/
│   │       ├── Skill/
│   │       └── Common/
│   │           ├── Share/
│   │           ├── Collaboration/
│   │           └── RecycleBin/
│   │
│   └── Infrastructure/
│       └── SuperMagic/
│           ├── Database/
│           ├── Sandbox/
│           ├── File/
│           ├── ExternalAPI/
│           └── Utils/
│
├── migrations/
│   └── <Super Magic Migration 文件直接放在根目录>
│
└── storage/
    ├── languages/
    │   └── <locale>/
    └── agent_template/
        ├── custom_agent/
        ├── custom_skill/
        └── magic_claw/
```

### 3.5 各目录职责

目录职责按主工程现有分层保持不变：

- `Interfaces/SuperMagic`：API、DTO、FormRequest、Assembler 和协议适配。
- `Application/SuperMagic`：用例编排、事务、事件发布、Command、Crontab、Consumer、Subscriber。
- `Domain/SuperMagic`：Entity、ValueObject、DomainService、DomainEvent、Repository Interface。
- `Infrastructure/SuperMagic`：数据库实现、Sandbox、文件转换、外部 API 和技术工具。
- `Interfaces/Admin/SuperMagic`：Super Magic 后台 API，复用 magic-service 现有 Admin 体系。

Admin API 放在现有后台接口体系下：

```text
app/Interfaces/Admin/SuperMagic/
├── Agent/
├── Skill/
├── DTO/
└── Assembler/
```

这样可以统一复用后台鉴权、菜单、权限和审计机制。

### 3.6 难以归类或影响面较大的内容

以下内容不能只按文件名直接搬迁，需要单独做归属判断：

| 内容 | 建议归属 | 迁移注意事项 |
|---|---|---|
| `SuperAgent` 下的 TaskFile、ProjectFile、Sandbox 文件处理 | `File` | 统一归入 Super Magic File 业务域。Task、Speech、Design、KnowledgeBase 通过 File 提供的 Application/Domain 能力访问文件，应保留一个权威模型和 Repository，不能复制两份 |
| MagicFS、FileCollection、文件转换、批量下载 | `File` | MagicFS 和 FileCollection 都是文件能力，不应再建立 `File/MagicFS` 或 `File/FileCollection` 目录；Application/Domain 分别按 Service、Entity、Repository 等技术层次收平到 `SuperMagic/File`，外部存储和 SandboxOS 实现放 Infrastructure |
| MessageQueue、MessageSchedule、补偿逻辑 | `Message` | 既涉及 Task，又有独立队列和调度生命周期，不能散落到 Topic 或 Task |
| `SuperAgentMessage`、`SuperMagicChunk` 等 Chat 消息 DTO | `SuperMagic/Message` | 统一归入 Super Magic Message 业务域；主工程 Chat 链路通过明确的 DTO/Assembler 或接口使用，不能在 `Domain/Chat` 再保留一份同义模型 |
| Share、Collaboration、RecycleBin | `Common` | 作为跨 Project、Topic、File 的资源能力，不能放进单一业务域 |
| Agent 与 Skill 市场、版本、发布和初始化 | `Agent` / `Skill` | 两者分别有实体、权限、市场和初始化流程，不建议合并 |
| Sandbox、WarmPool、ASR、文件转换 | `Task` 的应用能力 + `Infrastructure/SuperMagic` | 不要把外部 SDK 或网络调用直接放进 Domain |
| `ConfigProvider`、路由装配、错误码和语言包 | 主工程配置体系 | 这是运行时注册，不属于某个业务域，必须作为迁移切换步骤单独处理 |

其中最重要的是 `TaskFile`、Chat 消息 DTO 和 `ConfigProvider`：它们会被多个主工程模块或运行时机制引用，不能按目录复制后再慢慢修。归属规则明确为：文件相关模型统一由 `SuperMagic/File` 管理，Super Magic 消息模型统一由 `SuperMagic/Message` 管理。

### 3.7 业务依赖和迁移顺序

以下顺序是迁移分支内部的编码和依赖处理顺序，不是分批合并或分批上线顺序。所有业务域最终必须在同一个 MR 中一次性完成切换：

```text
公共 Contract / DTO / ErrorCode
        ↓
Workspace
        ↓
Project / ProjectMember
        ↓
File / MagicFS
        ↓
Topic
        ↓
Task / Sandbox
        ↓
Message / Queue / Schedule
        ↓
Share / Collaboration / RecycleBin
        ↓
Agent
        ↓
Skill
        ↓
Admin API
        ↓
Command / Crontab / Consumer / Subscriber
        ↓
删除旧模块注册
```

每个业务域迁移时，应迁移完整的最小闭包：

```text
API
 → DTO / FormRequest / Assembler
 → Application Service
 → Domain Service / Entity
 → Repository Interface
 → Repository Implementation / Model
 → Config / ErrorCode / Event
```

不允许只迁移 API 文件而把业务逻辑留在旧模块。迁移分支在合并前必须完成所有业务域的完整闭包，不能以半迁移状态进入主干。

### 3.8 迁移期间的开发管理

本次迁移不存在过渡期或共存期。迁移过程中必须避免其他同事继续基于旧模块开发新功能，否则会产生旧目录新增代码未迁移、新目录代码被覆盖等问题。

执行前需要建立一个短期迁移窗口，并明确以下规则：

1. 迁移范围内的 `super-magic-module` 进入代码冻结，不再接受新功能开发。
2. 仅允许紧急 bugfix；bugfix 必须同步记录到迁移后的目标目录。
3. 在团队公告中明确旧模块停止开发的时间、迁移分支和负责人。
4. 迁移期间每天比较旧模块基准提交与当前提交，确认没有新增或遗漏代码。
5. 旧模块只作为迁移输入源存在，禁止作为新功能开发入口，也不参与新版本运行时注册。
6. 路由、DI、Crontab、Consumer、Subscriber 和 Migration 只允许在迁移负责人维护的 MR 中统一切换。
7. 迁移 MR 合并前再次冻结相关主干变更，并将冻结开始后发生的紧急修复统一补入迁移分支。

### 3.9 本次不处理的内容

本次迁移只处理以下机械等价变更：

- 文件和目录移动。
- 文件名、namespace 和 import 调整。
- 配置 class-string、注解扫描路径和运行时注册切换。
- Composer 依赖、Migration、语言包、模板和测试目录迁移。

本次不删除类、DTO、Service、API、Command、Listener、Consumer、Crontab 或 Migration，也不修改类和方法的业务实现。即使迁移过程中发现疑似无效代码，也只记录文件路径、引用扫描和注册状态，留待下一次独立迁移评审和处理。

### 3.10 发布方式约束

代码在一个 MR 中一次合并，并不自动代表运行环境不存在新旧实例同时运行。发布前需要确认滚动发布期间数据库、RabbitMQ、Redis、IPC、Sandbox 回调和定时任务是否能够兼容新旧实例。

本次迁移原则上采用统一发布窗口：

1. 暂停 Super Magic 相关需求发布。
2. 必要时暂停消息入口、Consumer 和 Crontab。
3. 完成全部 magic-service 实例替换。
4. 执行启动级和注册快照检查。
5. 恢复消息入口、Consumer 和 Crontab。

如果不能证明滚动发布期间的新旧实例完全兼容，则不得使用普通滚动发布，必须采用维护窗口完成一次性实例替换。

## 四、构建影响

### 4.1 预期收益

迁移完成后，Super Magic 代码由 `magic-service` 统一管理，发布链路不再需要为每个功能额外安装或更新独立 Composer 扩展包：

```text
magic-web => magic-service => super-magic
```

预期收益包括：

- 减少测试、预发布和生产阶段的额外 `composer update`。
- 减少扩展包版本冲突。
- AI 和研发人员可以直接在主仓库定位、修改和回滚代码。
- 路由、配置、业务代码和测试可以在同一个变更集中审查。

### 4.2 构建流程需要调整的内容

迁移后需要检查并调整：

1. 根 `composer.json` 的 PSR-4 autoload 和全部新 `App\...\SuperMagic` namespace。
2. 在本次原子切换中删除 `composer.json` 中的 `dtyq/super-magic-module` 依赖；项目或构建流水线生成 `composer.lock` 时，生成结果中也不得包含该包。本仓库当前不提交根 `composer.lock`，本地验证临时生成的 lock 必须在交付前删除。
3. 在根 `composer.json` 显式增加 `symfony/yaml: ^6.4 || ^7.0`，承接迁移后 `FrontmatterParser` 和 Skill 配置解析能力。
4. Hyperf `ConfigProvider` 的加载方式。
5. `config/autoload/super-magic.php` 的配置路径和注册方式。
6. 路由加载器不再依赖 `vendor/dtyq/super-magic-module/config/routes.php`。
7. 182 个 Super Magic migration identity 最终统一由主工程根 `migrations/` 承载：迁入 181 个文件并复用 1 个已存在且哈希一致的 canonical 文件，不使用子目录和额外 migrate path。
8. 各语言文件合并到主工程 `storage/languages/<locale>/`；Agent/Skill 模板迁移到与 `languages/` 平级的 `storage/agent_template/`，运行时代码统一从该目录读取，不再保留 `storage/super-magic/` 包装层。
9. Application 层的 MagicFS 用例与 File 用例统一放在 `app/Application/SuperMagic/File/Service/`；Domain 层的 MagicFS 服务和 DTO 统一收平到 `app/Domain/SuperMagic/File/Service/` 与 `app/Domain/SuperMagic/File/DTO/`；FileCollection 的 Entity、Repository、Model、Persistence、DomainService 也分别收平到 `app/Domain/SuperMagic/File/Entity/`、`Repository/`、`Service/`，不保留 `File/FileCollection/`；`TopicTaskAppService` 按职责归入 `app/Application/SuperMagic/Task/Service/`，不放在 `Topic/Service/`。Interfaces 层保留 `Interfaces/SuperMagic/File/MagicFS` 的 API/DTO 语义边界，避免把接口 URI 和协议目录混入本次领域层收平。
   - 当前旧模块存在两个同名但契约不同的 `UpsertProjectFileNodeDTO`（`Domain/MagicFS/DTO` 与 `Domain/MagicFS/Service`，后者额外包含 `isHidden`）；迁移阶段分别落到 `File/DTO` 与 `File/Service`，通过逐类映射和兼容 alias 保持行为不变，后续再单独评估 DTO 合并，不能在本次目录收平中隐式覆盖其中一个契约。
10. `runtime/container` 清理和容器重新编译。
11. 33 个模块测试类通过临时目录或临时 bootstrap 执行迁移后验证，并调整必要的 PHPStan、PHPUnit、代码格式化和 CI 配置；验证后删除新增测试文件。
12. Docker 镜像构建中不再依赖旧 vendor 包的源码路径。
13. 生成并校验逐类映射、Migration identity/顺序和有效注册快照；这些基线文件与迁移代码一起进入 MR。
14. 核验 `shell:locker migrate`：默认 `migrate` 负责根目录中的 Super Magic Migration，后续 `migrate:vendor` 只处理仍然存在的其他 Composer 包，执行输出不得再包含 `dtyq/super-magic-module`。

### 4.3 构建风险

- 迁移后残留旧目录或旧 namespace，造成类加载失败。
- `ConfigProvider`、路由或监听器的注册映射遗漏。
- 删除 Composer 依赖后，模块间原本间接提供的三方依赖不再可用。
- migration 重复注册或新环境无法发现迁移。
- Migration 移入根目录后与主工程 Migration 的全局排序发生变化，导致空库初始化前置条件变化。
- 存量环境 migration identity 已记录但 Schema 未实际执行，导致迁移后继续被判断为 already-ran。
- 语言包合并时同名 group/key 的覆盖顺序发生变化。
- 资源路径仍然硬编码为 `vendor/dtyq/super-magic-module`。
- 发布窗口内部分实例仍使用旧版本，导致消费者、定时任务或序列化协议行为不一致。
- 生产镜像与本地目录结构不一致。

### 4.4 构建验收

至少需要验证：

- `composer dump-autoload -o` 成功。
- 根 `composer.json` 不再依赖 `dtyq/super-magic-module`；如构建流水线生成 `composer.lock`，生成结果中也不得包含该包。
- 根 `composer.json` 显式声明兼容版本的 `symfony/yaml`；如构建流水线生成 `composer.lock`，生成结果必须锁定兼容版本。
- `docs/migration/super-magic/class-map.csv` 覆盖全部旧 Class、Interface、Trait 和 Enum，且一对一映射校验通过。
- 除自动生成的 `legacy_class_aliases.php` 外，`rg -n 'Dtyq\\SuperMagic|vendor/dtyq/super-magic-module' app config test migrations` 无运行时代码结果；兼容层覆盖 `external-vendor-references.csv` 中全部有效引用。
- Hyperf 容器成功编译。
- 路由的 method、URI、Handler、middleware、group、options 和注册顺序与迁移前一致。
- DI 关键接口迁移前后解析到相同实现；`AgentExecuteInterface` 和 `SuperAgentMessageInterface` 必须解析到逐类映射清单指定的新实现。
- `registration-before.json` 和 `registration-after.json` 中 DI、Listener、Command、Crontab、Consumer、RPC、ErrorCode 和 Migration 的有效注册结果一致，且不存在重复 owner。
- 迁移前后 182 个 Super Magic Migration 的文件名、identity 和允许范围内的文件内容校验一致；除已确认哈希一致并复用主工程文件的 canonical 重合项外，不存在其他重名。
- 在存量库副本上执行默认 `migrate --pretend`，已执行的 Super Magic Migration 不得再次出现在 pending 列表。
- 存量库迁移前后的 `migrations` 表中，既有 Super Magic migration identity 和 batch 保持不变。
- 使用不带 `--path` 的默认 migrate 命令时，空库可以发现并完整执行全部 182 个 Super Magic Migration。
- 原两阶段空库初始化与迁移后默认初始化的最终 Schema、索引、约束和初始化数据一致。
- `migrate:vendor` 的配置和输出中不再出现 `dtyq/super-magic-module`。
- 存量数据库不会重复执行已完成迁移。
- 33 个模块测试类已作为迁移验证输入执行；本次新增或临时复制的测试文件已经删除，主工程原有测试仍可由 PHPUnit 配置发现和执行。
- 合并后的语言包在全部现有 locale 下能够读取，重点校验同名 group/key 的最终值。
- Docker 镜像内不存在运行时必需但未复制的 vendor 资源。
- 统一发布窗口内完成全部实例替换，不保留旧版本实例。

## 五、测试影响点

### 5.1 API 回归

API 回归依赖现有的接口自动化测试脚本执行，不在本方案中重新设计 357 个接口的人工测试用例。

迁移前先保存一份自动化脚本执行基线，迁移后使用相同环境、账号和测试数据重新执行，关注：

- 自动化脚本整体通过率不能下降。
- 路由不存在、Handler 无法实例化、DI 解析失败等迁移类问题必须归零。
- Open API、Internal API、Sandbox API 和 Admin API 使用各自已有的自动化测试集合。
- 对自动化脚本未覆盖的接口，根据路由扫描结果补充到后续测试治理清单，不阻塞目录迁移方案本身。

### 5.2 Application/Domain 回归

重点验证：

- Workspace、Project、ProjectMember、Topic、Task 生命周期。
- Task 与 Sandbox 创建、回调、停止、清理。
- TaskFile、MagicFS、文件版本和文件转换。
- MessageQueue、MessageSchedule、消息补偿和幂等。
- Agent、Skill、市场、发布和权限。
- Share、Collaboration、RecycleBin 的访问控制和恢复流程。

### 5.3 异步任务回归

异步任务不需要平均覆盖所有 Consumer 和 Listener，优先验证以下三个主场景：

#### 1. 超级麦吉消息通知

- 用户消息发送后能够正确触发 Super Magic 消息处理和通知。
- 消息状态、任务状态和前端收到的消息顺序与迁移前一致。
- 消息队列、补偿任务和通知订阅者不会重复执行或漏执行。
- 失败重试后不会产生重复消息。

#### 2. 批量拷贝和移动文件

- 批量拷贝、移动文件事件能够正常触发对应 Subscriber。
- 文件记录、目录结构、父子关系、file key 和 Sandbox 文件保持一致。
- 跨项目、跨目录和批量部分失败场景的行为与迁移前一致。
- 同一个事件不会被重复订阅和执行。

#### 3. 发布数字员工和 Skill

- 发布数字员工后，版本、市场记录、技能关联和初始化文件正确生成。
- 发布 Skill 后，版本、市场状态、权限和文件内容正确更新。
- Agent/Skill 发布相关事件订阅者能够正常触发。
- 重复发布、发布失败和重试不会产生重复版本或脏数据。

此外需要确认 8 个 Crontab 的启停状态保持不变：7 个启用，`MessageCompensationCrontab` 继续保持禁用。

### 5.4 数据库和资源回归

- 迁移前后 182 个文件名和 migration identity 一致，存量库既有 identity 和 batch 不变。
- 存量库默认 `migrate --pretend` 的 Super Magic pending 集合只包含迁移前尚未执行的 identity，不包含任何已执行 identity。
- 原两阶段执行顺序和迁移后全局排序均完成空库验证，最终 Schema、索引、约束和初始化数据一致。
- 新库初始化成功。
- 存量库升级成功。
- 关键索引、唯一约束和字段类型不变。
- Agent/Skill 模板可以读取。
- 合并到主工程 `storage/languages/<locale>/` 后，语言包能够通过主工程翻译配置正常加载。
- 文件存储、Sandbox 路径和临时目录行为不变。

### 5.5 Go Engine IPC 回归

当前需要关注的 Go Engine IPC 范围比较小，主要是 Go Engine 在知识库绑定和访问校验时，反向调用 PHP 查询用户对数字员工的权限。

PHP 侧入口是：

```text
App\Interfaces\KnowledgeBase\Rpc\Service\SuperMagicAgentRpcService
```

当前需要保持的三个 RPC 方法是：

```text
svc.knowledge.superMagicAgent.listManageableCodes
svc.knowledge.superMagicAgent.listAccessibleCodes
svc.knowledge.superMagicAgent.listUsableCodes
```

三个方法分别用于：

- `listManageableCodes`：判断用户是否可以管理指定数字员工，主要用于知识库创建、修改和绑定。
- `listAccessibleCodes`：判断用户是否可以访问指定数字员工，主要用于知识库查询和检索。
- `listUsableCodes`：判断用户是否可以实际使用指定数字员工。

迁移后重点验证：

1. `SuperMagicAgentRpcService` 仍然被 Hyperf RPC 扫描和注册。
2. Go Engine 调用上述三个 method 时，不出现 `method not found` 或连接失败。
3. 请求中的 `organization_code`、`user_id`、`agent_codes` 能正确传入迁移后的 `SuperMagicAgentAccessAppService`。
4. 对有权限、无权限和 Agent 不存在三个场景，返回的 code 和 codes 列表与迁移前一致。
5. 创建或修改绑定数字员工的知识库时，管理权限校验仍然生效。
6. 查询知识库和片段检索时，访问权限校验仍然生效。

本次迁移没有修改 Go Engine 代码和 IPC 协议，因此不需要重新设计 IPC；测试目标只是确认 PHP 类迁移后，原有 RPC 服务仍然能够被 Go Engine 调用。

## 六、风险与控制措施

| 风险 | 表现 | 控制措施 |
|---|---|---|
| 重复路由 | 接口覆盖或返回异常 | 路由快照对比，保持单一注册源 |
| 重复订阅 | 消息/事件执行两次 | 每个队列和事件只保留一个 owner |
| DI 覆盖顺序变化 | 注入错误实现 | 迁移前后输出关键 binding 快照 |
| priority DI 丢失 | Agent 消息仍解析到主工程 fallback | 将两个 priority binding 显式写入主工程 dependencies，并验证容器最终解析结果 |
| migration 重复执行 | 表结构或数据被重复修改 | 保留原文件名和 migration identity，不修改既有记录；存量库执行 `migrate --pretend` 验证已执行项不进入 pending |
| Migration 全局顺序变化 | 空库初始化失败或初始化数据不一致 | 对比迁移前后全局顺序，并对原两阶段流程和新默认流程执行空库 Schema/数据对比 |
| migration 已记录但 Schema 未执行 | 迁移后错误跳过实际缺失的表或字段 | 对 `AUTO_MIGRATION=false` 环境执行关键 Schema 检查，不以 migration 记录作为唯一依据 |
| vendor 路径残留 | 线上找不到配置/模板 | 全仓扫描 `vendor/dtyq/super-magic-module` |
| namespace 或目录不匹配 | 类加载失败、容器启动失败 | 全量切换到 `App\...\SuperMagic`，按 PSR-4 校验文件路径和 FQCN |
| 其他 vendor 包仍引用旧 FQCN | billing-manager、enterprise-service Listener 无法实例化，容器启动失败 | 冻结外部引用清单并自动生成惰性 class_alias；启动验证覆盖全部引用，后续推动两个包升级后删除兼容层 |
| 异步任务重复副作用 | 重复补偿、清理、统计 | 分布式锁、幂等键和明确 owner |
| API 行为变化 | 前端回归失败 | 迁移前后接口契约和响应快照对比 |
| 混入非等价业务修改 | 迁移后行为变化且难以定位 | 本次只允许目录、文件名、namespace、引用和注册切换，业务清理由后续 MR 处理 |
| 新旧实例混跑 | 消息、任务和序列化行为不一致 | 统一发布窗口，必要时暂停入口和异步任务 |

## 七、验收与下线标准

本次迁移不设置“先上线新代码、再删除旧模块”的下线阶段。旧模块删除属于同一次原子迁移交付的一部分。合并和发布前必须满足：

1. 所有代码已经移动到最终 `App\...\SuperMagic` 目录和 namespace。
2. 逐类映射清单覆盖全部旧 Class、Interface、Trait 和 Enum，且文件、FQCN、类型和数量校验一致。
3. 所有主工程调用方、测试、配置、注解和字符串类名已经完成替换。
4. 所有路由已切换到主工程目录，method、URI、Handler、middleware、group、options 和注册顺序与基线一致。
5. DI、Listener、Command、Crontab、Consumer、RPC、ErrorCode 和 Migration 的有效注册快照与基线一致；两个 priority DI 解析到迁移后的目标实现，且不存在重复 owner。
6. 182 个 Super Magic migration identity 已统一由主工程根 `migrations/` 下的唯一文件承载，文件名和 identity 保持不变；已确认的 1 个 canonical 重合项只保留主工程现有文件，除此之外不存在其他重名。
7. 存量库 `migrations` 表中的既有 Super Magic identity 和 batch 未被修改；默认 `migrate --pretend` 不会重新执行已完成 Migration。
8. 原两阶段流程和迁移后默认流程的空库最终 Schema、索引、约束和初始化数据一致；`AUTO_MIGRATION=false` 环境已额外完成 Schema 核验。
9. 语言包已合并到主工程 `storage/languages/<locale>/`，Agent/Skill 模板和外部资源路径已切换。
10. Go Engine IPC 回归通过。
11. API 自动化脚本、消息通知、批量文件操作、数字员工和 Skill 发布场景通过。
12. `composer.json`、PHPStan、测试和 Docker 不再依赖旧 Composer 包，根 Composer 已显式声明 `symfony/yaml`；如构建流水线生成 `composer.lock`，生成结果同样不得包含旧包。
13. 主工程业务代码不存在 `Dtyq\SuperMagic` namespace 或 `vendor/dtyq/super-magic-module` 路径；唯一例外是自动生成的兼容别名映射，且其覆盖范围与 `external-vendor-references.csv` 一致。
14. 模块自身 33 个测试类已完成临时迁移验证，本次新增测试文件已经删除；主工程原有测试中的 FQCN 调整保留。
15. 本次 MR 未删除类、方法或 API，未混入业务实现修改。
16. 迁移分支已冻结，主干没有未纳入迁移 MR 的 Super Magic 变更。

### 7.1 原子发布流程

```text
冻结 Super Magic 相关开发和发布
    ↓
执行迁移前快照：逐类映射、路由、DI、异步注册、RPC、Migration identity/顺序、资源路径
    ↓
部署包含全部目录、namespace、配置和 Composer 变更的新版本
    ↓
清理 runtime/container，重建 Composer autoload 和 Hyperf 容器
    ↓
执行启动级检查、注册快照对比和存量库 Migration pending 检查
    ↓
执行 API 自动化和三个核心异步场景回归
    ↓
恢复入口、Consumer 和 Crontab
    ↓
确认全部实例已替换，删除旧模块完成
```

### 7.2 整体回滚要求

回滚必须以完整版本为单位，不允许只回滚某个业务域或只恢复 Composer 包。回滚物必须保持一致：

```text
magic-service 应用代码
+ composer.json / composer.lock
+ 路由和 ConfigProvider 配置
+ Migration 注册配置
+ 语言包、模板和资源文件
```

数据库 Migration 不允许通过回滚旧代码来重复执行。若新版本已经执行了不可逆的数据迁移，必须提前准备独立的数据回滚或前向修复方案。

## 八、模块说明文件

迁移后每个一级业务域建议增加一个简短说明文件，方便研发和 AI 快速理解：

```text
app/
├── Interfaces/SuperMagic/<Domain>/README.md
├── Application/SuperMagic/<Domain>/README.md
├── Domain/SuperMagic/<Domain>/README.md
└── Infrastructure/SuperMagic/<Domain>/README.md
```

最低限度应说明：

- 模块职责和边界。
- 主要入口 API。
- 依赖的 Application/Domain Service。
- 关键 Repository 和数据表。
- 事件、队列和定时任务。
- 不允许依赖的模块。
- 常见修改场景和测试入口。

第一批建议为以下业务域建立 README：

```text
Workspace / Project / Topic / Task / Message / File / Agent / Skill / Common
```
