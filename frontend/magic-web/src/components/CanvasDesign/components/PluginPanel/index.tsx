import { GripHorizontal, Puzzle, X } from "lucide-react"
import {
	forwardRef,
	memo,
	type ChangeEvent,
	type CSSProperties,
	type PointerEventHandler,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"
import { toast } from "sonner"

import {
	isSafePluginRelativePath,
	normalizePluginLocale,
	resolvePluginIcon,
	resolvePluginPackagePath,
	resolvePluginText,
} from "../../canvas/plugins/resolve"
import { withHistoryManagerAsync } from "../../canvas/utils/elementUtils"
import { getMediaDimensions, isImageFile, validateFile } from "../../canvas/utils/utils"
import type { Canvas } from "../../canvas/Canvas"
import type { CanvasDesignPlugin } from "../../canvas/types"
import { ImageElement as ImageElementClass } from "../../canvas/element/elements/ImageElement"
import type { GenerateImageRequest, ImageModelItem } from "../../types.magic"
import { useCanvas } from "../../context/CanvasContext"
import { useHostUiLocale } from "../../context/HostUiLocaleContext"
import ReferenceResourcePopover from "../MessageEditor/reference-assets/ReferenceResourcePopover"
import {
	REFERENCE_RESOURCE_SOURCE_TYPES,
	type ReferenceResourceTypeFilter,
	type ReferenceResourceSourceType,
} from "../MessageEditor/reference-assets/reference-resource.types"
import type { ReferenceResourcePanelItem, ReferenceResourcePanelSelectContext } from "../../types"
import styles from "./index.module.css"

const noop = () => undefined
const PLUGIN_WINDOW_WIDTH = 420
const PLUGIN_WINDOW_MARGIN = 8
const PLUGIN_PANEL_POSITION_CACHE_PREFIX = "magic-canvas:plugin-panel-position:"
const PLUGIN_FILE_PICKER_X_VAR = "--plugin-file-picker-x"
const PLUGIN_FILE_PICKER_Y_VAR = "--plugin-file-picker-y"
const PLUGIN_FILE_PICKER_BOTTOM_VAR = "--plugin-file-picker-bottom"

interface PluginWindowPosition {
	x: number
	y: number
}

interface PluginPoint {
	x: number
	y: number
}

interface PluginView {
	label: string
	description: string
	icon: ReturnType<typeof resolvePluginIcon>
	srcDoc: string | null
}

type PluginFilePickerType = "image" | "video" | "audio" | "file"

interface PluginPickFilesOptions {
	type?: PluginFilePickerType
	multiple?: boolean
	maxCount?: number
	accept?: string[]
}

interface PluginFileAsset {
	id: string
	path: string
	url: string
	src: string
	fileName: string
	type?: PluginFilePickerType
	width?: number
	height?: number
}

interface PluginFilePickerRequest {
	requestId: string
	options?: PluginPickFilesOptions
	anchorPosition?: PluginPoint
}

interface PluginGenerateAndPlaceParams extends Partial<GenerateImageRequest> {
	width?: number
	height?: number
	count?: number
	select?: boolean
}

type PluginRuntimeMessage =
	| {
			type: "magic-canvas-plugin:toast"
			message: string
			toastType?: "info" | "success" | "warning" | "error"
	  }
	| {
			type: "magic-canvas-plugin:close"
	  }
	| {
			type: "magic-canvas-plugin:error"
			message: string
	  }
	| {
			type: "magic-canvas-plugin:set-height"
			height: number
	  }
	| {
			type: "magic-canvas-plugin:resolve-resource"
			requestId: string
			path: string
	  }
	| {
			type: "magic-canvas-plugin:pick-files"
			requestId: string
			options?: PluginPickFilesOptions
			triggerPoint?: PluginPoint
	  }
	| {
			type: "magic-canvas-plugin:pointer-down"
	  }
	| {
			type: "magic-canvas-plugin:get-image-models"
			requestId: string
	  }
	| {
			type: "magic-canvas-plugin:generate-and-place"
			requestId: string
			params: PluginGenerateAndPlaceParams
	  }
function createPluginSrcDoc(plugin: CanvasDesignPlugin, locale: string) {
	const runtimeCode = plugin.runtimeCode
	const runtimeUrl = plugin.runtimeUrl
	if (!runtimeCode && !runtimeUrl) return null

	const bootstrap = {
		locale,
		locales: plugin.locales ?? {},
	}
	const runtimeScript = runtimeCode
		? `<script>${escapeInlineScript(runtimeCode)}</script>`
		: `<script src="${runtimeUrl}"></script>`
	const styleTags = (plugin.styleCode ?? [])
		.map((styleCode) => `<style>${escapeInlineStyle(styleCode)}</style>`)
		.join("\n")

	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		html, body, #root {
			margin: 0;
			min-height: 100%;
			font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			color: #0a0a0a;
			background: #fff;
		}
		* { box-sizing: border-box; }
	</style>
	${styleTags}
</head>
<body>
	<div id="root"></div>
	<script>
		const __MAGIC_CANVAS_BOOTSTRAP__ = ${JSON.stringify(bootstrap)};
		let __MAGIC_CANVAS_PLUGIN__ = null;
		let __MAGIC_CANVAS_CLEANUP__ = null;
		let __MAGIC_CANVAS_LAST_POINTER__ = null;

		window.registerMagicCanvasPlugin = function registerMagicCanvasPlugin(plugin) {
			__MAGIC_CANVAS_PLUGIN__ = plugin;
		};

		function t(key, fallback) {
			const locale = __MAGIC_CANVAS_BOOTSTRAP__.locale;
			const locales = __MAGIC_CANVAS_BOOTSTRAP__.locales || {};
			return (
				locales[locale]?.[key] ??
				locales[locale?.split("-")[0]]?.[key] ??
				locales["zh-CN"]?.[key] ??
				locales["en-US"]?.[key] ??
				fallback ??
				key
			);
		}

		function createRequestId() {
			return Math.random().toString(36).slice(2);
		}

		function requestHost(message, resultType) {
			return new Promise((resolve, reject) => {
				const requestId = createRequestId();
				function handleHostResult(event) {
					const data = event.data;
					if (!data || data.type !== resultType || data.requestId !== requestId) return;
					window.removeEventListener("message", handleHostResult);
					if (data.error) {
						reject(new Error(data.error));
						return;
					}
					resolve(data);
				}
				window.addEventListener("message", handleHostResult);
				window.parent.postMessage({ ...message, requestId }, "*");
			});
		}

		const ctx = {
			plugin: ${JSON.stringify({
				name: plugin.name,
				version: plugin.version,
				icon: plugin.icon,
				tags: plugin.tags,
				source: plugin.source,
			})},
			i18n: {
				locale: __MAGIC_CANVAS_BOOTSTRAP__.locale,
				t,
			},
			ui: {
				toast(message, type) {
					window.parent.postMessage({ type: "magic-canvas-plugin:toast", message, toastType: type }, "*");
				},
				close() {
					window.parent.postMessage({ type: "magic-canvas-plugin:close" }, "*");
				},
				setHeight(height) {
					window.parent.postMessage({ type: "magic-canvas-plugin:set-height", height }, "*");
				},
			},
			resources: {
				resolve(path) {
					return requestHost(
						{ type: "magic-canvas-plugin:resolve-resource", path },
						"magic-canvas-plugin:resolve-resource-result"
					).then((data) => data.url);
				},
			},
			assets: {
				pickFiles(options = {}) {
					const normalizedOptions = options || {};
					const triggerPoint =
						__MAGIC_CANVAS_LAST_POINTER__ &&
						Date.now() - __MAGIC_CANVAS_LAST_POINTER__.timestamp < 2000
							? {
									x: __MAGIC_CANVAS_LAST_POINTER__.x,
									y: __MAGIC_CANVAS_LAST_POINTER__.y,
								}
							: undefined;
					__MAGIC_CANVAS_LAST_POINTER__ = null;
					return requestHost(
						{ type: "magic-canvas-plugin:pick-files", options: normalizedOptions, triggerPoint },
						"magic-canvas-plugin:pick-files-result"
					).then((data) => data.files || []);
				},
			},
			ai: {
				getImageModels() {
					return requestHost(
						{ type: "magic-canvas-plugin:get-image-models" },
						"magic-canvas-plugin:get-image-models-result"
					).then((data) => data.models || []);
				},
				generateAndPlace(params) {
					return requestHost(
						{ type: "magic-canvas-plugin:generate-and-place", params },
						"magic-canvas-plugin:generate-and-place-result"
					).then((data) => data.result);
				},
			},
		};

		window.addEventListener("error", (event) => {
			window.parent.postMessage({
				type: "magic-canvas-plugin:error",
				message: event.message,
			}, "*");
		});

		document.addEventListener("pointerdown", (event) => {
			__MAGIC_CANVAS_LAST_POINTER__ = {
				x: event.clientX,
				y: event.clientY,
				timestamp: Date.now(),
			};
			window.parent.postMessage({ type: "magic-canvas-plugin:pointer-down" }, "*");
		}, true);
	</script>
	${runtimeScript}
	<script>
		Promise.resolve().then(function mountPlugin() {
			if (!__MAGIC_CANVAS_PLUGIN__ || typeof __MAGIC_CANVAS_PLUGIN__.mount !== "function") {
				throw new Error("Plugin did not call registerMagicCanvasPlugin({ mount }).");
			}
			__MAGIC_CANVAS_CLEANUP__ = __MAGIC_CANVAS_PLUGIN__.mount(ctx, document.getElementById("root"));
		});
		window.addEventListener("pagehide", function cleanupPlugin() {
			if (typeof __MAGIC_CANVAS_CLEANUP__ === "function") {
				__MAGIC_CANVAS_CLEANUP__();
			}
		});
	</script>
</body>
</html>`
}

function escapeInlineScript(code: string) {
	return code.replace(/<\/script/gi, "<\\/script")
}

function escapeInlineStyle(code: string) {
	return code.replace(/<\/style/gi, "<\\/style")
}

export default function PluginPanel() {
	const { canvas } = useCanvas()
	const hostUiLocale = useHostUiLocale()
	const snapshot = useSyncExternalStore(
		(listener) => canvas?.pluginManager.subscribe(listener) ?? noop,
		() => canvas?.pluginManager.getSnapshot(),
		() => undefined,
	)

	const locale = normalizePluginLocale(hostUiLocale)
	const plugin = snapshot?.activePlugin ?? null

	if (!canvas || !plugin) return null

	return (
		<PluginWindow
			key={`${plugin.name}-${snapshot?.sessionId ?? 0}`}
			canvas={canvas}
			locale={locale}
			plugin={plugin}
			sessionId={snapshot?.sessionId ?? 0}
		/>
	)
}

const PluginWindow = memo(function PluginWindow({
	canvas,
	locale,
	plugin,
	sessionId,
}: {
	canvas: Canvas
	locale: string
	plugin: CanvasDesignPlugin
	sessionId: number
}) {
	const [position, setPosition] = useState<PluginWindowPosition>(() =>
		getInitialPosition(canvas.container, plugin.name),
	)
	const [frameHeight, setFrameHeight] = useState(360)
	const dragStartRef = useRef({ pointerX: 0, pointerY: 0, windowX: 0, windowY: 0 })
	const draggingRef = useRef(false)
	const positionRef = useRef(position)
	const pluginWindowRef = useRef<HTMLDivElement>(null)
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const localFileInputRef = useRef<HTMLInputElement>(null)
	const awaitingLocalFileDialogRef = useRef(false)
	const [filePickerRequest, setFilePickerRequest] = useState<PluginFilePickerRequest | null>(null)
	const filePickerRequestRef = useRef<PluginFilePickerRequest | null>(null)
	const pluginView = usePluginView(plugin, locale)

	useLayoutEffect(() => {
		positionRef.current = position
	}, [position])

	useLayoutEffect(() => {
		filePickerRequestRef.current = filePickerRequest
	}, [filePickerRequest])

	const clampCurrentPosition = useCallback(() => {
		setPosition((currentPosition) => {
			const nextPosition = clampPositionToContainer(
				currentPosition,
				canvas.container,
				pluginWindowRef.current,
			)
			positionRef.current = nextPosition
			if (nextPosition.x === currentPosition.x && nextPosition.y === currentPosition.y) {
				return currentPosition
			}
			return nextPosition
		})
	}, [canvas])

	useLayoutEffect(() => {
		clampCurrentPosition()
	}, [clampCurrentPosition, frameHeight])

	useEffect(() => {
		const resizeObserver = new ResizeObserver(() => {
			clampCurrentPosition()
		})
		resizeObserver.observe(canvas.container)
		return () => {
			resizeObserver.disconnect()
		}
	}, [canvas.container, clampCurrentPosition])

	useEffect(() => {
		const respondToRequest = (
			request: PluginFilePickerRequest,
			result: { files?: PluginFileAsset[]; error?: string },
		) => {
			iframeRef.current?.contentWindow?.postMessage(
				{
					type: "magic-canvas-plugin:pick-files-result",
					requestId: request.requestId,
					...result,
				},
				"*",
			)
		}

		const closeFilePicker = () => {
			const request = filePickerRequestRef.current
			if (!request || awaitingLocalFileDialogRef.current) return
			filePickerRequestRef.current = null
			setFilePickerRequest(null)
			respondToRequest(request, { files: [] })
		}

		const handleMessage = (event: MessageEvent<unknown>) => {
			if (event.source !== iframeRef.current?.contentWindow) return
			const data = parsePluginRuntimeMessage(event.data)
			if (!data) return

			if (data.type === "magic-canvas-plugin:set-height") {
				setFrameHeight(Math.min(720, Math.max(160, data.height)))
				return
			}

			if (data.type === "magic-canvas-plugin:close") {
				canvas.pluginManager.close(plugin.name)
				return
			}

			if (data.type === "magic-canvas-plugin:resolve-resource") {
				void resolvePluginResource(plugin, data.path).then(
					(url) => {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "magic-canvas-plugin:resolve-resource-result",
								requestId: data.requestId,
								url,
							},
							"*",
						)
					},
					(error) => {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "magic-canvas-plugin:resolve-resource-result",
								requestId: data.requestId,
								error: getErrorMessage(error),
							},
							"*",
						)
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:pick-files") {
				const request = {
					requestId: data.requestId,
					options: data.options,
					anchorPosition: resolvePluginFilePickerAnchorPosition(
						iframeRef.current,
						pluginWindowRef.current,
						data.triggerPoint,
					),
				}
				filePickerRequestRef.current = request
				setFilePickerRequest(request)
				return
			}

			if (data.type === "magic-canvas-plugin:pointer-down") {
				closeFilePicker()
				return
			}

			if (data.type === "magic-canvas-plugin:get-image-models") {
				void getPluginImageModels(canvas).then(
					(models) => {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "magic-canvas-plugin:get-image-models-result",
								requestId: data.requestId,
								models,
							},
							"*",
						)
					},
					(error) => {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "magic-canvas-plugin:get-image-models-result",
								requestId: data.requestId,
								error: getErrorMessage(error),
							},
							"*",
						)
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:generate-and-place") {
				void generatePluginImages(canvas, data.params).then(
					(result) => {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "magic-canvas-plugin:generate-and-place-result",
								requestId: data.requestId,
								result,
							},
							"*",
						)
					},
					(error) => {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "magic-canvas-plugin:generate-and-place-result",
								requestId: data.requestId,
								error: getErrorMessage(error),
							},
							"*",
						)
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:error") {
				toast.error(data.message)
				return
			}

			if (data.toastType === "success") {
				toast.success(data.message)
			} else if (data.toastType === "warning") {
				toast.warning(data.message)
			} else if (data.toastType === "error") {
				toast.error(data.message)
			} else {
				toast(data.message)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [canvas, plugin])

	const handleClose = useCallback(() => {
		canvas.pluginManager.close(plugin.name)
	}, [canvas.pluginManager, plugin.name])

	const respondToPickFiles = useCallback(
		(requestId: string, result: { files?: PluginFileAsset[]; error?: string }) => {
			iframeRef.current?.contentWindow?.postMessage(
				{
					type: "magic-canvas-plugin:pick-files-result",
					requestId,
					...result,
				},
				"*",
			)
		},
		[],
	)

	useEffect(() => {
		const handleWindowFocus = () => {
			if (!awaitingLocalFileDialogRef.current) return
			window.setTimeout(() => {
				if (!awaitingLocalFileDialogRef.current) return
				awaitingLocalFileDialogRef.current = false
				const request = filePickerRequestRef.current
				if (!request) return
				filePickerRequestRef.current = null
				setFilePickerRequest(null)
				respondToPickFiles(request.requestId, { files: [] })
			}, 300)
		}
		window.addEventListener("focus", handleWindowFocus)
		return () => {
			window.removeEventListener("focus", handleWindowFocus)
		}
	}, [respondToPickFiles])

	const handleFilePickerOpenChange = useCallback(
		(open: boolean) => {
			if (open) return
			if (awaitingLocalFileDialogRef.current) return
			const request = filePickerRequest
			filePickerRequestRef.current = null
			setFilePickerRequest(null)
			if (request) {
				respondToPickFiles(request.requestId, { files: [] })
			}
		},
		[filePickerRequest, respondToPickFiles],
	)

	const handleLocalFileInputChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			awaitingLocalFileDialogRef.current = false
			const request = filePickerRequest
			const files = Array.from(event.target.files || [])
			event.target.value = ""
			filePickerRequestRef.current = null
			setFilePickerRequest(null)
			if (!request) return
			if (!files.length) {
				respondToPickFiles(request.requestId, { files: [] })
				return
			}
			void pickPluginFiles(canvas, files, request.options).then(
				(files) => respondToPickFiles(request.requestId, { files }),
				(error) => respondToPickFiles(request.requestId, { error: getErrorMessage(error) }),
			)
		},
		[canvas, filePickerRequest, respondToPickFiles],
	)

	const handleFilePickerSourceSelect = useCallback((source: ReferenceResourceSourceType) => {
		if (source === REFERENCE_RESOURCE_SOURCE_TYPES.localUpload) {
			awaitingLocalFileDialogRef.current = true
			localFileInputRef.current?.click()
		}
	}, [])

	const handleProjectFileSelect = useCallback(
		(item: ReferenceResourcePanelItem, context?: ReferenceResourcePanelSelectContext) => {
			awaitingLocalFileDialogRef.current = false
			const request = filePickerRequest
			if (!request) return
			filePickerRequestRef.current = null
			setFilePickerRequest(null)
			context?.reset?.()
			void resolveProjectPluginFile(canvas, item, request.options).then(
				(file) => respondToPickFiles(request.requestId, { files: [file] }),
				(error) => respondToPickFiles(request.requestId, { error: getErrorMessage(error) }),
			)
		},
		[canvas, filePickerRequest, respondToPickFiles],
	)

	const handlePluginWindowPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
		(event) => {
			event.stopPropagation()
			if (event.target instanceof Node && !event.currentTarget.contains(event.target)) {
				return
			}
			const request = filePickerRequestRef.current
			if (!request || awaitingLocalFileDialogRef.current) return
			filePickerRequestRef.current = null
			setFilePickerRequest(null)
			respondToPickFiles(request.requestId, { files: [] })
		},
		[respondToPickFiles],
	)

	const handleHeaderPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>((event) => {
		if ((event.target as HTMLElement).closest("button")) return
		const currentPosition = positionRef.current
		draggingRef.current = true
		dragStartRef.current = {
			pointerX: event.clientX,
			pointerY: event.clientY,
			windowX: currentPosition.x,
			windowY: currentPosition.y,
		}
		event.currentTarget.setPointerCapture(event.pointerId)
		event.preventDefault()
	}, [])

	const handleHeaderPointerMove = useCallback<PointerEventHandler<HTMLDivElement>>(
		(event) => {
			if (!draggingRef.current) return
			const nextX =
				dragStartRef.current.windowX + event.clientX - dragStartRef.current.pointerX
			const nextY =
				dragStartRef.current.windowY + event.clientY - dragStartRef.current.pointerY
			const nextPosition = clampPositionToContainer(
				{ x: nextX, y: nextY },
				canvas.container,
				pluginWindowRef.current,
			)
			positionRef.current = nextPosition
			setPosition(nextPosition)
		},
		[canvas.container],
	)

	const handleHeaderPointerUp = useCallback<PointerEventHandler<HTMLDivElement>>(() => {
		draggingRef.current = false
		saveCachedPosition(plugin.name, positionRef.current)
	}, [plugin.name])

	return (
		<div
			ref={pluginWindowRef}
			className={styles.pluginWindow}
			style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
			data-canvas-ui-component
			onPointerDown={handlePluginWindowPointerDown}
		>
			<input
				ref={localFileInputRef}
				type="file"
				accept={getPluginFilePickerAccept(filePickerRequest?.options)}
				multiple={Boolean(filePickerRequest?.options?.multiple)}
				className={styles.pluginFilePickerInput}
				onChange={handleLocalFileInputChange}
			/>
			<PluginFilePicker
				open={Boolean(filePickerRequest)}
				onOpenChange={handleFilePickerOpenChange}
				onSelectSource={handleFilePickerSourceSelect}
				onProjectSelect={handleProjectFileSelect}
				maxReferenceFiles={filePickerRequest?.options?.maxCount}
				referenceResourceType={getPluginReferenceResourceType(filePickerRequest?.options)}
				anchorPosition={filePickerRequest?.anchorPosition}
			/>
			<PluginWindowHeader
				icon={pluginView.icon}
				label={pluginView.label}
				onClose={handleClose}
				onPointerDown={handleHeaderPointerDown}
				onPointerMove={handleHeaderPointerMove}
				onPointerUp={handleHeaderPointerUp}
			/>

			{pluginView.srcDoc ? (
				<PluginRuntimeFrame
					ref={iframeRef}
					key={`${plugin.name}-${sessionId}`}
					height={frameHeight}
					srcDoc={pluginView.srcDoc}
					title={pluginView.label}
				/>
			) : (
				<PluginRuntimeEmpty description={pluginView.description} label={pluginView.label} />
			)}
		</div>
	)
})

function usePluginView(plugin: CanvasDesignPlugin, locale: string): PluginView {
	return useMemo(
		() => ({
			label: resolvePluginText(plugin, plugin.label, locale),
			description: resolvePluginText(plugin, plugin.description, locale),
			icon: resolvePluginIcon(plugin),
			srcDoc: createPluginSrcDoc(plugin, locale),
		}),
		[locale, plugin],
	)
}

const PluginFilePicker = memo(function PluginFilePicker({
	anchorPosition,
	maxReferenceFiles,
	onOpenChange,
	onProjectSelect,
	onSelectSource,
	open,
	referenceResourceType,
}: {
	anchorPosition?: PluginPoint
	maxReferenceFiles?: number
	onOpenChange: (open: boolean) => void
	onProjectSelect: (
		item: ReferenceResourcePanelItem,
		context?: ReferenceResourcePanelSelectContext,
	) => void
	onSelectSource: (source: ReferenceResourceSourceType) => void
	open: boolean
	referenceResourceType: ReferenceResourceTypeFilter
}) {
	const hostStyle = anchorPosition
		? ({
				[PLUGIN_FILE_PICKER_X_VAR]: `${anchorPosition.x}px`,
				[PLUGIN_FILE_PICKER_Y_VAR]: `${anchorPosition.y}px`,
				[PLUGIN_FILE_PICKER_BOTTOM_VAR]: "auto",
			} as CSSProperties)
		: undefined

	return (
		<div className={styles.pluginFilePickerHost} style={hostStyle}>
			<ReferenceResourcePopover
				open={open}
				onOpenChange={onOpenChange}
				onMouseEnter={noop}
				onMouseLeave={noop}
				onSelectSource={onSelectSource}
				maxReferenceFiles={maxReferenceFiles}
				currentReferenceFiles={[]}
				isReferenceFileLimitReached={false}
				referenceResourceType={referenceResourceType}
				referenceFileInfos={[]}
				onProjectSelect={onProjectSelect}
				triggerClassName={styles.pluginFilePickerAnchor}
				trigger={<span aria-hidden />}
			/>
		</div>
	)
})

const PluginWindowHeader = memo(function PluginWindowHeader({
	icon,
	label,
	onClose,
	onPointerDown,
	onPointerMove,
	onPointerUp,
}: {
	icon: PluginView["icon"]
	label: string
	onClose: () => void
	onPointerDown: PointerEventHandler<HTMLDivElement>
	onPointerMove: PointerEventHandler<HTMLDivElement>
	onPointerUp: PointerEventHandler<HTMLDivElement>
}) {
	return (
		<div
			className={styles.pluginWindowHeader}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		>
			<GripHorizontal size={14} />
			<div className={styles.pluginTitleIcon}>
				{icon?.type === "emoji" ? (
					icon.value
				) : icon?.type === "image" ? (
					<img className={styles.pluginTitleIconImage} src={icon.value} alt="" />
				) : (
					<Puzzle size={15} />
				)}
			</div>
			<div className={styles.pluginWindowTitle} title={label}>
				{label}
			</div>
			<button
				type="button"
				className={styles.pluginWindowClose}
				aria-label="Close plugin"
				onClick={onClose}
			>
				<X size={16} />
			</button>
		</div>
	)
})

const PluginRuntimeFrame = memo(
	forwardRef<
		HTMLIFrameElement,
		{
			height: number
			srcDoc: string
			title: string
		}
	>(function PluginRuntimeFrame({ height, srcDoc, title }, ref) {
		return (
			<iframe
				ref={ref}
				className={styles.pluginFrame}
				title={title}
				sandbox="allow-scripts"
				srcDoc={srcDoc}
				style={{ height }}
			/>
		)
	}),
)

const PluginRuntimeEmpty = memo(function PluginRuntimeEmpty({
	description,
	label,
}: {
	description: string
	label: string
}) {
	return (
		<div className={styles.pluginRuntimeEmpty}>
			<div className={styles.pluginRuntimeEmptyTitle}>{label}</div>
			<div>{description}</div>
		</div>
	)
})

function getInitialPosition(container: HTMLElement, pluginName?: string): PluginWindowPosition {
	const rect = container.getBoundingClientRect()
	const cachedPosition = pluginName ? readCachedPosition(pluginName) : null
	return clampPositionToContainer(
		cachedPosition ?? {
			x: rect.width - PLUGIN_WINDOW_WIDTH - PLUGIN_WINDOW_MARGIN,
			y: PLUGIN_WINDOW_MARGIN,
		},
		container,
	)
}

function getPositionCacheKey(pluginName: string): string {
	return `${PLUGIN_PANEL_POSITION_CACHE_PREFIX}${pluginName}`
}

function readCachedPosition(pluginName: string): PluginWindowPosition | null {
	if (typeof window === "undefined") return null
	const cacheKey = getPositionCacheKey(pluginName)
	let cachedValue: string | null
	try {
		cachedValue = window.localStorage.getItem(cacheKey)
	} catch (error) {
		console.warn("[PluginPanel] Failed to read cached plugin panel position.", error)
		return null
	}
	if (!cachedValue) return null
	let position: Partial<PluginWindowPosition>
	try {
		position = JSON.parse(cachedValue) as Partial<PluginWindowPosition>
	} catch (error) {
		console.warn("[PluginPanel] Failed to parse cached plugin panel position.", error)
		try {
			window.localStorage.removeItem(cacheKey)
		} catch (removeError) {
			console.warn(
				"[PluginPanel] Failed to remove invalid plugin panel position cache.",
				removeError,
			)
		}
		return null
	}
	if (typeof position.x !== "number" || typeof position.y !== "number") return null
	return {
		x: position.x,
		y: position.y,
	}
}

function saveCachedPosition(pluginName: string, position: PluginWindowPosition): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(getPositionCacheKey(pluginName), JSON.stringify(position))
	} catch (error) {
		console.warn("[PluginPanel] Failed to cache plugin panel position.", error)
	}
}

async function resolvePluginResource(plugin: CanvasDesignPlugin, path: string): Promise<string> {
	if (!isSafePluginRelativePath(path)) {
		throw new Error(`Invalid plugin resource path: ${path}`)
	}
	if (plugin.resolveResourceUrl) {
		return plugin.resolveResourceUrl(path)
	}
	if (plugin.resourceBaseUrl) {
		return new URL(path, plugin.resourceBaseUrl).href
	}
	return resolvePluginPackagePath(plugin, path)
}

function resolvePluginFilePickerAnchorPosition(
	iframe: HTMLIFrameElement | null,
	pluginWindow: HTMLDivElement | null,
	triggerPoint?: PluginPoint,
): PluginPoint | undefined {
	if (!iframe || !pluginWindow || !triggerPoint) return undefined
	const iframeRect = iframe.getBoundingClientRect()
	const pluginWindowRect = pluginWindow.getBoundingClientRect()
	const x = iframeRect.left + triggerPoint.x - pluginWindowRect.left
	const y = iframeRect.top + triggerPoint.y - pluginWindowRect.top
	return {
		x: Math.min(
			Math.max(PLUGIN_WINDOW_MARGIN, x),
			pluginWindowRect.width - PLUGIN_WINDOW_MARGIN,
		),
		y: Math.min(
			Math.max(PLUGIN_WINDOW_MARGIN, y),
			pluginWindowRect.height - PLUGIN_WINDOW_MARGIN,
		),
	}
}

async function pickPluginFiles(
	canvas: Canvas,
	files: File[],
	options?: PluginPickFilesOptions,
): Promise<PluginFileAsset[]> {
	if (canvas.readonly) {
		throw new Error("Canvas is readonly.")
	}

	const maxCount = Math.max(1, options?.maxCount ?? (options?.multiple ? files.length : 1))
	const acceptedFiles = files
		.slice(0, maxCount)
		.filter((file) => validatePluginPickedFile(file, options))

	if (acceptedFiles.length === 0) {
		return []
	}

	const dimensions = await Promise.all(
		acceptedFiles.map((file) =>
			options?.type === "image" || isImageFile(file)
				? getMediaDimensions(file).catch(
						(): { width: number; height: number } | undefined => undefined,
					)
				: Promise.resolve(undefined),
		),
	)
	const uploadResults = await canvas.canvasFileUploadManager.uploadDirect(acceptedFiles)

	return uploadResults.map((result, index) => ({
		id: result.path || result.src,
		path: result.path,
		url: result.src,
		src: result.src,
		fileName: result.fileName,
		type: inferPluginFileType(acceptedFiles[index]),
		width: dimensions[index]?.width,
		height: dimensions[index]?.height,
	}))
}

async function resolveProjectPluginFile(
	canvas: Canvas,
	item: ReferenceResourcePanelItem,
	options?: PluginPickFilesOptions,
): Promise<PluginFileAsset> {
	const getFileInfo = canvas.magicConfigManager.config?.methods?.getFileInfo
	if (!getFileInfo) {
		throw new Error("getFileInfo method not available.")
	}
	const path = item.data.file_path
	const type = options?.type ?? inferPluginFileTypeFromPath(path)
	const fileInfo = await getFileInfo(path, { useImageProcess: type === "image" })
	const dimensions =
		type === "image"
			? await getImageDimensionsFromUrl(fileInfo.src).catch(
					(): { width: number; height: number } | undefined => undefined,
				)
			: undefined

	return {
		id: path,
		path,
		url: fileInfo.src,
		src: fileInfo.src,
		fileName: fileInfo.fileName || item.data.file_name,
		type,
		width: dimensions?.width,
		height: dimensions?.height,
	}
}

function getImageDimensionsFromUrl(url: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => {
			resolve({
				width: image.naturalWidth,
				height: image.naturalHeight,
			})
		}
		image.onerror = () => {
			reject(new Error("Failed to load selected project image."))
		}
		image.src = url
	})
}

function validatePluginPickedFile(file: File, options?: PluginPickFilesOptions): boolean {
	const validation = validateFile(file)
	if (!validation.valid) return false
	if (options?.type === "image") return isImageFile(file)
	if (options?.type === "video") return file.type.startsWith("video/")
	if (options?.type === "audio") return file.type.startsWith("audio/")
	return true
}

function inferPluginFileType(file: File | undefined): PluginFilePickerType {
	if (!file) return "file"
	if (isImageFile(file)) return "image"
	if (file.type.startsWith("video/")) return "video"
	if (file.type.startsWith("audio/")) return "audio"
	return "file"
}

function inferPluginFileTypeFromPath(path: string): PluginFilePickerType {
	const extension = path.split(".").pop()?.toLowerCase()
	if (extension && ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)) {
		return "image"
	}
	if (extension && ["mp4", "webm", "mov", "m4v"].includes(extension)) {
		return "video"
	}
	if (extension && ["mp3", "wav", "m4a", "aac", "ogg"].includes(extension)) {
		return "audio"
	}
	return "file"
}

function getPluginFilePickerAccept(options?: PluginPickFilesOptions): string {
	if (options?.accept?.length) return options.accept.join(",")
	if (options?.type === "image") return "image/*"
	if (options?.type === "video") return "video/*"
	if (options?.type === "audio") return "audio/*"
	return ""
}

function getPluginReferenceResourceType(
	options?: PluginPickFilesOptions,
): ReferenceResourceTypeFilter {
	if (options?.type === "image") return "image"
	if (options?.type === "video") return "video"
	if (options?.type === "audio") return "audio"
	return "file"
}

async function getPluginImageModels(canvas: Canvas) {
	const getImageModelList = canvas.magicConfigManager.config?.methods?.getImageModelList
	if (!getImageModelList) {
		throw new Error("getImageModelList method not available.")
	}
	const models = await getImageModelList()
	return models.map(sanitizePluginImageModel)
}

function sanitizePluginImageModel(model: ImageModelItem) {
	return {
		model_id: model.model_id,
		model_name: model.model_name,
		model_icon: model.model_icon,
		model_description: model.model_description,
		image_size_config: model.image_size_config
			? {
					default_scale: model.image_size_config.default_scale,
					max_reference_images: model.image_size_config.max_reference_images,
					sizes: (model.image_size_config.sizes ?? []).map((size) => ({
						label: size.label,
						value: size.value,
						scale: size.scale,
					})),
					image_settings: (model.image_size_config.image_settings ?? []).map(
						(setting) => ({
							key: setting.key,
							label: setting.label,
							description: setting.description,
							component: setting.component,
							variant: setting.variant,
							default: setting.default,
							options: (setting.options ?? []).map((option) => ({
								label: option.label,
								value: option.value,
							})),
						}),
					),
				}
			: undefined,
	}
}

async function generatePluginImages(canvas: Canvas, params: PluginGenerateAndPlaceParams) {
	if (canvas.readonly) {
		throw new Error("Canvas is readonly.")
	}
	const methods = canvas.magicConfigManager.config?.methods
	if (!methods?.generateImage) {
		throw new Error("generateImage method not available.")
	}
	if (!params.model_id || !params.prompt) {
		throw new Error("model_id and prompt are required.")
	}

	const count = Math.max(1, Math.min(4, params.count ?? 1))
	const [sizeWidth, sizeHeight] = params.size?.split("x").map(Number) ?? []
	const width = params.width ?? (Number.isFinite(sizeWidth) ? sizeWidth : undefined)
	const height = params.height ?? (Number.isFinite(sizeHeight) ? sizeHeight : undefined)
	const elementIds = await withHistoryManagerAsync(canvas.historyManager, async () => {
		const nextElementIds = canvas.toolManager
			.getImageGeneratorTool()
			.createImageElementsNearViewport(count, width, height)

		for (const elementId of nextElementIds) {
			const elementInstance = canvas.elementManager.getElementInstance(elementId)
			if (!(elementInstance instanceof ImageElementClass)) {
				throw new Error("Failed to create image element for plugin generation.")
			}

			const request: GenerateImageRequest = {
				model_id: params.model_id,
				prompt: params.prompt,
				size: params.size,
				resolution: params.resolution,
				reference_images: params.reference_images,
				reference_image_options: params.reference_image_options,
				image_generation_config: params.image_generation_config,
			}
			await elementInstance.generateImage(request)
		}

		return nextElementIds
	})

	if (params.select && elementIds.length > 0) {
		canvas.selectionManager.select(elementIds[elementIds.length - 1])
	}

	return { elementIds }
}

function clampPositionToContainer(
	position: PluginWindowPosition,
	container: HTMLElement,
	pluginWindow?: HTMLElement | null,
): PluginWindowPosition {
	const rect = container.getBoundingClientRect()
	const pluginWindowRect = pluginWindow?.getBoundingClientRect()
	const pluginWindowWidth = pluginWindowRect?.width ?? PLUGIN_WINDOW_WIDTH
	const pluginWindowHeight = pluginWindowRect?.height ?? 0
	const maxX = Math.max(
		PLUGIN_WINDOW_MARGIN,
		rect.width - pluginWindowWidth - PLUGIN_WINDOW_MARGIN,
	)
	const maxY = Math.max(
		PLUGIN_WINDOW_MARGIN,
		rect.height - pluginWindowHeight - PLUGIN_WINDOW_MARGIN,
	)

	return {
		x: Math.min(Math.max(PLUGIN_WINDOW_MARGIN, position.x), maxX),
		y: Math.min(Math.max(PLUGIN_WINDOW_MARGIN, position.y), maxY),
	}
}

function parsePluginRuntimeMessage(data: unknown): PluginRuntimeMessage | null {
	if (!data || typeof data !== "object") return null
	const record = data as Record<string, unknown>
	if (record.type === "magic-canvas-plugin:close") {
		return {
			type: "magic-canvas-plugin:close",
		}
	}
	if (record.type === "magic-canvas-plugin:set-height" && typeof record.height === "number") {
		return {
			type: "magic-canvas-plugin:set-height",
			height: record.height,
		}
	}
	if (
		record.type === "magic-canvas-plugin:resolve-resource" &&
		typeof record.requestId === "string" &&
		typeof record.path === "string"
	) {
		return {
			type: "magic-canvas-plugin:resolve-resource",
			requestId: record.requestId,
			path: record.path,
		}
	}
	if (record.type === "magic-canvas-plugin:pick-files" && typeof record.requestId === "string") {
		return {
			type: "magic-canvas-plugin:pick-files",
			requestId: record.requestId,
			options: parsePluginPickFilesOptions(record.options),
			triggerPoint: parsePluginPoint(record.triggerPoint),
		}
	}
	if (record.type === "magic-canvas-plugin:pointer-down") {
		return {
			type: "magic-canvas-plugin:pointer-down",
		}
	}
	if (
		record.type === "magic-canvas-plugin:get-image-models" &&
		typeof record.requestId === "string"
	) {
		return {
			type: "magic-canvas-plugin:get-image-models",
			requestId: record.requestId,
		}
	}
	if (
		record.type === "magic-canvas-plugin:generate-and-place" &&
		typeof record.requestId === "string" &&
		record.params &&
		typeof record.params === "object"
	) {
		return {
			type: "magic-canvas-plugin:generate-and-place",
			requestId: record.requestId,
			params: record.params as PluginGenerateAndPlaceParams,
		}
	}
	if (record.type === "magic-canvas-plugin:error" && typeof record.message === "string") {
		return {
			type: "magic-canvas-plugin:error",
			message: record.message,
		}
	}
	if (record.type === "magic-canvas-plugin:toast" && typeof record.message === "string") {
		const toastType =
			record.toastType === "success" ||
			record.toastType === "warning" ||
			record.toastType === "error" ||
			record.toastType === "info"
				? record.toastType
				: undefined
		return {
			type: "magic-canvas-plugin:toast",
			message: record.message,
			toastType,
		}
	}
	return null
}

function parsePluginPoint(point: unknown): PluginPoint | undefined {
	if (!point || typeof point !== "object") return undefined
	const record = point as Record<string, unknown>
	if (typeof record.x !== "number" || typeof record.y !== "number") return undefined
	return {
		x: record.x,
		y: record.y,
	}
}

function parsePluginPickFilesOptions(options: unknown): PluginPickFilesOptions | undefined {
	if (!options || typeof options !== "object") return undefined
	const record = options as Record<string, unknown>
	const type =
		record.type === "image" ||
		record.type === "video" ||
		record.type === "audio" ||
		record.type === "file"
			? record.type
			: undefined
	return {
		type,
		multiple: typeof record.multiple === "boolean" ? record.multiple : undefined,
		maxCount: typeof record.maxCount === "number" ? record.maxCount : undefined,
		accept: Array.isArray(record.accept)
			? record.accept.filter((item): item is string => typeof item === "string")
			: undefined,
	}
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error ?? "")
}
