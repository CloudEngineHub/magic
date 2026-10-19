# 沙箱镜像发布：全量重启沙箱

> 目标：发布一个"必须更新"的沙箱版本时，把仍在跑老镜像的沙箱**无感知**地换掉。
> 不给沙箱发"继续"之类的聊天消息，也不判断沙箱忙不忙。

## 1. 为什么不能"发条消息让 Agent 自己重启"

脚本拿不到"沙箱里到底有没有任务"这个事实。即使拿到了，发一条 `继续` 也不安全：

- Agent 可能正停在"可以这样操作吗？"的提问上，收到 `继续` 会把它当成用户同意并真的执行；
- Agent 可能正在长任务中间，一条新消息会改变它的推理上下文；
- 空闲的沙箱收到 `继续` 会凭空产生一轮对话，用户会看到一条莫名其妙的回复。

所以本方案只做**进程级**动作：删掉旧 pod、按正常初始化流程重建新 pod。
初始化过程（`createSandbox → initAgent → 等 workspace ready`）不会发送任何聊天消息，
用户下次进来时看到的是一个已经跑在新镜像上的沙箱。

## 2. 谁负责什么

| 仓库 | 角色 | 本次改动 |
|---|---|---|
| `sandbox-components`（Go） | 沙箱网关：真正操作 K8s pod、持有当前发布镜像 | `GET /api/v1/sandboxes` 每条记录新增 `agent_image` / `agfs_image` |
| `magic-service`（PHP） | 业务侧：知道话题归属、owner 身份、任务状态 | 新增 `sandbox:restart-all` 命令与编排服务 |
| `super-magic`（Python） | 沙箱内 Agent 运行时 | 无改动：重建走既有初始化路径，仍会恢复历史与启动任务 |

网关的镜像字段是"只重启落后的沙箱"的前提：没有它，脚本只能每次都全量重建。

## 3. 怎么用

只有一个入口，就是 magic-service 的命令；没有额外的包装脚本，
参数、帮助和退出码都以命令自身为准。

```bash
php bin/hyperf.php sandbox:restart-all [选项]
```

```bash
# 1. 先看计划，不动任何东西（永远从这一步开始）
php bin/hyperf.php sandbox:restart-all --dry-run

# 2. 灰度：只重启最老的 20 个话题，4 并发
php bin/hyperf.php sandbox:restart-all --limit=20 --concurrency=4

# 3. 全量
php bin/hyperf.php sandbox:restart-all --concurrency=8

# 4. 只处理 Magic Claw
php bin/hyperf.php sandbox:restart-all --scope=magic-claw

# 查看全部用法与退出码
php bin/hyperf.php sandbox:restart-all --help
```

| 选项 | 说明 |
|---|---|
| `--dry-run` | 只打印计划，不删除、不重建 |
| `--force` | 镜像已是最新也强制重建（例如配置漂移） |
| `--scope=all\|magic-claw` | 处理范围，默认 `all` |
| `--code=<claw-code>` | 只处理某只 Magic Claw（隐含 `--scope=magic-claw`） |
| `--status=<a,b>` | 只看这些状态的 pod，默认不过滤 |
| `--limit=<n>` | 最多重启 n 个话题，按"跑得最久优先" |
| `--concurrency=<n>` | 同时处理多少个话题 |

旧命令名 `magic-claw:restart-sandbox-all` 保留为兼容入口，等价于
`--scope=magic-claw`（并保留历史上的 `--status=Running` 默认值）。

### 3.1 在哪执行

命令就是镜像里已经带上的 `bin/hyperf.php`，因此不需要额外脚本或跳板机，
直接在任意一个 magic-service Pod 里执行即可（该 Pod 已有配置、数据库与网关连通性）：

```bash
kubectl -n <namespace> exec -it deploy/magic-service -- \
  php bin/hyperf.php sandbox:restart-all --dry-run
```

多副本部署时只需在一个 Pod 里跑一次：目标集合来自网关的 pod 清单，
重复执行是幂等的（第二轮所有沙箱都已是最新镜像，计划为空）。

## 4. 判定规则

| 情况 | 结论 | 是否重启 |
|---|---|---|
| 该话题任一 pod 的镜像缺失/不完整 | `ImagesUnknown` | 是（无法证明已最新） |
| agent 镜像与最新不一致 | `AgentImageOutdated` | 是 |
| agfs 镜像与最新不一致 | `AgfsImageOutdated` | 是 |
| 该话题所有 pod 都等于最新镜像 | `UpToDate` | 否 |
| `--force` | `Forced` | 是 |
| 话题缺 owner（user/org 为空） | `TopicOwnerMissing` | 否，记入跳过统计 |

补充规则：

- **同一话题多个 pod**（话题表 `sandbox_id` 与实际 pod 漂移过）→ 全部删除，只重建一个；
- **未绑定温池 pod / 找不到话题的孤儿 pod** → 只删除，不重建；
  `--scope=magic-claw` 时不动它们（属于共享资源）；
- **读不到最新镜像** → 直接失败并提示加 `--force`，不做盲目全量重启。

## 5. 执行顺序（每个话题）

1. 把该话题 `waiting` / `running` / `waiting_for_user` 的任务与话题状态置为 `suspended`；
2. 删除网关清单里属于该话题的**全部** pod（删不掉的记录失败但继续）；
3. 以话题 owner 身份重建沙箱，**优先复用温池**：旧 pod 删掉后探测返回 NOT_FOUND，
   「调用方指定了 sandbox_id」的守卫随之放行，直接领一个现成 pod 挂载，不必从零冷启动；
4. 回写话题与任务的 `sandbox_id`。

第 1 步刻意放在删除之前：现有 `CheckTaskStatusTask` 会周期性检查"任务在跑但沙箱不存在"并把任务标成
`ERROR`，先挂起可以把这类误报压到最低。

第 3 步走温池是重启速度的关键：冷启动要等 pod 调度、镜像拉取与 AGFS sidecar 就绪，
而温池挂载只做 metadata 写入 + mount。**前提是温池由补货流程维持在最新镜像**——
如果刚更新了 ConfigMap 但温池里还是旧 pod，重启会把旧镜像换个话题继续用。
发布窗口内无法保证这一点时，应先等温池补货完成再重启。

## 6. 失败处理

- 单个话题失败不影响其余话题；退出码为 `1`，失败明细逐条打印；
- 删除失败仍会继续重建（否则该话题永远卡在旧镜像），但会计入 `delete_failures`；
- 重建失败的那一条最危险：旧 pod 已删、新 pod 未起，需要按 `topic_id` 人工重跑
  `php bin/hyperf.php sandbox:restart-all --force --limit=...`，或让用户下次进入时自然重建；
- 任何情况下都不会向沙箱发送聊天消息，因此不存在"AI 误解指令"的风险。

## 7. 测试

```bash
# Go：网关字段与清单契约
cd sandbox-components && go test ./pkg/... ./test/...

# PHP：计划生成、编排、CLI 契约（纯单测，无需 DB/网关/协程扩展）
cd magic-service
php vendor/bin/phpunit -c phpunit.unit.xml --testsuite 沙箱重启
```

覆盖点：镜像比较（含同 tag 不同 digest）、缺字段按未知、重复 pod、温池/孤儿、缺少 owner、
Magic Claw 范围过滤、先挂起后删除的顺序、删除失败不阻断重建、进度回调、退出码与 dry-run。

## 8. 运行期观察

执行过程中每完成一个话题就打印一行 `[i/n] [OK|FAIL]`，并每 10 个目标或 30 秒补一行
`progress: ... elapsed ... eta ...`，所以几十分钟的批量能看出是在推进还是卡住。
结束时打印汇总：`restarted / failed / deleted_only / delete_failures / suspended_tasks / elapsed`。

日志沿用 magic-service 的 `sandbox` channel（`[Sandbox][RestartAll]` 前缀），
每一条删除、重建、挂起都带 `topic_id` / `sandbox_id`，可直接用于事后核对。
