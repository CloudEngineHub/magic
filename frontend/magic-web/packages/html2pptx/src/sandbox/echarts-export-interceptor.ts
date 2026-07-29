const ECHARTS_EXPORT_TRACKER: unique symbol = Symbol("html2pptx.echarts-export-tracker")

interface EChartsZRenderLike {
	flush?: () => void
}

export interface ExportTrackedEChartsInstanceLike {
	isDisposed?: () => boolean
	getZr?: () => EChartsZRenderLike
	setOption?: (...args: unknown[]) => unknown
	resize?: (...args: unknown[]) => unknown
	on?: (eventName: string, listener: () => void) => void
	off?: (eventName: string, listener: () => void) => void
	__pendingUpdate?: unknown
	_scheduler?: { unfinished?: boolean }
	_pendingActions?: unknown[]
}

export interface ExportTrackedEChartsNamespaceLike {
	init?: (...args: unknown[]) => ExportTrackedEChartsInstanceLike
	getInstanceByDom?: (
		element: HTMLElement,
	) => ExportTrackedEChartsInstanceLike | undefined
}

export interface ExportTrackedEChartsInstance {
	element: HTMLElement | null
	instance: ExportTrackedEChartsInstanceLike
	setOptionCalls: number
	setOptionVersion: number
	renderedSetOptionVersion: number
	renderedCount: number
	finishedCount: number
	setOptionInFlight: boolean
	setOptionWrapped: boolean
	resizeWrapped: boolean
	eventsTracked: boolean
	originalResize?: (...args: unknown[]) => unknown
}

export interface EChartsExportTracker {
	accessorInstalled: boolean
	namespaceObserved: boolean
	namespaceIntercepted: boolean
	/** Sticky: once any namespace/instance cannot be wrapped, readiness must use the safe fallback. */
	interceptionFailed: boolean
	initCalls: number
	failedInitCalls: number
	mutationVersion: number
	currentNamespace?: ExportTrackedEChartsNamespaceLike
	instances: Map<ExportTrackedEChartsInstanceLike, ExportTrackedEChartsInstance>
}

interface InternalEChartsExportTracker extends EChartsExportTracker {
	wrappedNamespaces: WeakSet<object>
}

type EChartsTrackedWindow = Window & {
	[ECHARTS_EXPORT_TRACKER]?: InternalEChartsExportTracker
}

/**
 * Install before document.write so a UMD ECharts bundle assigning window.echarts is intercepted
 * before page code can call init/setOption. Export rendering does not need chart animation, so the
 * wrapper disables it and records enough lifecycle state to avoid treating an empty init as ready.
 */
export function installEChartsExportInterceptor(iframeWindow: Window): EChartsExportTracker {
	const trackedWindow = iframeWindow as EChartsTrackedWindow
	const existing = trackedWindow[ECHARTS_EXPORT_TRACKER]
	if (existing) return existing

	const tracker: InternalEChartsExportTracker = {
		accessorInstalled: false,
		namespaceObserved: false,
		namespaceIntercepted: false,
		interceptionFailed: false,
		initCalls: 0,
		failedInitCalls: 0,
		mutationVersion: 0,
		instances: new Map(),
		wrappedNamespaces: new WeakSet(),
	}
	trackedWindow[ECHARTS_EXPORT_TRACKER] = tracker

	let namespaceValue = readWindowECharts(iframeWindow)
	const descriptor = Object.getOwnPropertyDescriptor(iframeWindow, "echarts")
	if (descriptor && descriptor.configurable === false) {
		wrapEChartsNamespace(tracker, namespaceValue)
		if (!tracker.namespaceIntercepted) tracker.interceptionFailed = true
		return tracker
	}

	try {
		Object.defineProperty(iframeWindow, "echarts", {
			configurable: true,
			// Keep unrelated pages' Window enumeration stable even though the interceptor must be
			// installed before page code can dynamically load ECharts.
			enumerable: descriptor?.enumerable ?? false,
			get: () => {
				// ECharts' UMD bundle assigns an empty exports object before populating init.
				// Wrapping lazily on the next global read still happens before `echarts.init(...)`.
				wrapEChartsNamespace(tracker, namespaceValue)
				return namespaceValue
			},
			set: (value: unknown) => {
				namespaceValue = value
				wrapEChartsNamespace(tracker, value)
			},
		})
		tracker.accessorInstalled = true
	} catch {
		tracker.interceptionFailed = true
	}

	wrapEChartsNamespace(tracker, namespaceValue)
	return tracker
}

export function getEChartsExportTracker(
	iframeWindow: Window,
): EChartsExportTracker | undefined {
	return (iframeWindow as EChartsTrackedWindow)[ECHARTS_EXPORT_TRACKER]
}

/** Retry wrapping when a loader mutates an existing namespace instead of assigning a new one. */
export function refreshEChartsExportInterceptor(iframeWindow: Window): void {
	const tracker = (iframeWindow as EChartsTrackedWindow)[ECHARTS_EXPORT_TRACKER]
	if (!tracker) return
	wrapEChartsNamespace(tracker, readWindowECharts(iframeWindow))
}

/** Resize without recording a page mutation, then flush the zero-animation render. */
export function resizeTrackedEChartsForExport(state: ExportTrackedEChartsInstance): void {
	try {
		state.originalResize?.call(state.instance, {
			animation: { duration: 0 },
		})
	} catch {
		// Export-side resize is a best-effort settle step; the existing rendered frame remains valid.
	}
	flushEChartsRenderer(state.instance)
}

function wrapEChartsNamespace(
	tracker: InternalEChartsExportTracker,
	value: unknown,
): void {
	tracker.currentNamespace = undefined
	tracker.namespaceIntercepted = false
	if (!isObjectLike(value)) return
	tracker.namespaceObserved = true
	tracker.currentNamespace = value as ExportTrackedEChartsNamespaceLike

	if (tracker.wrappedNamespaces.has(value)) {
		tracker.namespaceIntercepted = true
		return
	}

	const namespace = value as ExportTrackedEChartsNamespaceLike
	const originalInit = namespace.init
	if (typeof originalInit !== "function") return

	const wrappedInit = function (this: unknown, ...args: unknown[]) {
		tracker.initCalls += 1
		const instance = originalInit.apply(this, args)
		trackEChartsInstance(tracker, instance, toHTMLElement(args[0]))
		return instance
	}

	if (!replaceMethod(namespace, "init", wrappedInit)) {
		tracker.interceptionFailed = true
		return
	}

	tracker.wrappedNamespaces.add(value)
	tracker.namespaceIntercepted = true
}

function trackEChartsInstance(
	tracker: InternalEChartsExportTracker,
	instance: ExportTrackedEChartsInstanceLike,
	element: HTMLElement | null,
): void {
	if (!isObjectLike(instance)) {
		tracker.failedInitCalls += 1
		tracker.interceptionFailed = true
		return
	}
	const existing = tracker.instances.get(instance)
	if (existing) {
		if (!existing.element && element) existing.element = element
		return
	}

	const state: ExportTrackedEChartsInstance = {
		element,
		instance,
		setOptionCalls: 0,
		setOptionVersion: 0,
		renderedSetOptionVersion: 0,
		renderedCount: 0,
		finishedCount: 0,
		setOptionInFlight: false,
		setOptionWrapped: false,
		resizeWrapped: false,
		eventsTracked: false,
	}
	tracker.instances.set(instance, state)

	const onRendered = () => {
		state.renderedCount += 1
		state.renderedSetOptionVersion = state.setOptionVersion
	}
	const onFinished = () => {
		state.finishedCount += 1
	}
	if (typeof instance.on === "function") {
		try {
			instance.on("rendered", onRendered)
			instance.on("finished", onFinished)
			state.eventsTracked = true
		} catch {
			state.eventsTracked = false
		}
	}

	const originalSetOption = instance.setOption
	if (typeof originalSetOption === "function") {
		const wrappedSetOption = function (this: unknown, ...args: unknown[]) {
			state.setOptionCalls += 1
			state.setOptionVersion += 1
			state.setOptionInFlight = true
			tracker.mutationVersion += 1
			const normalizedArgs = normalizeSetOptionArguments(args)
			let result: unknown
			try {
				result = originalSetOption.apply(this, normalizedArgs)
			} finally {
				state.setOptionInFlight = false
			}
			flushEChartsRenderer(instance)
			return result
		}
		state.setOptionWrapped = replaceMethod(instance, "setOption", wrappedSetOption)
	}

	const originalResize = instance.resize
	if (typeof originalResize === "function") {
		state.originalResize = originalResize
		const wrappedResize = function (this: unknown, ...args: unknown[]) {
			tracker.mutationVersion += 1
			const normalizedArgs = normalizeResizeArguments(args)
			const result = originalResize.apply(this, normalizedArgs)
			flushEChartsRenderer(instance)
			return result
		}
		state.resizeWrapped = replaceMethod(instance, "resize", wrappedResize)
		if (!state.resizeWrapped) state.originalResize = undefined
	}

	if (!state.setOptionWrapped || !state.resizeWrapped || !state.eventsTracked) {
		tracker.interceptionFailed = true
	}
}

function normalizeSetOptionArguments(args: unknown[]): unknown[] {
	const normalized = [...args]
	normalized[0] = disableEChartsAnimation(normalized[0])
	if (isRecord(normalized[1])) {
		normalized[1] = { ...normalized[1], lazyUpdate: false }
	} else if (typeof normalized[1] === "boolean" || normalized.length >= 3) {
		normalized[2] = false
	}
	return normalized
}

function normalizeResizeArguments(args: unknown[]): unknown[] {
	const normalized = [...args]
	const options = isRecord(normalized[0]) ? normalized[0] : {}
	const animation = isRecord(options.animation) ? options.animation : {}
	normalized[0] = {
		...options,
		animation: { ...animation, duration: 0 },
	}
	return normalized
}

function disableEChartsAnimation(option: unknown): unknown {
	if (!isRecord(option)) return option
	const normalized: Record<string, unknown> = {
		...option,
		animation: false,
		animationDuration: 0,
		animationDurationUpdate: 0,
		animationDelay: 0,
		animationDelayUpdate: 0,
		stateAnimation: disableStateAnimation(option.stateAnimation),
	}

	if (Array.isArray(option.series)) {
		normalized.series = option.series.map(disableSeriesAnimation)
	} else if (isRecord(option.series)) {
		normalized.series = disableSeriesAnimation(option.series)
	}
	if (isRecord(option.baseOption)) {
		normalized.baseOption = disableEChartsAnimation(option.baseOption)
	}
	if (Array.isArray(option.options)) {
		normalized.options = option.options.map(disableEChartsAnimation)
	}
	if (Array.isArray(option.media)) {
		normalized.media = option.media.map((entry) => {
			if (!isRecord(entry) || !isRecord(entry.option)) return entry
			return { ...entry, option: disableEChartsAnimation(entry.option) }
		})
	}
	return normalized
}

function disableSeriesAnimation(series: unknown): unknown {
	if (!isRecord(series)) return series
	return {
		...series,
		animation: false,
		animationDuration: 0,
		animationDurationUpdate: 0,
		animationDelay: 0,
		animationDelayUpdate: 0,
		stateAnimation: disableStateAnimation(series.stateAnimation),
		universalTransition: false,
	}
}

function disableStateAnimation(value: unknown): { duration: number } & Record<string, unknown> {
	return {
		...(isRecord(value) ? value : {}),
		duration: 0,
	}
}

function flushEChartsRenderer(instance: ExportTrackedEChartsInstanceLike): void {
	try {
		instance.getZr?.().flush?.()
	} catch {
		// Renderer internals are best-effort; readiness still verifies rendered/pending state.
	}
}

function replaceMethod(
	target: object,
	key: "init" | "setOption" | "resize",
	method: (...args: unknown[]) => unknown,
): boolean {
	const descriptor = findPropertyDescriptor(target, key)
	try {
		Object.defineProperty(target, key, {
			configurable: true,
			enumerable: descriptor?.enumerable ?? false,
			writable: true,
			value: method,
		})
		return (target as Record<string, unknown>)[key] === method
	} catch {
		try {
			;(target as Record<string, unknown>)[key] = method
			return (target as Record<string, unknown>)[key] === method
		} catch {
			return false
		}
	}
}

function findPropertyDescriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined {
	let current: object | null = target
	while (current) {
		const descriptor = Object.getOwnPropertyDescriptor(current, key)
		if (descriptor) return descriptor
		current = Object.getPrototypeOf(current) as object | null
	}
	return undefined
}

function readWindowECharts(iframeWindow: Window): unknown {
	try {
		return (iframeWindow as Window & { echarts?: unknown }).echarts
	} catch {
		return undefined
	}
}

function toHTMLElement(value: unknown): HTMLElement | null {
	if (!isObjectLike(value)) return null
	const candidate = value as { nodeType?: unknown; ownerDocument?: unknown }
	return candidate.nodeType === 1 && candidate.ownerDocument ? (value as HTMLElement) : null
}

function isObjectLike(value: unknown): value is object {
	return (typeof value === "object" && value !== null) || typeof value === "function"
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
