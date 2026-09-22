# Magic Admin V2 开源开发规范

本包仅包含 `src/` 公共实现。不要新增、引用或假设存在 `enterprise/` Overlay。

## 目录与分层

- `src/features/<feature-name>/`：业务页面、`api.ts`、`queries.ts`、`mutations.ts`、类型和组件。
- `src/components/`：跨 feature 复用组件；新 UI 使用 Tailwind 和 shadcn/ui。
- `src/routes/`：路由、菜单和访问控制；新增导航同步更新路由、权限、菜单和中英文文案。
- `src/runtime/`：Embedded 和 Standalone 运行时；宿主模式通过 `RuntimeProvider` 注入 API、用户、组织、主题、语言和上传能力。

## 必须遵守

- 用户可见文案使用静态 i18n key，并同步更新 `zh_CN` 与 `en_US`。
- 路由入口使用 `validate`，页面内写操作使用 `useRights`。
- 服务端数据使用 TanStack Query；列表优先使用共享筛选、`ListShell` 和 `ListPagination`。
- 不使用 `any`、无理由的 `@ts-ignore` 或临时硬编码样式绕过。
- 图标按钮提供 `aria-label` 或 Tooltip；异步流程完整处理 loading、empty、error 和权限不足状态。

## 开源验证

```bash
pnpm types:opensource
pnpm lint
pnpm test:unit
pnpm test:components
pnpm test:integration
pnpm build:opensource
```

宿主集成还应从 `frontend/magic-web` 验证 `/admin-v2/` 的登录态、权限、组织切换、主题、语言和上传桥接。
