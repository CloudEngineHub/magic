# CanvasDesign 插件 Runtime Version 升级指南

这份文档面向插件开发者，说明当 CanvasDesign 插件 runtime version 发生变化时，插件应该如何判断是否需要升级，以及如何完成升级。

## 1. version 语义

`manifest.version` 是数字型 CanvasDesign runtime 处理器版本：

```json
{
	"name": "my-plugin",
	"version": 1
}
```

`version: 1` 表示插件由 CanvasDesign 的 `PluginPanel/runtime/v1` 处理器加载。它不是插件业务版本，也不是 semver。

普通插件迭代不修改 `version`，例如：

1. 修改提示词。
2. 调整默认模型。
3. 增减表单字段。
4. 修改 UI 文案或样式。
5. 调整生成参数。

只有当插件需要使用新的、不兼容的 CanvasDesign runtime 协议时，才修改 `manifest.version`。

## 2. 什么时候需要升级

需要升级 runtime version 的典型情况：

1. 生命周期 hook 参数发生不兼容变化。
2. `ctx` 的状态属性或能力方法结构发生不兼容变化。
3. bridge 消息 payload 或 result 结构发生不兼容变化。
4. state 更新与 `view.update(change)` 的触发语义发生不兼容变化。
5. 插件需要使用只在新 runtime version 中存在的宿主能力。

不需要升级 runtime version 的情况：

1. 插件仍能在当前 runtime version 下运行。
2. 只是新增兼容性字段或可选能力。
3. 只是业务配置、文案、样式或提示词变化。
4. 只是插件内部代码重构。

## 3. 升级流程

当 CanvasDesign 提供新 runtime version，例如 `version: 2`：

1. 阅读对应 runtime version 的变更说明，确认不兼容点。
2. 修改 `manifest.version` 为目标数字版本。
3. 根据新 runtime 协议调整 `create/prepare/render/dispose` 和 view controller。
4. 根据新 `ctx` 能力调整调用方式。
5. 根据新 bridge schema 调整请求和结果处理。
6. 回归插件核心流程：打开、选择素材、生成、关闭、重复打开。

插件 `name` 不应因为 runtime version 升级而变化。`name` 是插件身份，会影响宿主缓存、入口状态和用户识别。

## 4. v1 插件入口要求

当前 `version: 1` 插件入口形态：

```js
registerMagicCanvasPlugin({
	create(ctx) {
		return {
			state: ctx.state.create({ loading: false }),
		}
	},

	async prepare(ctx, instance, scope) {
		// optional
	},

	render(ctx, instance, root, scope) {
		return ctx.panel.render(root, {
			state: instance.state,
			sections: [],
		})
	},

	dispose(ctx, instance, reason) {
		// optional
	},
})
```

`render` 返回 view controller：

```js
return {
	update(change) {},
	onHostStateChange(event) {},
	activate(scope) {},
	deactivate(scope) {},
	dispose(reason) {},
}
```

插件自己的运行期状态通过 `ctx.state.patch/replace` 更新，由 runtime 批量触发 `view.update(change)`。

## 5. capability 检查

升级 runtime version 时必须重新检查 `manifest.capabilities`。插件调用的宿主能力必须显式声明：

```json
{
	"capabilities": [
		"ui.toast",
		"assets.pickFiles",
		"ai.generateAndPlace"
	]
}
```

常见映射：

| 调用 | capability |
| ---- | ---------- |
| `ctx.ui.toast` | `ui.toast` |
| `ctx.ui.close` | `ui.close` |
| `ctx.ui.setHeight` | `ui.setHeight` |
| `ctx.resources.resolve` | `resources.resolve` |
| `ctx.assets.pickFiles` | `assets.pickFiles` |
| `ctx.assets.uploadFile` | `assets.uploadFile` |
| `ctx.assets.fetchBlob` | `assets.fetchBlob` |
| `ctx.ai.getImageModels` | `ai.getImageModels` |
| `ctx.ai.generateAndPlace` | `ai.generateAndPlace` |

未声明能力时，宿主会拒绝对应 bridge 请求。

## 6. 升级检查清单

提交前检查：

1. `manifest.version` 是数字。
2. `manifest.name` 保持不变。
3. `manifest.contributes` 不存在。
4. 所有宿主能力调用都已声明在 `capabilities`。
5. 插件入口符合目标 runtime version 协议。
6. `render` 返回 view controller 或 Panel Kit view。
7. 自定义 DOM 插件实现了 `dispose` 清理。
8. state 更新通过 `ctx.state.patch/replace` 驱动视图更新。
