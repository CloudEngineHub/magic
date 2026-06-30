# Magic Widget SDK

Magic Widget SDK is a browser UMD script for embedding Magic Web into an external site. After the script is loaded, the host page can call `window.MagicWidget.mount(...)` to display a floating message button. Clicking the button hides the button and opens a Magic Web page inside an iframe panel.

## Script URL

Use the SDK file served by the Magic Web deployment that should host the embedded iframe:

```html
<script src="https://your-magic-domain.com/sdk/magic-widget.js"></script>
```

The iframe origin is inferred from the script URL. For example, if the script is loaded from `https://your-magic-domain.com/sdk/magic-widget.js`, the iframe also opens on `https://your-magic-domain.com`.

The SDK does not accept an `appOrigin` option. To switch environments, load the script from the corresponding Magic Web domain.

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

| Method | Signature | Description | Boundary |
| --- | --- | --- | --- |
| `mount` | `(options: MagicWidget.MountOptions) => void` | Creates the widget and displays the floating button. Calling `mount` again replaces the previous widget instance. | Must be called in a browser document after `document.body` exists. |
| `open` | `() => void` | Opens the panel programmatically. The floating button is hidden while the panel is open. | Must be called after `mount`; otherwise an error is thrown. |
| `close` | `() => void` | Closes the panel programmatically. The floating button is shown again after the close animation. | Safe to call when the panel is already closed. |
| `destroy` | `() => void` | Removes the widget DOM, event listeners, timers, and current configuration. | Call `mount` again before using `open`. |

The object also exposes `window.MagicWidget.version` for diagnostics.

## Mount Options

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

| Page type | Required fields | Result |
| --- | --- | --- |
| `crew` | `crewId` | Opens the crew conversation page for the given crew. |

Boundaries:

| Value | Supported | Result |
| --- | --- | --- |
| `{ type: "crew", crewId: "crew-001" }` | Yes | Opens the crew page on the script origin. |
| `{ type: "crew", crewId: "" }` | No | Empty crew IDs are rejected. |
| `{ type: "freeform", ... }` | No | Unsupported page types are rejected by the public type contract. |
| `route` / `url` | No | Free-form navigation is not part of the public API. |

Currently, `page.type = "crew"` resolves to `/{clusterCode}/super/crew/{crewId}` with the built-in default cluster code `default`. For example, `crewId: "crew-001"` opens `/default/super/crew/crew-001` on the script origin.

### `auth`

```ts
namespace MagicWidget {
	interface AuthOptions {
		loginStrategy?: LoginStrategy
		organizationCode?: string
	}
}
```

`loginStrategy` is forwarded to the iframe URL as the `login-strategy` query parameter. Magic Web can use this value on `/login` to select the corresponding login form.

`organizationCode` is forwarded to the iframe URL as the `organizationCode` query parameter. After the user is authenticated, Magic Web can use this value to switch into the requested Magic organization before rendering the target page. Empty strings are ignored.

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
		| "redirect"
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

| Option | Description | Boundary |
| --- | --- | --- |
| `allow` | Sets the iframe `allow` attribute. | Use the standard browser permission-policy syntax, such as `"clipboard-read; clipboard-write"`. |
| `sandbox` | Sets the iframe `sandbox` attribute. | If omitted, no `sandbox` attribute is set. A strict sandbox may block Magic Web features, so only configure it when the host page requires it. |
| `query` | Appends extra query parameters to the iframe URL. | `null` and `undefined` values are ignored. Array values append the same key multiple times. |

SDK-owned options take precedence over duplicate keys in `iframe.query`, such as `auth.organizationCode` for `organizationCode` and `auth.loginStrategy` for `login-strategy`.

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

| Option | Description | Default / Boundary |
| --- | --- | --- |
| `title` | Panel header text. The same value is used as the iframe title. | Defaults to `"Magic"`. |
| `width` | Desktop panel width. A number is treated as pixels; a string is used as a CSS size. | Defaults to `min(420px, calc(100vw - 32px))`. Ignored on mobile. |
| `height` | Desktop panel height. A number is treated as pixels; a string is used as a CSS size. | Defaults to `min(680px, calc(100vh - 32px))`. Desktop has a built-in minimum panel height of `420px`. Ignored on mobile. |
| `classNames` | Adds class names to specific modal slots. | Adds class attributes only; for deterministic visual customization, prefer `styles`. |
| `styles` | Applies inline styles to specific modal slots. | Supports camelCase CSS properties, kebab-case properties, and CSS custom properties. `null` and `undefined` values are ignored. |

Available modal slots:

| Slot | Target |
| --- | --- |
| `root` | Widget root container. |
| `layer` | Fullscreen panel layer. |
| `mask` | Mobile mask behind the panel. |
| `container` | Panel container. |
| `header` | Panel header. |
| `title` | Header title text. |
| `close` | Close button. |
| `body` | Panel body around the iframe. |
| `iframe` | Embedded iframe element. |

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

| Environment | Behavior |
| --- | --- |
| Desktop | Displays a circular floating message button. Clicking it hides the button and opens a panel anchored over the button area. The panel can be dragged by its header and is kept inside the viewport when the window is resized. |
| Mobile, `<= 640px` | Opens as a bottom popover with a mask. The panel width is `100%`, height is `86vh`, bottom corners are square, and desktop `modal.width` / `modal.height` are ignored. Panel dragging is disabled. |

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

Use the script URL to select the Magic Web origin, `page` to select the supported target page, `auth.organizationCode` for organization switching, and `modal` options for panel customization.
