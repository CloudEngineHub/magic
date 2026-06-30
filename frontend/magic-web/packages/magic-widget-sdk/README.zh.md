# Magic Widget SDK 接入说明

Magic Widget SDK 是一个用于第三方站点接入 Magic Web 的浏览器 UMD 脚本。第三方站点加载脚本后，可以调用 `window.MagicWidget.mount(...)` 显示一个悬浮消息按钮；点击按钮后按钮会隐藏，并在 iframe 面板中打开 Magic Web 页面。

## 脚本地址

请使用目标 Magic Web 部署站点提供的 SDK 脚本：

```html
<script src="https://your-magic-domain.com/sdk/magic-widget.js"></script>
```

iframe 的域名会从脚本地址中推断。例如脚本来自 `https://your-magic-domain.com/sdk/magic-widget.js`，iframe 也会在 `https://your-magic-domain.com` 下打开。

SDK 不提供独立的 `appOrigin` 配置。如果需要切换环境，请加载对应 Magic Web 站点下的脚本。

## 快速接入

请在 `document.body` 已存在后调用 `mount`：

```html
<script src="https://your-magic-domain.com/sdk/magic-widget.js"></script>
<script>
	window.MagicWidget.mount({
		page: {
			type: "crew",
			crewId: "crew-001",
		},
		auth: {
			loginStrategy: "phone_password",
			organizationCode: "org-001",
		},
		modal: {
			title: "Magic Assistant",
			width: 480,
			height: 680,
		},
	})
</script>
```

如果脚本在 `head` 中异步加载，或调用时机早于 `body` 创建，请延后调用：

```html
<script>
	window.addEventListener("DOMContentLoaded", function () {
		window.MagicWidget.mount({
			page: {
				type: "crew",
				crewId: "crew-001",
			},
		})
	})
</script>
```

## 运行时 API

UMD 脚本会暴露一个全局对象：

```ts
window.MagicWidget
```

| 方法 | 签名 | 作用 | 边界限制 |
| --- | --- | --- | --- |
| `mount` | `(options: MagicWidget.MountOptions) => void` | 创建 widget 并显示悬浮按钮。重复调用 `mount` 会销毁上一次实例，并使用新的配置重新创建。 | 必须在浏览器文档中调用，并且调用时 `document.body` 需要存在。 |
| `open` | `() => void` | 主动打开面板。面板打开时，悬浮按钮会隐藏。 | 必须在 `mount` 后调用；未挂载时调用会抛错。 |
| `close` | `() => void` | 主动关闭面板。关闭动画结束后，悬浮按钮会重新显示。 | 面板已关闭时调用不会产生额外影响。 |
| `destroy` | `() => void` | 移除 widget DOM、事件监听、定时器与当前配置。 | 调用后如需再次打开，需要先重新 `mount`。 |

同时可以通过 `window.MagicWidget.version` 获取当前脚本版本，便于排查接入问题。

## Mount 参数

```ts
namespace MagicWidget {
	interface MountOptions {
		page: PageOptions
		auth?: AuthOptions
		iframe?: IframeOptions
		modal?: ModalOptions
	}
}
```

### `page`

必填。用于选择 SDK 允许打开的 Magic Web 页面。SDK 不接受自由 URL，也不接受自由路由字符串。

```ts
namespace MagicWidget {
	type PageOptions = CrewPageOptions

	interface CrewPageOptions {
		type: "crew"
		crewId: string
	}
}
```

| 页面类型 | 必填字段 | 结果 |
| --- | --- | --- |
| `crew` | `crewId` | 打开指定 Crew 的专属会话页。 |

边界限制：

| 值 | 是否支持 | 结果 |
| --- | --- | --- |
| `{ type: "crew", crewId: "crew-001" }` | 支持 | 在脚本域名下打开 Crew 页面。 |
| `{ type: "crew", crewId: "" }` | 不支持 | 空 Crew ID 会被拒绝。 |
| `{ type: "freeform", ... }` | 不支持 | 非公开页面类型会被类型约束拒绝。 |
| `route` / `url` | 不支持 | 自由导航不属于公开 API。 |

当前 `page.type = "crew"` 会解析到 `/{clusterCode}/super/crew/{crewId}`，内置默认集群编码为 `default`。例如 `crewId: "crew-001"` 会在脚本域名下打开 `/default/super/crew/crew-001`。

### `auth`

```ts
namespace MagicWidget {
	interface AuthOptions {
		loginStrategy?: LoginStrategy
		organizationCode?: string
	}
}
```

`loginStrategy` 会作为 `login-strategy` 查询参数追加到 iframe URL 中。Magic Web 可以在 `/login` 路由下依据该值选择对应的登录表单。

`organizationCode` 会作为 `organizationCode` 查询参数追加到 iframe URL 中。用户完成登录后，Magic Web 可以依据该值切换到目标 Magic 组织后再渲染页面。空字符串会被忽略。

内置登录策略枚举：

```ts
namespace MagicWidget {
	type LoginStrategy =
		| "phone_captcha"
		| "email"
		| "phone_password"
		| "DingTalk"
		| "DingTalkAvoid"
		| "wecom"
		| "Lark"
		| "redirect"
		| "apple_login"
		| "google_login"
		| "anta_login"
		| string
}
```

如果 `iframe.query` 中也传入了 `login-strategy` 或 `organizationCode`，以 `auth` 中对应字段为准。

### `iframe`

```ts
namespace MagicWidget {
	interface IframeOptions {
		allow?: string
		sandbox?: string
		query?: Record<string, QueryValue>
	}

	type QueryValue =
		| string
		| number
		| boolean
		| null
		| undefined
		| Array<string | number | boolean | null | undefined>
}
```

| 参数 | 作用 | 边界限制 |
| --- | --- | --- |
| `allow` | 设置 iframe 的 `allow` 属性。 | 使用浏览器标准权限策略语法，例如 `"clipboard-read; clipboard-write"`。 |
| `sandbox` | 设置 iframe 的 `sandbox` 属性。 | 不传时不会设置 `sandbox`。过于严格的 sandbox 可能导致 Magic Web 功能不可用，因此只建议在宿主页面有明确安全要求时配置。 |
| `query` | 向 iframe URL 追加额外查询参数。 | `null` 和 `undefined` 会被忽略。数组值会以同一个 key 追加多次。 |

对于 SDK 自有查询参数，例如 `auth.organizationCode` 对应的 `organizationCode` 和 `auth.loginStrategy` 对应的 `login-strategy`，配置优先级高于 `iframe.query` 中的同名字段。

### `modal`

```ts
namespace MagicWidget {
	interface ModalOptions {
		title?: string
		width?: number | string
		height?: number | string
		classNames?: Partial<Record<ModalSlot, string>>
		styles?: Partial<Record<ModalSlot, Record<string, string | number | null | undefined>>>
	}
}
```

| 参数 | 作用 | 默认值 / 边界限制 |
| --- | --- | --- |
| `title` | 面板头部标题。该值也会作为 iframe 的 `title`。 | 默认值为 `"Magic"`。 |
| `width` | PC 端面板宽度。传入 number 时按 px 处理；传入 string 时按 CSS 尺寸处理。 | 默认值为 `min(420px, calc(100vw - 32px))`。移动端忽略该配置。 |
| `height` | PC 端面板高度。传入 number 时按 px 处理；传入 string 时按 CSS 尺寸处理。 | 默认值为 `min(680px, calc(100vh - 32px))`。PC 端面板内置最小高度为 `420px`。移动端忽略该配置。 |
| `classNames` | 给指定 modal 插槽追加 className。 | 只负责追加 class 属性；如果需要稳定修改视觉样式，优先使用 `styles`。 |
| `styles` | 给指定 modal 插槽设置内联样式。 | 支持 camelCase CSS 属性、kebab-case CSS 属性和 CSS 自定义属性。`null` 与 `undefined` 会被忽略。 |

可配置的 modal 插槽：

| 插槽 | 对应区域 |
| --- | --- |
| `root` | Widget 根容器。 |
| `layer` | 全屏面板层。 |
| `mask` | 移动端面板背后的蒙层。 |
| `container` | 面板容器。 |
| `header` | 面板头部。 |
| `title` | 头部标题文本。 |
| `close` | 关闭按钮。 |
| `body` | iframe 外层内容区域。 |
| `iframe` | 内嵌 iframe 元素。 |

示例：

```js
window.MagicWidget.mount({
	page: {
		type: "crew",
		crewId: "crew-001",
	},
	modal: {
		title: "Support",
		classNames: {
			container: "partner-widget-panel",
			header: "partner-widget-header",
		},
		styles: {
			mask: {
				backgroundColor: "rgba(15, 23, 42, 0.42)",
			},
			container: {
				boxShadow: "0 28px 80px rgba(15, 23, 42, 0.28)",
			},
			close: {
				color: "#334155",
			},
			iframe: {
				backgroundColor: "#ffffff",
			},
		},
	},
})
```

## 交互行为

| 环境 | 行为 |
| --- | --- |
| PC 端 | 页面展示圆形悬浮消息按钮。点击后按钮隐藏，并以按钮区域作为锚点重叠打开面板。面板可通过头部拖拽，并会在窗口尺寸变化时保持在视口内。 |
| 移动端，`<= 640px` | 面板以底部 popover 形式打开，并展示蒙层；宽度固定 `100%`，高度固定 `86vh`，底部无圆角。`modal.width` 与 `modal.height` 不生效，面板不支持拖拽。 |

悬浮按钮和面板是互斥显示的：同一时刻只会出现其中一个。面板可以通过右上角关闭按钮、移动端蒙层、键盘 `Escape`，或 `window.MagicWidget.close()` 关闭。

## 不支持的 Mount 参数

以下字段不属于对外公开 API，请不要传入 `mount`：

```ts
appOrigin
clusterCode
organizationCode
route
trigger
url
zIndex
```

请通过脚本地址选择 Magic Web 域名，通过 `page` 选择受支持的目标页面，通过 `auth.organizationCode` 配置组织切换，并通过 `modal` 参数配置面板展示效果。
