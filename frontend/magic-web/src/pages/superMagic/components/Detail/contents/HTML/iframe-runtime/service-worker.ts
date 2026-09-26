type ServiceWorkerMockMode = "off" | "auto" | "on"

function isTargetWebView(): boolean {
	const ua = (navigator.userAgent || "").toLowerCase()
	return ["dingtalk", "aliapp(dingtalk", "wxwork", "wecom", "feishu", "lark"].some((name) =>
		ua.includes(name),
	)
}

/** Supply the existing no-op API only to selected WebViews that lack a native implementation. */
export default function install({ mode }: { mode: ServiceWorkerMockMode }): void {
	if (mode === "off") return
	try {
		if (mode !== "on" && !isTargetWebView()) return
		if ("serviceWorker" in navigator && navigator.serviceWorker) return
		const noop = () => undefined
		const unregister = () => Promise.resolve(true)
		const container = {
			register: (_scriptURL: string | URL, options?: { scope?: string }) =>
				Promise.resolve({
					scope: options?.scope || "/",
					active: {
						state: "activated",
						addEventListener: noop,
						removeEventListener: noop,
					},
					installing: null,
					waiting: null,
					update: () => Promise.resolve(),
					unregister,
					addEventListener: noop,
					removeEventListener: noop,
				}),
			getRegistration: () => Promise.resolve(null),
			getRegistrations: () => Promise.resolve([]),
			controller: null,
			ready: Promise.resolve({ scope: "/", active: { state: "activated" }, unregister }),
			addEventListener: noop,
			removeEventListener: noop,
			dispatchEvent: () => true,
		}
		Object.defineProperty(navigator, "serviceWorker", {
			value: container,
			writable: false,
			configurable: true,
		})
	} catch (error) {
		// Some embedded browsers expose a non-configurable or throwing native property.
		const message =
			error && typeof error === "object" && "message" in error ? error.message : undefined
		console.warn("ServiceWorker mock skipped:", message)
	}
}
