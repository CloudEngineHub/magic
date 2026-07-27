# Magic Widget SDK 接入说明

Magic Widget SDK 是一个用于第三方站点接入 Magic Web 的浏览器 UMD 脚本。第三方站点加载脚本后，可以调用 `window.MagicWidget.mount(...)` 显示一个悬浮消息按钮；点击按钮后按钮会隐藏，并在 iframe 面板中打开 Magic Web 页面。

## 脚本地址

请使用目标 Magic Web 部署站点提供的 SDK 脚本：

```html
<script src="https://your-magic-domain.com/sdk/magic-widget.js"></script>
```

iframe 的域名会从脚本地址中推断。例如脚本来自 `https://your-magic-domain.com/sdk/magic-widget.js`，iframe 也会在 `https://your-magic-domain.com` 下打开。

SDK 不提供独立的 `appOrigin` 配置。脚本地址决定 Magic Web Origin；同一 Origin 下的 SaaS 或私有化部署环境通过 `auth.deploymentCode` 选择。

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
			deploymentCode: "private-mock",
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

| 方法              | 签名                                          | 作用                                                                                    | 边界限制                                                      |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `mount`           | `(options: MagicWidget.MountOptions) => void` | 创建 widget 并显示悬浮按钮。重复调用 `mount` 会销毁上一次实例，并使用新的配置重新创建。 | 必须在浏览器文档中调用，并且调用时 `document.body` 需要存在。 |
| `open`            | `() => void`                                  | 主动打开面板。面板打开时，悬浮按钮会隐藏。                                              | 必须在 `mount` 后调用；未挂载时调用会抛错。                   |
| `close`           | `() => void`                                  | 主动关闭面板。关闭动画结束后，悬浮按钮会重新显示。                                      | 面板已关闭时调用不会产生额外影响。                            |
| `destroy`         | `() => void`                                  | 移除 widget DOM、事件监听、定时器与当前配置。                                           | 调用后如需再次打开，需要先重新 `mount`。                      |
| `on`              | `("agent_ready", listener) => () => void`     | 订阅 Agent 已可接收消息事件，并返回取消订阅函数。                                       | 事件发生在编辑器订阅生效且当前草稿阶段结束之后。              |
| `setInput`        | `(content: string) => Promise<void>`          | 将文本写入 Agent 输入框并聚焦，但不发送。                                               | 仅接受非空字符串；以 iframe response 为准。                   |
| `appendInput`     | `(content: string) => Promise<void>`          | 将文本追加到当前输入末尾并聚焦，但不发送。                                              | 仅接受非空字符串；以 iframe response 为准。                   |
| `clearInput`      | `() => Promise<void>`                         | 清空当前输入框并聚焦，不发送消息。                                                      | 以 iframe response 为准。                                     |
| `getInput`        | `() => Promise<string>`                       | 返回当前输入框的纯文本内容。                                                            | 以 iframe response 为准。                                     |
| `sendMessage`     | `(content: string) => Promise<void>`          | 通过现有会话链路立即发送一条文本消息。                                                  | 仅接受非空字符串；超时或 iframe 错误时 Promise 会拒绝。       |
| `newConversation` | `() => Promise<void>`                         | 创建并选中新对话，Promise 在新编辑器再次 `agent_ready` 后完成。                         | 创建失败或新编辑器超时就绪时 Promise 会拒绝。                 |

同时可以通过 `window.MagicWidget.version` 获取当前脚本版本，便于排查接入问题。

## Mount 参数

```ts
namespace MagicWidget {
	interface MountOptions {
		page: PageOptions
		auth?: AuthOptions
		iframe?: IframeOptions
		modal?: ModalOptions
		target?: HTMLElement
	}
}
```

### 内联模式

传入已连接到当前文档的 `HTMLElement` 作为 `target`，可将 iframe 直接渲染到指定容器：

```js
const container = document.querySelector("#agent-slot")
window.MagicWidget.mount({
	page: { type: "crew", crewId: "crew-demo" },
	target: container,
})
window.MagicWidget.setInput("请整理这段虚构内容")
window.MagicWidget.sendMessage("请立即处理这段虚构内容")
```

### Agent 就绪与输入维护

`agent_ready` 表示当前 iframe 已完成页面初始化和编辑器事件订阅，并且当前话题的草稿阶段已经通过成功恢复、主动跳过或失败降级结束。它只是状态通知，SDK 和 iframe bridge 都不会把它作为普通命令的执行前置条件。iframe 文档完成加载后，普通命令会直接发送，不会在 bridge 内等待或排队到 `agent_ready`。

如果宿主首次操作必须发生在已有话题草稿处理完成之后，应由宿主业务逻辑自行等待一次 `agent_ready`。建议在 `mount` 前订阅，避免错过首次事件：

```js
const firstAgentReady = new Promise((resolve) => {
	const unsubscribe = window.MagicWidget.on("agent_ready", () => {
		unsubscribe()
		resolve()
	})
})

window.MagicWidget.mount({
	page: { type: "crew", crewId: "crew-demo" },
})

await firstAgentReady
await window.MagicWidget.setInput("虚构任务前缀")
await window.MagicWidget.appendInput("，请继续处理")
const currentInput = await window.MagicWidget.getInput()
await window.MagicWidget.clearInput()
```

`getInput` 返回纯文本，不暴露 TipTap 或内部 Mention JSON。`appendInput` 只追加文本，不会触发发送。`setInput` 会替换当前编辑器内容，但不会删除持久化的草稿历史；后续仍沿用当前话题原有的草稿保存流程。

### 新建对话

`newConversation` 会创建当前 Crew 的新话题；iframe 会在新话题切换完成后返回 response，SDK 以该 response 作为 Promise 的完成条件：

```js
await window.MagicWidget.newConversation()
await window.MagicWidget.setInput("新对话中的虚构内容")
await window.MagicWidget.sendMessage("发送新对话中的虚构内容")
```

宿主必须为容器设置非零宽高。内联模式不创建悬浮球、遮罩和 SDK 头部，`mount` 后默认可见；仍可使用 `open`、`close` 和 `destroy`。SDK 保持单例语义，后续 `mount` 会替换旧实例。

所有输入、发送和新建对话方法均返回 Promise。失败时错误对象包含稳定的 `code`，例如 `NOT_MOUNTED`、`INVALID_INPUT`、`IFRAME_NOT_READY` 或 `COMMAND_FAILED`。SDK 只在首次加载或重新加载期间等待 iframe 文档完成加载，不等待 `agent_ready`；命令结果以 iframe response 为准。

跨域通信使用版本化 `postMessage` 协议，并同时限制为 SDK 推导出的 Magic Origin 和当前 iframe 窗口。调用方不应传递密钥或完成任务不需要的业务数据。本阶段不开放宿主 `@` 候选项注入和 Agent→宿主动作回调。

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

| 页面类型 | 必填字段 | 结果                         |
| -------- | -------- | ---------------------------- |
| `crew`   | `crewId` | 打开指定 Crew 的专属会话页。 |

边界限制：

| 值                                     | 是否支持 | 结果                             |
| -------------------------------------- | -------- | -------------------------------- |
| `{ type: "crew", crewId: "crew-001" }` | 支持     | 在脚本域名下打开 Crew 页面。     |
| `{ type: "crew", crewId: "" }`         | 不支持   | 空 Crew ID 会被拒绝。            |
| `{ type: "freeform", ... }`            | 不支持   | 非公开页面类型会被类型约束拒绝。 |
| `route` / `url`                        | 不支持   | 自由导航不属于公开 API。         |

当前 `page.type = "crew"` 会解析到 `/{clusterCode}/super/crew/{crewId}`。未传部署码时使用 SaaS 路由 `/global/super/crew/{crewId}`；传入 `auth.deploymentCode` 时使用对应私有化路由。

### `auth`

```ts
namespace MagicWidget {
	interface AuthOptions {
		loginStrategy?: LoginStrategy
		deploymentCode?: string
		organizationCode?: string
	}
}
```

`loginStrategy` 会作为 `login-strategy` 查询参数追加到 iframe URL 中。Magic Web 可以在 `/login` 路由下依据该值选择对应的登录表单。

`deploymentCode` 用于进入数字员工页之前选择登录环境。未传或传入空字符串时使用 SaaS 环境；传入非空值时使用对应私有化环境。若该环境尚未登录，Magic Web 会复用现有登录入口并填充部署码；若浏览器中已有该环境账号，则复用现有账号切换能力。

当需要展示私有化部署识别码表单时，请同时传入 `loginStrategy: "private_deployment"` 和 `deploymentCode`。目标页仍使用 `/{deploymentCode}/...` 路由，因此已有私有化登录会话不会被 SaaS 权限校验拦截；若需要登录，同一部署码会传递给表单作为预填值。`privateDeploymentCode` 不再支持。

`organizationCode` 会作为 `organizationCode` 查询参数追加到 iframe URL 中。用户完成登录后，Magic Web 可以依据该值切换到目标 Magic 组织后再渲染页面。空字符串会被忽略。

环境选择发生在登录和 Crew 页面渲染之前，组织切换发生在目标环境登录完成之后。组织只会在目标部署环境的账号范围内匹配，不会跨环境选择同编码组织。本版本不提供额外的鉴权状态事件。

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
		| "wechat_official_account"
		| "redirect"
		| "private_deployment"
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

| 参数      | 作用                             | 边界限制                                                                                                               |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `allow`   | 设置 iframe 的 `allow` 属性。    | 使用浏览器标准权限策略语法，例如 `"clipboard-read; clipboard-write"`。                                                 |
| `sandbox` | 设置 iframe 的 `sandbox` 属性。  | 不传时不会设置 `sandbox`。过于严格的 sandbox 可能导致 Magic Web 功能不可用，因此只建议在宿主页面有明确安全要求时配置。 |
| `query`   | 向 iframe URL 追加额外查询参数。 | `null` 和 `undefined` 会被忽略。数组值会以同一个 key 追加多次。                                                        |

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

| 参数         | 作用                                                                     | 默认值 / 边界限制                                                                               |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `title`      | 面板头部标题。该值也会作为 iframe 的 `title`。                           | 默认值为 `"Magic"`。                                                                            |
| `width`      | PC 端面板宽度。传入 number 时按 px 处理；传入 string 时按 CSS 尺寸处理。 | 默认值为 `min(420px, calc(100vw - 32px))`。移动端忽略该配置。                                   |
| `height`     | PC 端面板高度。传入 number 时按 px 处理；传入 string 时按 CSS 尺寸处理。 | 默认值为 `min(680px, calc(100vh - 32px))`。PC 端面板内置最小高度为 `420px`。移动端忽略该配置。  |
| `classNames` | 给指定 modal 插槽追加 className。                                        | 只负责追加 class 属性；如果需要稳定修改视觉样式，优先使用 `styles`。                            |
| `styles`     | 给指定 modal 插槽设置内联样式。                                          | 支持 camelCase CSS 属性、kebab-case CSS 属性和 CSS 自定义属性。`null` 与 `undefined` 会被忽略。 |

可配置的 modal 插槽：

| 插槽        | 对应区域               |
| ----------- | ---------------------- |
| `root`      | Widget 根容器。        |
| `layer`     | 全屏面板层。           |
| `mask`      | 移动端面板背后的蒙层。 |
| `container` | 面板容器。             |
| `header`    | 面板头部。             |
| `title`     | 头部标题文本。         |
| `close`     | 关闭按钮。             |
| `body`      | iframe 外层内容区域。  |
| `iframe`    | 内嵌 iframe 元素。     |

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

| 环境               | 行为                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PC 端              | 页面展示圆形悬浮消息按钮。点击后按钮隐藏，并以按钮区域作为锚点重叠打开面板。面板可通过头部拖拽，并会在窗口尺寸变化时保持在视口内。              |
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

请通过脚本地址选择 Magic Web 域名，通过 `page` 选择受支持的目标页面，通过 `auth.deploymentCode` 选择 SaaS 或私有化环境；如需预填私有化登录表单，请结合 `auth.loginStrategy: "private_deployment"` 使用，且不会改变私有化目标路由；通过 `auth.organizationCode` 配置登录后的组织切换，并通过 `modal` 参数配置面板展示效果。
