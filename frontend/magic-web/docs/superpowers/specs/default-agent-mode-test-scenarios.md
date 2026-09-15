# 默认 Mode / 默认员工（default_agent_code）测试场景文档

> 分支：`feat/support-default-crew`
> 文档版本：2026-07-31
> 范围：组织级默认员工配置、前端解析链路、无效模式兜底、定时任务校验

---

## 1. 背景与分支 Commit 梳理

本功能将原先大量硬编码 `TopicMode.General`（`"general"`）的兜底，逐步替换为后台配置的 `default_agent_code`（组织默认员工/模式）。分支上相关 commit 如下（由早到晚）：

| Commit       | 说明                               | 主要影响                                                                                      |
| ------------ | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `d2bcc5e0db` | Admin 支持组织默认员工配置         | 管理后台 ModeManagement 增加 `default_agent_code` 读写；选项构建、i18n                        |
| `4d5d74863f` | 隐藏 Crew 可见性                   | featured 列表 `is_visible`；ModeToggle 折叠隐藏员工                                           |
| `4db0d6ec5f` | 无效员工兜底 + 定时任务校验        | `DefaultAgentSelectionService`、无效模式 Fallback UI、发送协议归一化、ScheduledTasks 保存拦截 |
| `0d6da0823e` | 隐藏默认员工仍可用                 | `resolveDefaultAgentSelection` 不再因 `is_visible=false` 回退 general                         |
| `9276610b9f` | 非 SMA 平台员工用 plain topic_mode | 仅 `SMA-*` 走 `custom_agent + agent_code`；平台员工 identifier 即 topic_mode                  |
| `2c88e06470` | 无效模式 Fallback UI 样式          | `TopicInvalidModeFallback` 容器高度与背景                                                     |

**工作区未提交（兜底重构，本文档 §8 单独列出）**：`getFallbackTopicModeIdentifier`、`resolveProjectModeForCreate`、移动端/RecordSummary/分享列表等 General 兜底替换。

---

## 2. 核心概念（测试前必须对齐）

### 2.1 三个易混淆概念

| 概念                 | 值/含义        | 用途                                                         |
| -------------------- | -------------- | ------------------------------------------------------------ |
| `TopicMode.General`  | `"general"`    | **终极兜底**：配置缺失、无效、不可用时回退                   |
| `default_agent_code` | 后台配置字符串 | 组织默认员工；来自 featured API `default_agent_code`         |
| `TopicMode.Default`  | `"default"`    | **API 专用**：默认模型列表等，**不是**用户可见的默认选中模式 |

### 2.2 员工类型与协议映射（当前约定）

解析入口：`DefaultAgentSelectionService.resolveDefaultAgentSelection()` / `resolveAgentSelection()`。

| 配置/选中类型    | 示例                           | UI `modeIdentifier`  | 发送 `topic_pattern` | `agent_code`          |
| ---------------- | ------------------------------ | -------------------- | -------------------- | --------------------- |
| 内置模式         | `ppt`、`general`               | 同 identifier        | 同 identifier        | 无                    |
| 非 SMA 平台员工  | `agent-default`                | `agent-default`      | `agent-default`      | 无                    |
| SMA 历史员工     | `SMA-xxx`                      | `SMA-xxx`            | `custom_agent`       | `SMA-xxx`             |
| 历史话题（已有） | topic 存 `custom_agent` + code | 以 `agent_code` 为准 | `custom_agent`       | 原 code（不校验列表） |

### 2.3 优先级（用户侧最终选中 mode）

```
当前话题 topic_mode（后端/前端 patch 已有）
  > 用户本地保存的项目级 mode（ProjectTopicService）
  > 用户本地保存的全局 mode（仍 available 时）
  > resolveDefaultAgentSelection()（平台 default_agent_code，有效时）
  > general（配置无效/缺失时）
```

**首页 RoleStore 约束：**

- 用户显式切换 → `setCurrentRole` → 更新运行态 **并持久化**
- modeList / `default_agent_code` 变化后，RoleStore reaction 重新读取“有效本地偏好 → 平台默认 B → general”
- 本地偏好 C 已下线时：运行态回退平台默认 B；不得仅在视图层静默显示列表第一项
- modeList 与 `default_agent_code` 必须按同一组织、用户、语言缓存；冷启动恢复 modeList 时同步恢复默认 B
- `firstModeIdentifier` 只用于模型列表上下文默认值，**不**负责 RoleSwitcher 选中

### 2.4 可见性 vs 可用性

- **`isModeValid`**：员工是否在 featured 列表中（可不可用）
- **`isModeVisible`**：是否在 ModeToggle 主列表展示（`is_visible !== false`）
- **默认员工**：只要在列表中有效即可作默认，**hidden 仍可用**（`0d6da0823e`）
- **无效模式 Fallback UI**：当前话题 mode 对当前用户 **invalid** 时展示（与 hidden 不同）

---

## 3. 架构与关键模块

```
Admin 配置 default_agent_code
        ↓
Featured API → SuperMagicModeService.defaultAgentCode + modeList
        ↓
DefaultAgentSelectionService（解析默认 / 发送协议）
        ↓
┌───────────────────┬────────────────────┬─────────────────────────┐
│ ProjectTopicService│ messageSendPreparation │ topicService（前端 patch）│
│ 本地存储兜底        │ 发消息 / 建项目         │ 新建话题 mode 继承         │
└───────────────────┴────────────────────┴─────────────────────────┘
        ↓
useTopicMode / RoleStore / ModeToggle / ScheduledTasks / 移动端
```

**核心文件**

| 模块           | 路径                                                              |
| -------------- | ----------------------------------------------------------------- |
| 解析服务       | `src/services/superMagic/DefaultAgentSelectionService.ts`         |
| Featured 模式  | `src/services/superMagic/SuperMagicModeService.ts`                |
| 本地 mode 存储 | `src/services/superMagic/ProjectTopicService.ts`                  |
| 发送准备       | `src/pages/superMagic/services/messageSendPreparation.ts`         |
| 话题 patch     | `src/pages/superMagic/services/topicService.ts`                   |
| 无效模式 UI    | `TopicInvalidModeFallback` + `shouldShowInvalidTopicModeFallback` |
| Admin 配置     | `packages/magic-admin/.../ModeManagement/`                        |

---

## 4. 单元测试场景（已有自动化）

### 4.1 `DefaultAgentSelectionService`（P0）

文件：`src/services/superMagic/__tests__/DefaultAgentSelectionService.test.ts`

#### `resolveDefaultAgentSelection()` — 后台 `default_agent_code`

| #   | 场景                  | 前置条件                                        | 期望结果                                         |
| --- | --------------------- | ----------------------------------------------- | ------------------------------------------------ |
| D1  | 未配置                | `defaultAgentCode` 为 `undefined/null/""/"   "` | `{ general, general }`                           |
| D2  | 配置为 general        | `default_agent_code = "general"`                | 直接 general，且不调用 `isModeValid`             |
| D3  | 配置为内置模式        | 如 `ppt` 且 `isModeValid("ppt")`                | `{ ppt, ppt }`，无 agentCode                     |
| D4  | 配置为非 SMA 平台员工 | 如 `agent-default` 且有效                       | `{ agent-default, agent-default }`，无 agentCode |
| D5  | 配置为 SMA 员工       | 如 `SMA-agent-hidden` 且有效                    | `{ SMA-..., custom_agent, SMA-... }`             |
| D6  | 配置员工不可用        | 不在 featured 列表                              | 回退 general                                     |
| D7  | 配置员工 hidden       | `is_visible=false` 但 `isModeValid=true`        | **仍作默认**，不查 `isModeVisible`               |

#### `resolveAgentSelection()` — 界面 → 发送协议

| #   | 场景                          | 输入                                         | 期望                                 |
| --- | ----------------------------- | -------------------------------------------- | ------------------------------------ |
| A1  | 历史话题 custom_agent         | `(custom_agent, "historical-agent")`         | 保留 custom_agent + code，不校验列表 |
| A2  | UI 传 identifier + agent_code | `("historical-agent", "historical-agent")`   | custom_agent + code                  |
| A3  | 选中非 SMA 平台员工           | `("agent-default")`，且为配置默认            | plain `agent-default`                |
| A4  | SMA 前缀员工                  | `("SMA-user-selected")`                      | custom_agent + SMA code              |
| A5  | mode 为空                     | `()`，配置为 `ppt`                           | 等同配置默认                         |
| A6  | custom_agent 无 code          | `(custom_agent)`，配置为 `SMA-agent-default` | 解析为 SMA 默认                      |
| A7  | 切内置模式 + stale agent      | `(chat, "stale-agent")`                      | chat，清 agent                       |

#### `isAgentSelectionAvailable()`

| #   | 场景                     | 期望                  |
| --- | ------------------------ | --------------------- |
| V1  | general                  | `true`                |
| V2  | 已删除 custom agent      | `false`               |
| V3  | 仍有效的 custom agent    | `true`                |
| V4  | hidden 但 valid 的 agent | `true`（可用 ≠ 可见） |

---

### 4.2 `ProjectTopicService`（P0）

文件：`src/services/superMagic/__tests__/ProjectTopicService.test.ts`

| #   | 场景                        | 期望                                                       |
| --- | --------------------------- | ---------------------------------------------------------- |
| P1  | 读取已保存的项目 mode       | 返回 localStorage 中的值                                   |
| P2  | 本地保存优先于平台默认      | 有 global/project 缓存时用缓存，不用 `configured-agent`    |
| P3  | 无本地缓存时用平台默认      | global/project 均为 `configured-agent`                     |
| P4  | 平台默认不写入 localStorage | 自动 fallback 不持久化                                     |
| P5  | 内置模式作默认              | `default_agent_code = ppt` → global 为 ppt                 |
| P6  | 配置无效                    | 回退 general                                               |
| P7  | 换 org/user                 | 重新加载对应 bucket                                        |
| P8  | custom_agent 校验           | `(custom_agent, configured-agent)` valid；missing 为 false |

---

### 4.3 `messageSendPreparation`（P0）

文件：`src/pages/superMagic/services/__tests__/messageSendPreparation.test.ts`

| #   | 场景                      | 期望                                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------ |
| M1  | 非 SMA 默认员工发首条消息 | topic: `topic_mode=agent-default`；params: `topicMode=agent-default`，无 extra |
| M2  | 从平台员工切到内置 chat   | 清 `agent_code`；extra 仅保留非 agent 字段                                     |
| M3  | 内置默认 ppt 发消息       | `topic_mode=ppt`，清 stale agent_code                                          |
| M4  | 无项目时建项目            | `projectMode=agent-default`；topic 状态 plain identifier                       |
| M5  | 跨项目 stale topic        | 在当前项目 createTopic，不沿用旧 topic                                         |

---

### 4.4 `topicService` 前端 patch（P0）

文件：`src/pages/superMagic/services/__tests__/topicService.test.ts`

| #   | 场景                    | 期望                                            |
| --- | ----------------------- | ----------------------------------------------- |
| T1  | SMA 员工切换            | patch 为 `custom_agent + SMA code`              |
| T2  | 非 SMA 平台员工         | patch 为 `topic_mode=identifier`，无 agent_code |
| T3  | 切内置 general          | 清 agent_code                                   |
| T4  | 后端已返回明确 mode     | 丢弃前端 patch                                  |
| T5  | sessionStorage 短期兜底 | 刷新后可恢复；后端有值后让位                    |

---

### 4.5 `useCreateTopicListener`（P1）

文件：`src/pages/superMagic/components/TopicMode/__tests__/useCreateTopicListener.test.tsx`

| #   | 场景                  | 期望 sourceTopic          |
| --- | --------------------- | ------------------------- |
| C1  | 普通建话题            | 沿用当前 selectedTopic    |
| C2  | ModeToggle 指定 SMA   | `custom_agent + SMA code` |
| C3  | ModeToggle 指定非 SMA | plain identifier          |
| C4  | afterCreate 发消息    | 走现有 pubsub 链路        |

---

### 4.6 无效模式 Fallback（P1）

文件：`shouldShowInvalidTopicModeFallback.test.ts`、`ProjectPageInputContainer.test.tsx`

| #   | 场景                                  | 期望                                  |
| --- | ------------------------------------- | ------------------------------------- |
| F1  | 未配置 fallback 组件                  | 不展示                                |
| F2  | 无 selectedTopic                      | 不展示                                |
| F3  | 空话题 mode 无效                      | 运行态恢复配置默认；不写 localStorage |
| F4  | 有消息的话题 mode 无效且配置 fallback | 展示 `TopicInvalidModeFallback`       |
| F5  | 点击「新建话题」                      | 触发 createTopic / handleCreateTopic  |

---

### 4.7 ModeToggle 隐藏员工（P1）

文件：`modeVisibility.test.ts`、`ModeToggle.test.tsx`

| #   | 场景                    | 期望                            |
| --- | ----------------------- | ------------------------------- |
| H1  | `is_visible=false` 判定 | 仅 explicit false 为 hidden     |
| H2  | 列表分区                | visible 在上，hidden 折叠在底部 |
| H3  | 当前话题用 hidden mode  | 自动展开 hidden 区并高亮        |
| H4  | 手动展开 hidden         | 滚动位置不乱跳                  |

---

### 4.8 Admin 默认员工配置（P2）

文件：`packages/magic-admin/.../__tests__/defaultAgent.test.ts`

| #   | 场景                       | 期望                             |
| --- | -------------------------- | -------------------------------- |
| AD1 | 选项列表                   | 仅 enabled 且非系统默认的模式    |
| AD2 | 无 i18n 名称               | fallback 到 identifier           |
| AD3 | 当前值为 legacy 且不在列表 | 显示 disabled 选项便于管理员识别 |
| AD4 | 当前为系统默认             | 不重复出现在可选项               |

---

### 4.9 `SuperMagicModeService`（P1）

文件：`SuperMagicModeService.test.ts`

| #   | 场景                             | 期望                                     |
| --- | -------------------------------- | ---------------------------------------- |
| S1  | featured 返回 default_agent_code | 存入 `_defaultAgentCode`                 |
| S2  | 刷新 featured                    | 更新 default；stale 配置清除             |
| S3  | 多语言 featured                  | 按语言使用对应 default                   |
| S4  | 冷启动恢复 modeList 缓存         | 同步恢复同 context 的 default_agent_code |

---

### 4.10 首页冷启动生命周期（P0）

文件：`src/services/superMagic/__tests__/SuperMagicModeService.test.ts`

| #   | 场景                           | 期望                            |
| --- | ------------------------------ | ------------------------------- |
| R1  | 本地偏好 C 仍有效              | 选中 C，不被平台默认 B 覆盖     |
| R2  | C 下线、featured 返回默认 B    | RoleStore reaction 运行态回退 B |
| R3  | 缓存列表已删除 C、API 尚未返回 | 从配套缓存恢复 B，首屏直接选 B  |
| R4  | featured 权威返回空列表        | 标记可用性已解析并清除过期偏好  |

---

## 5. 集成 / 手工测试场景（按用户路径）

### 5.1 管理后台（P1）

| #   | 步骤                           | 验证点                                                            |
| --- | ------------------------------ | ----------------------------------------------------------------- |
| MA1 | 设置默认员工为内置 `ppt`       | 保存成功；前端 featured 刷新后新用户默认 ppt                      |
| MA2 | 设置默认员工为非 SMA 平台 mode | 保存成功；前端 ModeToggle 默认选中该 identifier                   |
| MA3 | 设置默认员工为 SMA crew        | 保存成功；发送协议为 custom_agent                                 |
| MA4 | 默认员工被禁用/下线            | 前端回退 general；不应 crash                                      |
| MA5 | 修改为 hidden crew             | 新用户默认仍可用；ModeToggle 主列表不展示但可选中（若从话题进入） |

---

### 5.2 桌面端 — 首页 / 项目页输入框（P0）

| #   | 场景                                  | 验证点                                                                                |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| E1  | 新用户首次进入                        | ModeToggle 显示后台默认（非 general，若已配置）                                       |
| E2  | 无 topic 发首条消息                   | topic_pattern / project_mode 符合 §2.2 映射                                           |
| E3  | 手动切换 mode 后再发                  | 使用选中 mode；project 本地缓存更新                                                   |
| E4  | 话题绑定的员工已过期                  | 输入框显示无效模式 Fallback；可新建话题                                               |
| E5  | 从 Fallback 新建话题                  | 新 topic 使用当前 tab 选中 mode                                                       |
| E6  | 切换内置 mode                         | 不应携带 stale agent_code                                                             |
| E7  | 已选 C，后台默认 B，下线 C 后刷新首页 | RoleSwitcher 选中 B；不是 general / 列表第一项；localStorage 不因自动回退写成 general |
| E8  | C 仍有效时刷新                        | 继续选中 C，不被 B 覆盖                                                               |
| E9  | B 为 hidden 但仍 valid                | C 下线后运行态仍为 B                                                                  |

---

### 5.3 移动端（P1）

| #   | 场景                          | 验证点                                        |
| --- | ----------------------------- | --------------------------------------------- |
| MO1 | 首页选中 C 已下线             | 优先后台默认 B；仅当 B 也无效时才取列表第一项 |
| MO2 | 创建项目                      | `project_mode` 为配置默认或显式选择           |
| MO3 | 话题列表 ModeTag              | 无 topic_mode 时显示配置默认而非写死 general  |
| MO4 | ChatDrawer / ChatsPage 建项目 | 同上                                          |

---

### 5.4 定时任务（P1）

| #   | 场景                  | 验证点                                                     |
| --- | --------------------- | ---------------------------------------------------------- |
| ST1 | 新建任务默认 mode     | 创建态 reaction 跟随 `resolveDefaultAgentSelection`        |
| ST2 | 选中员工已过期        | 表单 help 提示；保存按钮 disabled；toast 拦截              |
| ST3 | 选项目后 project_mode | 使用当前 topicMode（非写死 general）                       |
| ST4 | 编辑已有任务          | 从 `super_agent.topic_pattern + agent_code` 还原 selection |
| ST5 | 保存 payload          | `agent_code` 仅 SMA / custom_agent 协议时附带              |

---

### 5.5 录音纪要 / RecordSummary（P2）

| #   | 场景       | 验证点                           |
| --- | ---------- | -------------------------------- |
| RS1 | 无关联项目 | Editor fallback 用配置默认       |
| RS2 | 已选项目   | 沿用项目 context，不强制 general |

---

### 5.6 展示类兜底（P2，部分未提交）

| #   | 场景                        | 验证点                              |
| --- | --------------------------- | ----------------------------------- |
| DS1 | 话题历史面板无 topic_mode   | Tag 显示配置默认                    |
| DS2 | 分享列表                    | 同上                                |
| DS3 | Inspector / MagicFiles 新建 | 使用 `resolveDefaultAgentSelection` |

---

## 6. 回归矩阵：`default_agent_code` × 员工类型

测试时建议用下表做 **配置 × 操作** 交叉（每个格子至少 smoke 一次）：

| 配置值                  | 首进 UI       | 发消息 protocol   | 建项目 project_mode | hidden | 下线后  |
| ----------------------- | ------------- | ----------------- | ------------------- | ------ | ------- |
| 未配置                  | general       | general           | general             | —      | general |
| general                 | general       | general           | general             | —      | general |
| ppt                     | ppt           | ppt               | ppt                 | —      | general |
| agent-default（非 SMA） | agent-default | agent-default     | agent-default       | 仍默认 | general |
| SMA-crew                | SMA-crew      | custom_agent+code | SMA-crew            | 仍默认 | general |

---

## 7. 推荐测试执行顺序

### 7.1 CI 自动化（每次 PR）

```bash
cd frontend/magic-web
pnpm exec vitest run \
  src/services/superMagic/__tests__/DefaultAgentSelectionService.test.ts \
  src/services/superMagic/__tests__/ProjectTopicService.test.ts \
  src/services/superMagic/__tests__/DefaultTopicModeStorageService.test.ts \
  src/services/superMagic/__tests__/SuperMagicModeService.test.ts \
  src/pages/superMagic/services/__tests__/messageSendPreparation.test.ts \
  src/pages/superMagic/services/__tests__/topicService.test.ts \
  src/pages/superMagic/hooks/__tests__/useTopicMode.test.tsx \
  src/pages/superMagic/components/TopicMode/__tests__/useCreateTopicListener.test.tsx \
  src/pages/superMagic/components/MessageEditor/hooks/__tests__/useInvalidTopicModeFallback.test.tsx \
  src/pages/superMagic/components/MessageEditor/utils/__tests__/shouldShowInvalidTopicModeFallback.test.ts \
  src/pages/superMagic/components/Detail/contents/HTML/iframe-api/hooks/__tests__/useMagicFiles.test.ts \
  src/pages/superMagic/components/TopicMode/__tests__/modeVisibility.test.ts \
  packages/magic-admin/src/pages/PlatformPackage/ModeManagement/__tests__/defaultAgent.test.ts
```

### 7.2 手工 Smoke（约 15 分钟）

1. Admin 改默认员工 → 刷新前端 → 确认 ModeToggle 默认项
2. 用非 SMA 默认发一条消息 → 抓包确认无 `custom_agent` 包装
3. 用 SMA 默认发一条消息 → 确认 `topic_pattern=custom_agent` + `agent_code`
4. 打开绑定已删除员工的历史话题 → 确认 Fallback + 新建话题
5. 定时任务选过期员工 → 确认无法保存
6. hidden 员工设为默认 → 确认仍作默认且 ModeToggle 折叠区行为正常
7. 选中员工 C，后台默认 B，下线 C 后刷新首页 → 选中 B（不是 general / 第一项）

---

## 8. 工作区未提交改动（测试时需知）

以下改动仍在 working tree，**未进入上述 commit**，但会影响完整兜底行为：

| 能力                               | 主要文件                                         |
| ---------------------------------- | ------------------------------------------------ |
| `getFallbackTopicModeIdentifier()` | `DefaultAgentSelectionService.ts`                |
| `resolveProjectModeForCreate()`    | 同上；`ChatPage`、`ChatsPage`、`ChatDrawer` 等   |
| 空 mode → 配置默认（非 general）   | `resolveAgentSelection`                          |
| 区分移动端 Chat 页面与 Chat 模式   | `ChatPage`、`SuperMagicModeService.ts`           |
| 展示 fallback                      | `TopicHistoryPanelContent`、分享列表、ModeTag 等 |
| 消息队列 protocol                  | `useMessageQueue.ts`                             |

合并这些改动后，需追加测试：

- 无 topic / 无 localStorage 时 UI 显示配置默认
- 创建项目未传 mode 时用 `resolveProjectModeForCreate`
- `resolveAgentSelection()` 空 mode 走配置默认（D5/A5 已覆盖）
- MagicFiles 未传 mode 时使用配置默认员工
- 空话题自动恢复不写入 localStorage
- 权威空 modeList 响应触发 RoleStore 重新解析

---

## 9. 常见误判 / Bug 模式

| 误解                                  | 正确理解                                                 |
| ------------------------------------- | -------------------------------------------------------- |
| 非 SMA 平台员工要走 custom_agent      | **错误**；仅 `SMA-*` 走 custom_agent（`9276610b9f`）     |
| hidden 默认员工应回退 general         | **错误**；hidden ≠ invalid（`0d6da0823e`）               |
| `TopicMode.Default` 是用户默认        | **错误**；仅模型 API 用                                  |
| 平台默认会自动写入 localStorage       | **错误**；仅用户显式切换才持久化                         |
| 历史话题的过期 agent 应被覆盖         | **错误**；`resolveAgentSelection` 优先保留话题上的 agent |
| `firstModeIdentifier` 控制首页选中    | **错误**；只影响模型上下文；首页选中由 RoleStore 解析    |
| C 下线后应选列表第一项                | **错误**；应优先平台默认 B；第一项仅移动端 B 也无效时    |
| 系统自动回退应写入 localStorage       | **错误**；会把 general 固化成用户偏好，挡住后续默认 B    |
| 移动端 Chat 页面等于 `TopicMode.Chat` | **错误**；页面可用，但 ModeToggle 仍禁选 Chat 模式       |

---

## 10. 附录：Commit → 测试文件索引

| Commit       | 建议回归测试                                    |
| ------------ | ----------------------------------------------- |
| `d2bcc5e0db` | `defaultAgent.test.ts` + Admin 手工 MA1–MA5     |
| `4d5d74863f` | `modeVisibility.test.ts`、`ModeToggle.test.tsx` |
| `4db0d6ec5f` | §4.1–4.6 全部 + ScheduledTasks 手工 ST1–ST5     |
| `0d6da0823e` | D7、hidden 默认 MA5                             |
| `9276610b9f` | D4、A3、M1、M4、T2、C3 + 抓包确认               |
| `2c88e06470` | F3/F4 UI 视觉 + 容器高度                        |

---

## 11. 变更记录

| 日期       | 说明                                                              |
| ---------- | ----------------------------------------------------------------- |
| 2026-07-31 | 初版：基于 `feat/support-default-crew` 分支 commit 与现有单测梳理 |
| 2026-07-31 | 补充运行态恢复、MagicFiles、空 modeList 与移动端 Chat 边界        |
