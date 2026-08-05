# Magic Widget SDK

Magic Widget SDK is a browser UMD script for embedding Magic Web into an external site. After the script is loaded, the host page can call `window.MagicWidget.mount(...)` to display a floating message button. Clicking the button hides the button and opens a Magic Web page inside an iframe panel.

## Script URL

Use the SDK file served by the Magic Web deployment that should host the embedded iframe:

```html
<script src="https://your-magic-domain.com/sdk/magic-widget.js"></script>
```

The iframe origin is inferred from the script URL. For example, if the script is loaded from `https://your-magic-domain.com/sdk/magic-widget.js`, the iframe also opens on `https://your-magic-domain.com`.

The SDK does not accept an `appOrigin` option. The script URL selects the Magic Web origin, while `auth.deploymentCode` selects SaaS or a private deployment within that origin.

## Quick Start

Call `mount` after `document.body` is available:

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
		config: {
			layout: "desktop",
			shell: { appSidebar: false },
			responsive: {
				mobileDetection: "device-and-viewport",
			},
			conversation: {
				projectFiles: false,
				topicHistory: true,
				previewMode: "switchable",
			},
		},
		modal: {
			title: "Magic Assistant",
			width: 480,
			height: 680,
		},
	})
</script>
```

If the script is loaded in `head` with `async`, or before `body` exists, defer the call:

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

## Runtime API

The UMD script exposes one global object:

```ts
window.MagicWidget
```

| Method            | Signature                                                      | Description                                                                                                       | Boundary                                                             |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `mount`           | `(options: MagicWidget.MountOptions) => void`                  | Creates the widget and displays the floating button. Calling `mount` again replaces the previous widget instance. | Must be called in a browser document after `document.body` exists.   |
| `open`            | `() => void`                                                   | Opens the panel programmatically. The floating button is hidden while the panel is open.                          | Must be called after `mount`; otherwise an error is thrown.          |
| `close`           | `() => void`                                                   | Closes the panel programmatically. The floating button is shown again after the close animation.                  | Safe to call when the panel is already closed.                       |
| `destroy`         | `() => void`                                                   | Removes the widget DOM, event listeners, timers, and current configuration.                                       | Call `mount` again before using `open`.                              |
| `on`              | `on(event, listener)`                                          | Subscribes to Agent readiness, preview state, tool settlement, or task completion events.                         | Each event has a distinct listener signature; see Event API below.   |
| `setInput`        | `(content: string) => Promise<void>`                           | Replaces the Agent editor text and focuses it without sending.                                                    | Requires a non-empty string; completion follows the iframe response. |
| `appendInput`     | `(content: string) => Promise<void>`                           | Appends text to the current editor value and focuses it without sending.                                          | Requires a non-empty string; completion follows the iframe response. |
| `clearInput`      | `() => Promise<void>`                                          | Clears the current editor without sending.                                                                        | Completion follows the iframe response.                              |
| `getInput`        | `() => Promise<string>`                                        | Returns the current editor value as plain text.                                                                   | Completion follows the iframe response.                              |
| `sendMessage`     | `(content: string) => Promise<void>`                           | Sends exactly one text message through the Agent conversation flow.                                               | Requires a non-empty string; rejects on timeout or iframe error.     |
| `newConversation` | `() => Promise<void>`                                          | Creates and selects a new conversation, resolving after its editor becomes ready.                                 | Rejects if creation fails or the new editor does not become ready.   |
| `updateConfig`    | `(config: Partial<MagicWidget.WidgetConfig>) => Promise<void>` | Incrementally updates the current embedded-page configuration.                                                    | Does not change the URL, replace `iframe.src`, or reload the iframe. |

The object also exposes `window.MagicWidget.version` for diagnostics.

### Event API

#### `toolCall.settled`

```ts
on(event: "toolCall.settled", listener: (event: MagicWidget.ToolCallSettledEvent) => void): () => void
```

The SDK forwards the complete event whenever Magic Web publishes a tool settlement:

```js
const unsubscribeTool = window.MagicWidget.on("toolCall.settled", (event) => {
	// Refresh host state without depending on Magic Web's internal payload shape.
	void refreshHostToolState(event)
})
```

- The SDK only guarantees the event name. Magic Web owns the fields inside `meta` and `payload`, so their structure is intentionally not fixed by the public types.
- The SDK does not interpret, trim, deduplicate, or reclassify tool events. It forwards exactly what Magic Web publishes.
- Hosts that consume the current data shape should validate or narrow `event.payload` inside their own business boundary.

#### `task.completed`

```ts
on(event: "task.completed", listener: (event: MagicWidget.TaskCompletedEvent) => void): () => void
```

The SDK forwards the complete event whenever Magic Web publishes a task completion:

```js
const unsubscribeTask = window.MagicWidget.on("task.completed", (event) => {
	// Refresh host state without depending on Magic Web's internal payload shape.
	void refreshHostTaskState(event)
})
```

The SDK does not define Magic Web's internal completion criteria or interpret result data. Event production and field contents follow Magic Web's current behavior.

Both result events are best-effort browser notifications. They do not replay earlier events or guarantee delivery after Widget destruction, iframe reload, background scheduling, network loss, offline use, or execution on another device. Hosts may update temporary UI or trigger their own data refresh, but must not treat these events as durable business records. The SDK adds no current-topic filter; events actually emitted by Magic Web and observed by the iframe are forwarded directly.

#### `preview_fullscreen`

```ts
on(event: "preview_fullscreen", listener: (isFullscreen: boolean) => void): () => void
```

The SDK sends the host a complete boolean snapshot when Agent preview enters or exits fullscreen presentation:

- `true`: the preview is using fullscreen presentation.
- `false`: the preview has exited fullscreen presentation, or no preview is currently fullscreen.
- Immediately after subscription, the listener synchronously receives the current state. It is `false` before fullscreen is entered, allowing the host to apply its initial layout before the next paint.
- Later notifications are emitted only when the state changes. The state resets to `false` when the iframe reloads, the Widget is destroyed, or the fullscreen preview exits.
- The return value removes the listener. Call it when the host component unmounts or no longer needs the state.

This event only describes the Agent preview state. The SDK does not resize, portal, or restyle the Widget container. To cover the host viewport, update the host-owned container in response to the event:

```js
const container = document.querySelector("#agent-slot")

const unsubscribePreviewFullscreen = window.MagicWidget.on("preview_fullscreen", (isFullscreen) => {
	// Keep the host-owned container aligned with the complete SDK state snapshot.
	container.classList.toggle("agent-preview-fullscreen", isFullscreen)
})

window.MagicWidget.mount({
	page: { type: "crew", crewId: "crew-demo" },
	target: container,
})

// Keep this function and invoke it when the host component is cleaned up.
// unsubscribePreviewFullscreen()
```

```css
.agent-preview-fullscreen {
	position: fixed;
	inset: 0;
	z-index: 1000;
}
```

Subscribe before `mount` to cover the initial mount and later remount state transitions. Store and invoke each unsubscribe function separately when subscribing to multiple events.

#### `agent_ready`

```ts
on(event: "agent_ready", listener: () => void): () => void
```

`agent_ready` means the iframe has completed page initialization and editor event subscription, and the current topic's draft phase has settled. It is an informational state notification, not a required gate for ordinary commands. If the first host action must wait for it, subscribe before `mount` and unsubscribe after the first notification.

## Mount Options

```ts
namespace MagicWidget {
	interface MountOptions {
		page: PageOptions
		auth?: AuthOptions
		config?: WidgetConfig
		iframe?: IframeOptions
		modal?: ModalOptions
		target?: HTMLElement
	}
}
```

### Inline mode

Pass a connected `HTMLElement` as `target` to render the iframe directly inside that container:

```js
const container = document.querySelector("#agent-slot")
window.MagicWidget.mount({
	page: { type: "crew", crewId: "crew-demo" },
	target: container,
})
window.MagicWidget.setInput("Summarize this fictional content")
window.MagicWidget.sendMessage("Process this fictional content now")
```

### Agent readiness and input maintenance

`agent_ready` means that page initialization and editor command subscriptions are complete, and that the current topic's draft phase has settled through restoration, an intentional skip, or failure fallback. It is an informational state notification, not an execution prerequisite enforced by the SDK or iframe bridge. Ordinary commands are sent after the iframe document loads and are not queued for `agent_ready`.

If the first host action must run after the existing topic draft has been handled, wait for one `agent_ready` event in host business logic. Subscribe before `mount` so the first event cannot be missed:

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
await window.MagicWidget.setInput("Fictional task prefix")
await window.MagicWidget.appendInput(", continue processing")
const currentInput = await window.MagicWidget.getInput()
await window.MagicWidget.clearInput()
```

`getInput` returns plain text and does not expose TipTap or internal Mention JSON. `appendInput` only appends text and never sends a message. `setInput` replaces the current editor value without deleting persisted draft history; subsequent draft persistence continues through the existing topic-scoped draft flow.

### New conversation

`newConversation` creates a new topic for the current Crew. The iframe returns its response after the new topic transition completes, and the SDK resolves the Promise from that response:

```js
await window.MagicWidget.newConversation()
await window.MagicWidget.setInput("Fictional content in the new conversation")
await window.MagicWidget.sendMessage("Send fictional content in the new conversation")
```

The host must give the container a non-zero width and height. Inline mode has no floating button, mask, or SDK header; it is visible after `mount`, while `open`, `close`, and `destroy` remain available. The SDK is a single-instance API, so a later `mount` replaces the previous instance.

All input, send, conversation, and configuration methods return a Promise. They reject with an error containing `code` values such as `NOT_MOUNTED`, `INVALID_INPUT`, `INVALID_CONFIG`, `IFRAME_NOT_READY`, or `COMMAND_FAILED`. The SDK waits only for the iframe document to load during initial navigation or reload, not for `agent_ready`; command results follow the iframe response.

The iframe uses a versioned `postMessage` protocol restricted to the SDK-derived Magic origin and the bound iframe window. Do not send secrets or unnecessary business data. Host `@` candidate injection and Agent-to-host action callbacks are not public in this phase.

### `config`

Controls the presentation of the SDK-embedded page without changing ordinary Magic Web pages:

```ts
namespace MagicWidget {
	type Layout = "desktop" | "mobile"

	interface WidgetConfig {
		layout?: Layout
		shell?: {
			appSidebar?: boolean
		}
		responsive?: {
			mobileDetection?: "viewport" | "device-and-viewport"
		}
		conversation?: {
			projectFiles?: boolean
			topicHistory?: boolean
			previewMode?: "split" | "fullscreen" | "switchable"
		}
	}
}
```

| Field                        | Description                                                    | Boundary                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`                     | Selects the desktop or mobile Crew conversation content.       | It does not replace the surrounding application shell. SDK embeds default to `mobile`; set `desktop` explicitly when needed.                                                                                         |
| `shell.appSidebar`           | Shows or hides the application sidebar.                        | Applied only to a valid SDK embed whose effective Crew layout is `desktop`; it does not affect mobile embedded layouts.                                                                                             |
| `responsive.mobileDetection` | Selects viewport-only or device-and-viewport mobile semantics. | SDK embeds default to `viewport` for compatibility with existing mobile hosts. Set `device-and-viewport` when narrow desktop iframes should retain desktop interactions.                                             |
| `conversation.projectFiles`  | Shows or hides the desktop project-files panel.                | Applied only by the desktop Crew conversation layout.                                                                                                                                                               |
| `conversation.topicHistory`  | Enables or disables the desktop topic-history entry and panel. | Applied only by the desktop Crew conversation layout.                                                                                                                                                               |
| `conversation.previewMode`   | Selects `split`, `fullscreen`, or `switchable` presentation.   | Desktop SDK embeds default to `switchable`; ordinary Magic Web pages keep their existing split layout.                                                                                                              |

`split` keeps the expanded conversation and preview side by side. `fullscreen` shows only the preview in the current host-controlled Widget container and closes the preview when the user exits; it covers the host viewport only when the host resizes the Widget container accordingly. `switchable` keeps the preview inside the Widget layout, collapses the conversation when a new preview session starts, and lets the user expand or collapse the conversation without recreating the preview. Manual fullscreen remains available and returns to the previous conversation layout when the user exits. The controller keeps the same iframe mounted, so file tabs, playback state, editor content, and loaded preview data remain intact. A runtime configuration update affects the next preview activation and does not force the current layout to change.

`updateConfig` validates the partial object and merges declared fields into the current configuration. After the iframe has loaded, the SDK sends the resulting complete snapshot through the protected message channel. The Promise resolves after Magic Web accepts the snapshot. Runtime updates do not modify the URL, replace `iframe.src`, or reload the iframe:

```js
await window.MagicWidget.updateConfig({
	responsive: {
		mobileDetection: "device-and-viewport",
	},
	conversation: {
		projectFiles: true,
		topicHistory: false,
		previewMode: "split",
	},
})
```

`layout` controls which Crew presentation is rendered, while `responsive.mobileDetection` controls device-sensitive interactions used by existing Magic Web components. SDK embeds default to `layout: "mobile"` and `mobileDetection: "viewport"` to preserve existing mobile host behavior. Hosts that need desktop presentation or desktop interactions inside a narrow PC iframe should explicitly set `layout: "desktop"` or `mobileDetection: "device-and-viewport"`. Device detection directly reuses Magic Web's existing `utils/devices.ts` `isMobile` result.

Initial configuration is encoded in an SDK-owned protected query parameter so the first frame can render the selected layout without a flash. This configuration only becomes active inside a real SDK iframe with matching protected embed metadata.

### `page`

Required. Selects the Magic Web page that the SDK may open. Free-form URLs and free-form routes are not accepted.

```ts
namespace MagicWidget {
	type PageOptions = CrewPageOptions

	interface CrewPageOptions {
		type: "crew"
		crewId: string
	}
}
```

| Page type | Required fields | Result                                               |
| --------- | --------------- | ---------------------------------------------------- |
| `crew`    | `crewId`        | Opens the crew conversation page for the given crew. |

Boundaries:

| Value                                  | Supported | Result                                                           |
| -------------------------------------- | --------- | ---------------------------------------------------------------- |
| `{ type: "crew", crewId: "crew-001" }` | Yes       | Opens the crew page on the script origin.                        |
| `{ type: "crew", crewId: "" }`         | No        | Empty crew IDs are rejected.                                     |
| `{ type: "freeform", ... }`            | No        | Unsupported page types are rejected by the public type contract. |
| `route` / `url`                        | No        | Free-form navigation is not part of the public API.              |

Currently, `page.type = "crew"` resolves to `/{clusterCode}/super/crew/{crewId}`. Without a deployment code it uses the SaaS route `/global/super/crew/{crewId}`; with `auth.deploymentCode` it uses the corresponding private deployment route.

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

`loginStrategy` is forwarded to the iframe URL as the `login-strategy` query parameter. Magic Web can use this value on `/login` to select the corresponding login form.

`deploymentCode` selects the login environment before the Crew page is entered. Omitting it or passing an empty string uses SaaS; a non-empty value selects the corresponding private deployment. If that environment is not logged in, Magic Web reuses the existing login entry with the deployment code filled in. If an account for that environment already exists, the existing account-switch flow is reused.

Use `loginStrategy: "private_deployment"` with `deploymentCode` when the private-deployment code form must be shown. The target page still uses `/{deploymentCode}/...`, so an existing private-deployment session is never checked against SaaS permissions; if login is required, the same code is forwarded to prefill the form. `privateDeploymentCode` is not supported.

`organizationCode` is forwarded to the iframe URL as the `organizationCode` query parameter. After the user is authenticated, Magic Web can use this value to switch into the requested Magic organization before rendering the target page. Empty strings are ignored.

Environment selection happens before login and Crew rendering, while organization switching happens after the target environment is authenticated. Organization lookup is limited to accounts from that deployment and never crosses environments for a matching code. This version does not expose additional authentication-state events.

Built-in strategy values:

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

If `iframe.query` also contains `login-strategy` or `organizationCode`, the corresponding `auth` option takes precedence.

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

| Option    | Description                                       | Boundary                                                                                                                                       |
| --------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow`   | Sets the iframe `allow` attribute.                | Use the standard browser permission-policy syntax, such as `"clipboard-read; clipboard-write"`.                                                |
| `sandbox` | Sets the iframe `sandbox` attribute.              | If omitted, no `sandbox` attribute is set. A strict sandbox may block Magic Web features, so only configure it when the host page requires it. |
| `query`   | Appends extra query parameters to the iframe URL. | `null` and `undefined` values are ignored. Array values append the same key multiple times.                                                    |

SDK-owned options take precedence over duplicate keys in `iframe.query`, such as `auth.organizationCode` for `organizationCode`, `auth.loginStrategy` for `login-strategy`, and the protected initial Widget configuration query.

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

| Option       | Description                                                                          | Default / Boundary                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `title`      | Panel header text. The same value is used as the iframe title.                       | Defaults to `"Magic"`.                                                                                                          |
| `width`      | Desktop panel width. A number is treated as pixels; a string is used as a CSS size.  | Defaults to `min(420px, calc(100vw - 32px))`. Ignored on mobile.                                                                |
| `height`     | Desktop panel height. A number is treated as pixels; a string is used as a CSS size. | Defaults to `min(680px, calc(100vh - 32px))`. Desktop has a built-in minimum panel height of `420px`. Ignored on mobile.        |
| `classNames` | Adds class names to specific modal slots.                                            | Adds class attributes only; for deterministic visual customization, prefer `styles`.                                            |
| `styles`     | Applies inline styles to specific modal slots.                                       | Supports camelCase CSS properties, kebab-case properties, and CSS custom properties. `null` and `undefined` values are ignored. |

Available modal slots:

| Slot        | Target                        |
| ----------- | ----------------------------- |
| `root`      | Widget root container.        |
| `layer`     | Fullscreen panel layer.       |
| `mask`      | Mobile mask behind the panel. |
| `container` | Panel container.              |
| `header`    | Panel header.                 |
| `title`     | Header title text.            |
| `close`     | Close button.                 |
| `body`      | Panel body around the iframe. |
| `iframe`    | Embedded iframe element.      |

Example:

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

## Interaction Behavior

| Environment        | Behavior                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop            | Displays a circular floating message button. Clicking it hides the button and opens a panel anchored over the button area. The panel can be dragged by its header and is kept inside the viewport when the window is resized. |
| Mobile, `<= 640px` | Opens as a bottom popover with a mask. The panel width is `100%`, height is `86vh`, bottom corners are square, and desktop `modal.width` / `modal.height` are ignored. Panel dragging is disabled.                            |

The floating button and the panel are mutually exclusive: only one is visible at a time. The panel can be closed by the close button, by clicking the mobile mask, by pressing `Escape`, or by calling `window.MagicWidget.close()`.

## Unsupported Mount Options

These options are not part of the public API:

```ts
appOrigin
clusterCode
organizationCode
route
trigger
url
zIndex
```

Use the script URL to select the Magic Web origin, `page` to select the supported target page, `auth.deploymentCode` to choose SaaS or a private deployment, `auth.loginStrategy: "private_deployment"` to prefill the private login form without changing the private target route, `auth.organizationCode` for post-login organization switching, and `modal` options for panel customization.
