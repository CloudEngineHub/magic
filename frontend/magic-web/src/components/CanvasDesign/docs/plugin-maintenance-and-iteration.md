# CanvasDesign 内置插件维护与迭代规范

这份文档面向当前项目内维护 `frontend/magic-web/src/pages/superMagic/components/Detail/contents/Design/plugins` 的开发者。它不重新解释插件开发范式，而是约定内置插件在 Magic Web 项目里的维护边界、目录规范、runtime version 规范和迭代流程。

## 1. 维护范围

当前内置插件目录：

```text
frontend/magic-web/src/pages/superMagic/components/Detail/contents/Design/plugins/
├── <plugin-name>/
│   ├── manifest.json
│   ├── index.js
│   └── index.css
├── shared/
└── __tests__/
```

每个插件目录只维护该插件自己的运行时代码、样式、文案和业务配置。跨插件复用能力放在 `shared/`，CanvasDesign 宿主能力放在 `frontend/magic-web/src/components/CanvasDesign`。

## 2. manifest 规范

内置插件的 `manifest.json` 必须包含：

```json
{
	"name": "virtual-tryon",
	"version": 1,
	"entry": "index.js",
	"styles": "index.css",
	"label": "{{label}}",
	"description": "{{description}}",
	"capabilities": [
		"ui.toast",
		"ui.close",
		"ui.setHeight",
		"assets.pickFiles",
		"assets.uploadFile",
		"assets.fetchBlob",
		"ai.getImageModels",
		"ai.generateAndPlace",
		"ai.completeImagePrompt"
	],
	"locales": {}
}
```

约束：

1. `name` 是插件唯一身份，工具栏、面板状态和缓存 key 都使用它。
2. `version` 是数字型 CanvasDesign runtime 处理器版本，当前内置插件统一为 `1`。
3. `version` 不表示插件业务发布版本，不使用 `1.0.0`、`1.1.0` 这类 semver。
4. `capabilities` 必须显式声明插件会调用的宿主能力；未声明的 bridge 调用会被宿主拒绝。
5. 暂不允许在 manifest 中暴露 `contributes`；插件入口和面板尺寸由 CanvasDesign 宿主侧统一管理。

## 3. runtime version 规范

CanvasDesign 按 `manifest.version` 选择 runtime 处理器：

```text
manifest.version = 1
  -> frontend/magic-web/src/components/CanvasDesign/ui/panels/plugin/runtime-protocol/v1

manifest.version = 2
  -> frontend/magic-web/src/components/CanvasDesign/ui/panels/plugin/runtime-protocol/v2
```

当前只实现 `runtime/v1`。新增 `v2` 的条件必须是插件协议发生不兼容变化，例如：

1. 生命周期调用参数发生不兼容变化。
2. `ctx` 的核心结构发生不兼容变化。
3. bridge 消息协议或返回结构发生不兼容变化。
4. state/update 语义发生不兼容变化。

以下变化不允许 bump runtime version：

1. 调整插件提示词、默认模型、表单字段或 UI 文案。
2. 增加兼容性的 capability。
3. 修改某个插件的业务逻辑但不改变宿主协议。
4. 修改 Panel Kit 内部样式或局部交互。

新增 runtime version 时必须保留已发布目录。`runtime/v1` 继续服务 `version: 1` 的插件，不能被 v2 改造覆盖。

## 4. 入口代码规范

内置插件入口使用新范式：

```js
registerMagicCanvasPlugin({
	create(ctx) {
		return {
			state: MagicPluginKit.createPanelState(ctx, createInitialState()),
		}
	},

	render(ctx, instance, root, scope) {
		return ctx.panel.render(root, {
			state: instance.state,
			sections,
			generate,
		})
	},
})
```

插件优先使用 `ctx.panel.render(root, config)`，减少对 iframe 全局对象的依赖。

约束：

1. 插件入口必须使用 `create/render`。
2. `create(ctx)` 直接创建 `instance.state`，不要写空 `create()` 或 `return createPluginInstance(ctx)` 这类包装。
3. DOM refs 放在 `render` 闭包或 view controller 内，不放进 `instance`。
4. 运行期状态更新优先走 `ctx.state.patch/replace`。
5. 自定义 DOM 插件必须在 `view.dispose` 中解绑事件、清理对象 URL、清空 root。

## 5. 迭代流程

普通插件迭代：

1. 修改插件目录下的 `manifest.json`、`index.js`、`index.css`。
2. 如果新增宿主能力调用，先补 `manifest.capabilities`，再写调用代码，例如新增 `ctx.ai.completeImagePrompt()` 时必须同步声明 `ai.completeImagePrompt`。
3. 如果调整插件入口协议，先判断是否真的需要 runtime version bump。
4. 保持 `manifest.version` 为当前 runtime 处理器版本，普通业务迭代不修改它。
5. 运行静态插件校验和相关 runtime 测试。

runtime 处理器迭代：

1. 兼容性修复直接改当前 `runtime/v1`。
2. 不兼容协议新增 `runtime/v2`，不要原地重写 v1。
3. `PluginPanel` 的 runtime selector 增加 `version: 2` 分支。
4. 给 v2 增加独立测试，v1 测试必须继续通过。
5. 只有明确切换到 v2 的插件才修改 `manifest.version`。

## 6. 必跑校验

修改内置插件后至少运行：

```bash
pnpm --dir frontend/magic-web exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/components/Detail/contents/Design/plugins/__tests__/static-plugin-manifests.test.ts
```

修改 runtime 处理器后至少运行：

```bash
pnpm --dir frontend/magic-web exec vitest run --config ./vitest.config.ts \
  src/components/CanvasDesign/ui/panels/plugin/window/__tests__/runtimeProtocol.test.ts \
  src/components/CanvasDesign/ui/panels/plugin/window/__tests__/runtimeLifecycle.test.ts
```

如果改动触达 CanvasDesign 类型、PluginPanel 或 shared kit，需要补跑相关 focused 测试，并按需执行 typecheck。

涉及画布 → 插件导入链路（粘贴、Alt 拖拽、空态 tooltip）时，额外运行：

```bash
pnpm --dir frontend/magic-web exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/components/Detail/contents/Design/plugins/shared/magic-plugin-kit/__tests__/index.test.ts \
  src/components/CanvasDesign/components/PluginPanel/__tests__/runtimeProtocol.test.ts
```

手动回归建议：

1. 空态 `image-grid` / `image-slot` hover 显示导入 tooltip；上传后有图时 tooltip 消失。
2. 画布 `Ctrl/Cmd+C` → 聚焦上传区 → `Ctrl/Cmd+V` 粘贴。
3. 画布选中图片 → **Alt/Option + 左键拖拽** 到插件上传区；拖拽悬停显示 `dropHint`，不叠 tooltip。
4. 拖拽 ghost 预览图正常加载（无 403）。

相关 Host 模块：`readPluginCanvasClipboard.ts`、`fileAssets.ts`、`canvasImageDragAssets.ts`、`useCanvasImageExternalDragToPlugin.tsx`、`usePluginRuntimeBridge.ts`、`PluginWindow.tsx`。协议说明见 `plugin-development-paradigm.md` §10.2.2–10.2.3 与 `magic-plugin-kit/README.md`「图片导入」。
