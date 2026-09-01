import { snapdom, type SnapdomPlugin } from "@zumer/snapdom"
import { INSPECTOR_MSG, type InspectedElementRect } from "./types"

interface CaptureOptions {
	iframe: HTMLIFrameElement
	/** Rectangle relative to the iframe's rendered viewport in CSS pixels. */
	selection: InspectedElementRect
	/** Optional rectangle already expressed in the host viewport's visual pixels. */
	viewportSelection?: ScreenRect
	/** Reusable current-tab capture session owned by the active inspector. */
	currentTabSession?: CurrentTabCaptureSession
	/** Exact origin of the rendered iframe, used by the screenshot bridge. */
	iframeTargetOrigin?: string
	/** Hide host inspector chrome before falling back to rendered-tab capture. */
	beforeCurrentTabCapture?: () => Promise<void>
}

/** Hide every page-defined cursor before a rendered-tab frame is captured. */
export function suppressCaptureCursor(iframe: HTMLIFrameElement): () => void {
	const iframeDocument = (() => {
		try {
			return iframe.contentDocument
		} catch {
			return null
		}
	})()
	const documents = Array.from(
		new Set([document, iframeDocument].filter((value): value is Document => Boolean(value))),
	)
	const styles = documents.map((captureDocument) => {
		const style = captureDocument.createElement("style")
		style.setAttribute("data-element-inspector-capture-cursor", "true")
		style.textContent = `
			*, *::before, *::after {
				cursor: none !important;
			}
		`
		;(captureDocument.head ?? captureDocument.documentElement).appendChild(style)
		return style
	})

	return () => {
		styles.forEach((style) => style.remove())
	}
}

export interface CurrentTabCaptureSession {
	acquire: () => Promise<MediaStream>
	release: () => void
}

/** Whether this browser can request a rendered tab/window capture stream. */
export function supportsCurrentTabCapture(): boolean {
	return (
		typeof navigator !== "undefined" &&
		typeof navigator.mediaDevices?.getDisplayMedia === "function"
	)
}

export type CurrentTabCaptureErrorCode =
	| "unsupported"
	| "permission-denied"
	| "cancelled"
	| "wrong-surface"
	| "no-video"

export class CurrentTabCaptureError extends Error {
	readonly code: CurrentTabCaptureErrorCode

	constructor(code: CurrentTabCaptureErrorCode, message: string) {
		super(message)
		this.name = "CurrentTabCaptureError"
		this.code = code
	}
}

interface ScreenRect {
	left: number
	top: number
	width: number
	height: number
}

const IFRAME_SCREENSHOT_ACK_TIMEOUT_MS = 500
const IFRAME_SCREENSHOT_RESULT_TIMEOUT_MS = 15_000

/** Yield until the browser can process a visual state update. */
export function waitForNextAnimationFrame(): Promise<void> {
	return new Promise<void>((resolve) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => resolve())
			return
		}
		setTimeout(resolve, 0)
	})
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result === "string") resolve(reader.result)
			else reject(new Error("Iframe screenshot response is not a data URL"))
		}
		reader.onerror = () => reject(reader.error ?? new Error("Failed to read iframe screenshot"))
		reader.readAsDataURL(blob)
	})
}

function getIframeTargetOrigin(iframe: HTMLIFrameElement, configuredOrigin?: string): string {
	if (configuredOrigin) return configuredOrigin
	try {
		return new URL(iframe.src || window.location.href, window.location.href).origin
	} catch {
		return window.location.origin
	}
}

/** Ask the iframe runtime to rasterize its own DOM without display-media permission. */
export async function captureWithIframeRuntime(options: CaptureOptions): Promise<string | null> {
	const targetWindow = options.iframe.contentWindow
	if (!targetWindow) return null

	const requestId = `inspector-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}`
	const targetOrigin = getIframeTargetOrigin(options.iframe, options.iframeTargetOrigin)

	return new Promise((resolve) => {
		let settled = false
		let timeoutId: number
		const cleanup = () => {
			window.removeEventListener("message", handleMessage)
			window.clearTimeout(timeoutId)
		}
		const finish = (value: string | null) => {
			if (settled) return
			settled = true
			cleanup()
			resolve(value)
		}
		const handleMessage = (event: MessageEvent) => {
			if (event.source !== targetWindow || event.origin !== targetOrigin) return
			const data = event.data
			if (!data || data.requestId !== requestId) return
			if (data.type === INSPECTOR_MSG.SCREENSHOT_ACK) {
				window.clearTimeout(timeoutId)
				timeoutId = window.setTimeout(
					() => finish(null),
					IFRAME_SCREENSHOT_RESULT_TIMEOUT_MS,
				)
				return
			}
			if (data.type !== INSPECTOR_MSG.SCREENSHOT_RESPONSE) return
			if (!data.success || !(data.blob instanceof Blob)) {
				finish(null)
				return
			}
			void blobToDataUrl(data.blob).then(
				(value) => finish(value),
				() => finish(null),
			)
		}
		timeoutId = window.setTimeout(() => finish(null), IFRAME_SCREENSHOT_ACK_TIMEOUT_MS)
		window.addEventListener("message", handleMessage)
		try {
			targetWindow.postMessage(
				{
					type: INSPECTOR_MSG.SCREENSHOT_REQUEST,
					requestId,
					selection: options.selection,
					outputSize: getCaptureOutputSize(options.selection, options.viewportSelection),
				},
				targetOrigin,
			)
		} catch {
			finish(null)
		}
	})
}

interface CaptureWindowMetrics {
	innerWidth: number
	innerHeight: number
	outerWidth: number
	outerHeight: number
}

interface CaptureSurfaceGeometry {
	width: number
	height: number
	viewportOffsetX: number
	viewportOffsetY: number
}

interface BitmapSize {
	width: number
	height: number
}

interface VideoFrameCallbackTarget {
	requestVideoFrameCallback?: (callback: () => void) => number
}

interface CaptureRootRenderSize {
	width: number
	height: number
}

interface CurrentTabDisplayMediaOptions extends DisplayMediaStreamOptions {
	preferCurrentTab?: boolean
	selfBrowserSurface?: "include" | "exclude"
	surfaceSwitching?: "include" | "exclude"
	monitorTypeSurfaces?: "include" | "exclude"
}

type PseudoElementName = "::before" | "::after"

interface PseudoElementStyleProperty {
	name: string
	value: string
	priority: string
}

interface PseudoElementRecord {
	path: number[]
	name: PseudoElementName
	content: string
	properties: PseudoElementStyleProperty[]
}

interface AnimationState {
	animation: Animation
	currentTime: CSSNumberish | null
	playState: AnimationPlayState
}

interface PseudoStyleSnapshot {
	content: string
	display: string
	visibility: string
	opacity: string
	backgroundImage: string
	backgroundColor: string
	borderStyle: string
	filter: string
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml"

function stopMediaStream(stream: MediaStream | null) {
	stream?.getTracks().forEach((track) => track.stop())
}

function hasLiveVideoTrack(stream: MediaStream | null): boolean {
	return Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"))
}

async function requestCurrentTabStream(): Promise<MediaStream> {
	if (!supportsCurrentTabCapture()) {
		throw new CurrentTabCaptureError(
			"unsupported",
			"Current browser does not support tab screenshots",
		)
	}

	return navigator.mediaDevices.getDisplayMedia({
		video: {
			displaySurface: "browser",
			cursor: "never",
		},
		audio: false,
		preferCurrentTab: true,
		selfBrowserSurface: "include",
		surfaceSwitching: "exclude",
		monitorTypeSurfaces: "exclude",
	} as CurrentTabDisplayMediaOptions)
}

/** Reuse one display-media permission grant for the lifetime of an inspector session. */
export function createCurrentTabCaptureSession(): CurrentTabCaptureSession {
	let stream: MediaStream | null = null
	let pending: Promise<MediaStream> | null = null
	let requestId = 0

	const release = () => {
		requestId += 1
		stopMediaStream(stream)
		stream = null
	}

	const acquire = () => {
		if (hasLiveVideoTrack(stream)) return Promise.resolve(stream as MediaStream)
		if (pending) return pending

		const currentRequestId = ++requestId
		const nextRequest = requestCurrentTabStream().then((nextStream) => {
			if (currentRequestId !== requestId) {
				stopMediaStream(nextStream)
				throw new DOMException("The capture session was released", "AbortError")
			}

			if (!hasLiveVideoTrack(nextStream)) {
				stopMediaStream(nextStream)
				throw new CurrentTabCaptureError(
					"no-video",
					"The selected capture surface has no video track",
				)
			}

			stream = nextStream
			const videoTrack = nextStream.getVideoTracks()[0]
			videoTrack?.addEventListener("ended", () => {
				if (stream === nextStream) {
					stream = null
				}
			})
			return nextStream
		})
		pending = nextRequest
		void nextRequest.then(
			() => {
				if (pending === nextRequest) pending = null
			},
			() => {
				if (pending === nextRequest) pending = null
			},
		)
		return nextRequest
	}

	return { acquire, release }
}

function isHtmlElementNode(value: Element | null | undefined): value is HTMLElement {
	return value?.nodeType === 1 && value.namespaceURI === HTML_NAMESPACE
}

/** Keep the screenshot crisp while preserving the drag rectangle's CSS size. */
export const CAPTURE_OUTPUT_SCALE = 2

/** Return whether a pseudo-element contributes visible content or styling. */
export function shouldMaterializePseudoElement(style: PseudoStyleSnapshot): boolean {
	const hasContent = style.content !== "none" && style.content !== "normal"
	const hasVisualLayer =
		style.backgroundImage !== "none" ||
		style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
		style.borderStyle !== "none" ||
		style.filter !== "none"

	return (
		style.display !== "none" &&
		style.visibility !== "hidden" &&
		style.opacity !== "0" &&
		(hasContent || hasVisualLayer)
	)
}

/** Prefer the host drag size so iframe zoom does not change the PNG dimensions. */
export function getCaptureOutputSize(
	selection: InspectedElementRect,
	viewportSelection?: ScreenRect,
	outputScale = CAPTURE_OUTPUT_SCALE,
): BitmapSize {
	return {
		width: Math.max(1, Math.round((viewportSelection?.width ?? selection.width) * outputScale)),
		height: Math.max(
			1,
			Math.round((viewportSelection?.height ?? selection.height) * outputScale),
		),
	}
}

export interface BitmapCropSelection extends InspectedElementRect {
	/** Fallback output dimensions in the source surface's CSS pixels. */
	outputWidth: number
	outputHeight: number
}

/** Resolve the captured surface coordinate system used by getDisplayMedia. */
export function getCaptureSurfaceGeometry(
	displaySurface: string | undefined,
	metrics: CaptureWindowMetrics,
): CaptureSurfaceGeometry {
	if (displaySurface === "window") {
		return {
			width: Math.max(metrics.outerWidth, metrics.innerWidth, 1),
			height: Math.max(metrics.outerHeight, metrics.innerHeight, 1),
			// Browser window captures include the browser chrome. On macOS the
			// viewport is centered horizontally and starts below the toolbar.
			viewportOffsetX: Math.max(0, (metrics.outerWidth - metrics.innerWidth) / 2),
			viewportOffsetY: Math.max(0, metrics.outerHeight - metrics.innerHeight),
		}
	}

	return {
		width: Math.max(metrics.innerWidth, 1),
		height: Math.max(metrics.innerHeight, 1),
		viewportOffsetX: 0,
		viewportOffsetY: 0,
	}
}

/** Convert iframe CSS coordinates to coordinates in a rendered target rectangle. */
export function toRenderedSelection(
	iframe: Pick<HTMLIFrameElement, "clientWidth" | "clientHeight">,
	iframeRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
	selection: InspectedElementRect,
): ScreenRect {
	const scaleX = iframeRect.width / Math.max(1, iframe.clientWidth)
	const scaleY = iframeRect.height / Math.max(1, iframe.clientHeight)

	return {
		left: iframeRect.left + selection.left * scaleX,
		top: iframeRect.top + selection.top * scaleY,
		width: selection.width * scaleX,
		height: selection.height * scaleY,
	}
}

/** Prefer the host drag rectangle when the iframe document cannot be read. */
export function resolveCaptureScreenSelection(
	iframe: Pick<HTMLIFrameElement, "clientWidth" | "clientHeight">,
	iframeRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
	selection: InspectedElementRect,
	viewportSelection?: ScreenRect,
): ScreenRect {
	return viewportSelection ?? toRenderedSelection(iframe, iframeRect, selection)
}

/** Recalculate same-origin tab crops after browser sharing UI changes the viewport. */
export function resolveCurrentTabScreenSelection(
	iframe: Pick<HTMLIFrameElement, "clientWidth" | "clientHeight">,
	iframeRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
	selection: InspectedElementRect,
	viewportSelection: ScreenRect | undefined,
	sameOrigin: boolean,
): ScreenRect {
	return sameOrigin
		? toRenderedSelection(iframe, iframeRect, selection)
		: resolveCaptureScreenSelection(iframe, iframeRect, selection, viewportSelection)
}

/** Convert iframe viewport coordinates into the coordinate system of a snapdom root. */
export function getRootCaptureSelection(
	selection: InspectedElementRect,
	rootRect: Pick<DOMRect, "left" | "top">,
): InspectedElementRect {
	return {
		...selection,
		// Both rectangles are viewport-relative, so scrolling is already
		// reflected in rootRect and must not be added a second time.
		left: selection.left - rootRect.left,
		top: selection.top - rootRect.top,
	}
}

/** Map CSS coordinates to source pixels; the caller may override output size. */
export function toBitmapCropSelection(
	selection: InspectedElementRect,
	bitmap: BitmapSize,
	renderSize: BitmapSize,
): BitmapCropSelection {
	const scaleX = bitmap.width / Math.max(1, renderSize.width)
	const scaleY = bitmap.height / Math.max(1, renderSize.height)

	return {
		left: selection.left * scaleX,
		top: selection.top * scaleY,
		width: selection.width * scaleX,
		height: selection.height * scaleY,
		outputWidth: selection.width,
		outputHeight: selection.height,
	}
}

export function resolveCaptureRoot(
	documentBody: HTMLElement,
	selection: InspectedElementRect,
): HTMLElement {
	const explicitRoot = documentBody.ownerDocument.querySelector<HTMLElement>(
		"[data-magic-capture-root]",
	)
	if (explicitRoot) return explicitRoot

	const roots = Array.from(
		documentBody.querySelectorAll<HTMLElement>(".slide-container, main.ft-canvas, main.slide"),
	)

	const centerX = selection.left + selection.width / 2
	const centerY = selection.top + selection.height / 2
	const containingRoot = roots
		.map((root) => ({ root, rect: root.getBoundingClientRect() }))
		.filter(
			({ rect }) =>
				centerX >= rect.left &&
				centerX <= rect.right &&
				centerY >= rect.top &&
				centerY <= rect.bottom,
		)
		.sort((first, second) => {
			const firstArea = first.rect.width * first.rect.height
			const secondArea = second.rect.width * second.rect.height
			return firstArea - secondArea
		})[0]

	if (containingRoot?.root) return containingRoot.root

	// Ordinary HTML pages do not have a stable local capture root. Their
	// sections can be transformed, independently scrolled, or positioned next
	// to fixed page chrome. Capturing the body keeps the crop in the same page
	// coordinate system as the iframe selection. The body is also the fallback
	// when a PPT root is not found.
	return documentBody
}

/** Ordinary HTML pages must be captured from the rendered tab, not a detached body clone. */
export function shouldCaptureCurrentTab(
	documentBody: HTMLElement,
	selection: InspectedElementRect,
): boolean {
	return resolveCaptureRoot(documentBody, selection) === documentBody
}

/** Prewarm screen sharing for ordinary/cross-origin pages before the first drag. */
export function shouldPrewarmCurrentTabCapture(iframe: HTMLIFrameElement): boolean {
	let document: Document | null = null
	try {
		document = iframe.contentDocument
	} catch {
		return true
	}
	if (!document?.body) return true
	if (document.querySelector("[data-magic-capture-root]")) return false
	return !document.querySelector(".slide-container, main.ft-canvas, main.slide")
}

/**
 * Return the root's current layout size for snapdom.
 *
 * `scrollWidth`/`scrollHeight` describe overflow content, not the layout that
 * the user is looking at. Using them as the bitmap mapping size makes the crop
 * scale differ from the rendered root and moves the visible content away from
 * the drag rectangle. Prefer the root's stable visual dimensions instead.
 */
export function getCaptureRootRenderSize(
	root: Pick<HTMLElement, "offsetWidth" | "offsetHeight" | "clientWidth" | "clientHeight">,
	visualRect?: Pick<DOMRect, "width" | "height">,
): CaptureRootRenderSize {
	return {
		width: Math.max(visualRect?.width || root.offsetWidth || root.clientWidth, 1),
		height: Math.max(visualRect?.height || root.offsetHeight || root.clientHeight, 1),
	}
}

function getElementPath(root: HTMLElement, element: HTMLElement): number[] | null {
	const path: number[] = []
	let current: HTMLElement | null = element

	while (current && current !== root) {
		const parent: HTMLElement | null = current.parentElement
		if (!parent) return null
		const index = Array.prototype.indexOf.call(parent.children, current) as number
		if (index < 0) return null
		path.unshift(index)
		current = parent
	}

	return current === root ? path : null
}

function resolveElementPath(root: HTMLElement, path: number[]): HTMLElement | null {
	let current = root
	for (const index of path) {
		const child = current.children.item(index)
		if (!isHtmlElementNode(child)) return null
		current = child
	}
	return current
}

function collectPseudoElements(root: HTMLElement): PseudoElementRecord[] {
	const view = root.ownerDocument.defaultView
	if (!view) return []

	const records: PseudoElementRecord[] = []
	const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
	for (const source of elements) {
		const path = getElementPath(root, source)
		if (!path) continue

		for (const name of ["::before", "::after"] satisfies PseudoElementName[]) {
			const computed = view.getComputedStyle(source, name)
			if (!shouldMaterializePseudoElement(computed)) continue

			records.push({
				path,
				name,
				content: computed.content,
				properties: Array.from({ length: computed.length }, (_, index) => {
					const property = computed.item(index)
					return {
						name: property,
						value: computed.getPropertyValue(property),
						priority: computed.getPropertyPriority(property),
					}
				}),
			})
		}
	}

	return records
}

/**
 * Materialize pseudo-elements only inside snapdom's detached clone.
 *
 * snapdom can copy simple pseudo-elements, but foreignObject rendering is
 * inconsistent for absolute pseudo-elements with layered backgrounds. PPT
 * slides use those layers for the dark image mask and texture. Mutating the
 * live iframe tree caused a visible relayout while capture was in progress, so
 * the replacement nodes and suppression attributes must stay in the clone.
 */
export function createPseudoElementsCapturePlugin(): SnapdomPlugin {
	let records: PseudoElementRecord[] = []

	return {
		name: "magic-element-inspector-pseudo-elements",
		beforeClone(context) {
			records = isHtmlElementNode(context.element)
				? collectPseudoElements(context.element)
				: []
		},
		afterClone(context) {
			if (!isHtmlElementNode(context.clone) || records.length === 0) return

			const cloneRoot = context.clone
			const targets = records.map((record) => ({
				record,
				target: resolveElementPath(cloneRoot, record.path),
			}))
			const style = cloneRoot.ownerDocument.createElement("style")
			style.setAttribute("data-element-inspector-pseudo-style", "true")
			style.textContent = `
				[data-element-inspector-pseudo-before]::before,
				[data-element-inspector-pseudo-after]::after {
					content: none !important;
					display: none !important;
				}
			`
			cloneRoot.appendChild(style)

			for (const { record, target } of targets) {
				if (!target) continue

				const pseudo = cloneRoot.ownerDocument.createElement("span")
				pseudo.setAttribute("aria-hidden", "true")
				pseudo.setAttribute("data-element-inspector-pseudo", record.name)
				for (const property of record.properties) {
					pseudo.style.setProperty(property.name, property.value, property.priority)
				}
				pseudo.style.content = "normal"
				pseudo.style.pointerEvents = "none"

				const hasTextContent =
					record.content.startsWith('"') && record.content.endsWith('"')
				if (hasTextContent) pseudo.textContent = record.content.slice(1, -1)

				const attribute =
					record.name === "::before"
						? "data-element-inspector-pseudo-before"
						: "data-element-inspector-pseudo-after"
				target.setAttribute(attribute, "true")
				if (record.name === "::before") target.insertBefore(pseudo, target.firstChild)
				else target.appendChild(pseudo)
			}
		},
	}
}

function restoreAnimationState({ animation, currentTime, playState }: AnimationState) {
	try {
		animation.currentTime = currentTime
		if (playState === "running") animation.play()
		else if (playState === "paused") animation.pause()
		else if (playState === "finished") animation.finish()
	} catch {
		// An animation can disappear while snapdom waits for remote resources.
	}
}

/** Pause iframe motion without inserting layout-affecting nodes into the live page. */
export function freezeDocumentForCapture(document: Document): () => void {
	const animations =
		typeof document.getAnimations === "function"
			? document.getAnimations({ subtree: true }).map<AnimationState>((animation) => ({
					animation,
					currentTime: animation.currentTime,
					playState: animation.playState,
				}))
			: []
	for (const { animation } of animations) {
		try {
			animation.pause()
		} catch {
			// Ignore animations whose timeline is no longer active.
		}
	}

	const scrollBehavior = [document.documentElement, document.body]
		.filter(isHtmlElementNode)
		.map((element) => ({ element, value: element.style.scrollBehavior }))
	for (const { element } of scrollBehavior) element.style.scrollBehavior = "auto"

	return () => {
		for (const { element, value } of scrollBehavior) element.style.scrollBehavior = value
		for (const state of animations) restoreAnimationState(state)
	}
}

async function waitForStableCaptureFrame(document: Document): Promise<void> {
	const view = document.defaultView
	if (!view?.requestAnimationFrame) return

	await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()))
	await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()))
}

interface CaptureRectSnapshot {
	left: number
	top: number
	width: number
	height: number
}

function readCaptureRect(element: Element): CaptureRectSnapshot {
	const rect = element.getBoundingClientRect()
	return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function areCaptureRectsEqual(first: CaptureRectSnapshot, second: CaptureRectSnapshot): boolean {
	return (
		Math.abs(first.left - second.left) < 0.1 &&
		Math.abs(first.top - second.top) < 0.1 &&
		Math.abs(first.width - second.width) < 0.1 &&
		Math.abs(first.height - second.height) < 0.1
	)
}

/** Wait until a capture surface has produced the same layout rect twice. */
export async function waitForStableCaptureRect(
	element: Element,
	maxFrames = 6,
): Promise<CaptureRectSnapshot> {
	let previous = readCaptureRect(element)
	for (let frame = 0; frame < maxFrames; frame += 1) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		const current = readCaptureRect(element)
		if (areCaptureRectsEqual(previous, current)) return current
		previous = current
	}
	return previous
}

/** Wait for the display stream to present a frame produced after inspector chrome was hidden. */
export async function waitForFreshCaptureVideoFrame(video: HTMLVideoElement): Promise<void> {
	const requestVideoFrameCallback = (video as HTMLVideoElement & VideoFrameCallbackTarget)
		.requestVideoFrameCallback
	if (typeof requestVideoFrameCallback === "function") {
		await new Promise<void>((resolve) => {
			requestVideoFrameCallback.call(video, () => resolve())
		})
		return
	}

	await new Promise<void>((resolve) => setTimeout(resolve, 50))
}

function cropCanvas(
	source: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number,
	selection: BitmapCropSelection | InspectedElementRect,
	outputSize?: BitmapSize,
): string {
	const left = Math.max(0, Math.round(selection.left))
	const top = Math.max(0, Math.round(selection.top))
	const width = Math.max(1, Math.min(Math.round(selection.width), sourceWidth - left))
	const height = Math.max(1, Math.min(Math.round(selection.height), sourceHeight - top))
	const outputWidth = Math.max(
		1,
		Math.round(
			outputSize?.width ?? ("outputWidth" in selection ? selection.outputWidth : width),
		),
	)
	const outputHeight = Math.max(
		1,
		Math.round(
			outputSize?.height ?? ("outputHeight" in selection ? selection.outputHeight : height),
		),
	)
	const canvas = document.createElement("canvas")
	canvas.width = outputWidth
	canvas.height = outputHeight
	const context = canvas.getContext("2d")
	if (!context) throw new Error("Canvas 2D context is unavailable")
	context.drawImage(source, left, top, width, height, 0, 0, outputWidth, outputHeight)
	return canvas.toDataURL("image/png")
}

async function captureSameOriginIframe({
	iframe,
	selection,
	viewportSelection,
}: CaptureOptions): Promise<string> {
	const documentBody = iframe.contentDocument?.body
	if (!documentBody) throw new Error("The HTML iframe document is unavailable")
	// PPT previews can contain several stacked sections in the body while only
	// one slide is visible. Select the root containing the drag center so the
	// crop cannot accidentally use the first slide in the document.
	const captureRoot = resolveCaptureRoot(documentBody, selection)
	const rootRect = await waitForStableCaptureRect(captureRoot)
	const { width: renderWidth, height: renderHeight } = getCaptureRootRenderSize(
		captureRoot,
		rootRect,
	)
	const result = await snapdom(captureRoot, {
		// Render the selected root at its CSS size so the crop uses the same
		// coordinate system as the inspector rect.
		width: renderWidth,
		height: renderHeight,
		dpr: CAPTURE_OUTPUT_SCALE,
		backgroundColor: "#ffffff",
		plugins: [createPseudoElementsCapturePlugin()],
	})
	// snapdom.toBlob() defaults to SVG. createImageBitmap cannot decode the
	// foreignObject SVG generated for this page, so request a raster PNG here.
	const blob = await result.toBlob({ type: "image/png" })
	const bitmap = await createImageBitmap(blob)
	try {
		const rootSelection = getRootCaptureSelection(selection, rootRect)
		const bitmapSelection = toBitmapCropSelection(rootSelection, bitmap, {
			width: renderWidth,
			height: renderHeight,
		})
		const outputSize = getCaptureOutputSize(selection, viewportSelection)
		return cropCanvas(bitmap, bitmap.width, bitmap.height, bitmapSelection, outputSize)
	} finally {
		bitmap.close()
	}
}

async function captureCurrentTab({
	iframe,
	selection,
	viewportSelection,
	currentTabSession,
}: CaptureOptions): Promise<string> {
	let stream: MediaStream
	try {
		stream = currentTabSession
			? await currentTabSession.acquire()
			: await requestCurrentTabStream()
	} catch (error) {
		if (error instanceof CurrentTabCaptureError) throw error
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new CurrentTabCaptureError("cancelled", "Tab capture permission was cancelled")
		}
		if (error instanceof DOMException && error.name === "NotAllowedError") {
			throw new CurrentTabCaptureError(
				"permission-denied",
				"Tab capture permission was denied",
			)
		}
		throw error
	}
	const video = document.createElement("video")
	video.muted = true
	video.playsInline = true
	video.srcObject = stream

	try {
		const track = stream.getVideoTracks()[0]
		const displaySurface = track?.getSettings().displaySurface
		if (displaySurface === "monitor") {
			currentTabSession?.release()
			throw new CurrentTabCaptureError(
				"wrong-surface",
				"Please choose the current browser tab or window",
			)
		}
		if (!track) {
			throw new CurrentTabCaptureError(
				"no-video",
				"The selected capture surface has no video track",
			)
		}

		await video.play()
		await new Promise<void>((resolve) => {
			if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
				resolve()
				return
			}
			video.addEventListener("loadeddata", () => resolve(), { once: true })
		})
		await waitForFreshCaptureVideoFrame(video)

		const iframeRect = await waitForStableCaptureRect(iframe)
		let sameOrigin = false
		try {
			sameOrigin = Boolean(iframe.contentDocument)
		} catch {
			sameOrigin = false
		}
		const screenSelection = resolveCurrentTabScreenSelection(
			iframe,
			iframeRect,
			selection,
			viewportSelection,
			sameOrigin,
		)
		const surface = getCaptureSurfaceGeometry(displaySurface, {
			innerWidth: window.innerWidth,
			innerHeight: window.innerHeight,
			outerWidth: window.outerWidth,
			outerHeight: window.outerHeight,
		})
		const scaleX = video.videoWidth / surface.width
		const scaleY = video.videoHeight / surface.height
		return cropCanvas(
			video,
			video.videoWidth,
			video.videoHeight,
			{
				left: (surface.viewportOffsetX + screenSelection.left) * scaleX,
				top: (surface.viewportOffsetY + screenSelection.top) * scaleY,
				width: screenSelection.width * scaleX,
				height: screenSelection.height * scaleY,
			},
			getCaptureOutputSize(selection, viewportSelection),
		)
	} finally {
		if (!currentTabSession) stopMediaStream(stream)
		video.srcObject = null
	}
}

/** Capture a selected iframe region from the rendered tab or a stable PPT capture root. */
export async function captureIframeRegion(options: CaptureOptions): Promise<string> {
	let iframeDocument: Document | null = null
	try {
		iframeDocument = options.iframe.contentDocument
	} catch {
		iframeDocument = null
	}
	if (!iframeDocument?.body || shouldCaptureCurrentTab(iframeDocument.body, options.selection)) {
		const iframeScreenshot = await captureWithIframeRuntime(options)
		if (iframeScreenshot) return iframeScreenshot
		await options.beforeCurrentTabCapture?.()
		return captureCurrentTab(options)
	}

	const restoreDocument = iframeDocument
		? freezeDocumentForCapture(iframeDocument)
		: () => undefined

	try {
		await waitForStableCaptureFrame(iframeDocument)
		return await captureSameOriginIframe(options)
	} finally {
		restoreDocument()
	}
}
