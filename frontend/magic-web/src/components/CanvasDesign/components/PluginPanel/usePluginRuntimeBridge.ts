import {
	type Dispatch,
	type MutableRefObject,
	type RefObject,
	type SetStateAction,
	useEffect,
} from "react"
import { toast } from "sonner"
import type { Canvas } from "../../canvas/Canvas"
import type { CanvasDesignPlugin } from "../../canvas/types"
import {
	getPluginRuntimeMessageCapability,
	getPluginRuntimeResultType,
	parsePluginRuntimeMessage,
	pluginHasCapability,
	type PluginPoint,
	type PluginRuntimeMessage,
} from "./runtime/v1"
import { PLUGIN_WINDOW_MARGIN } from "./constants"
import type { PluginFileAsset, PluginFilePickerRequest } from "./types"
import { clampPluginPanelHeight } from "./position"
import { resolvePluginResource, getErrorMessage } from "./resourceUtils"
import { pickPluginFiles, resolvePluginFileAssets } from "./fileAssets"
import { readPluginCanvasClipboard } from "./readPluginCanvasClipboard"
import { generatePluginImages, getPluginImageModels } from "./imageGeneration"
import { completePluginImagePrompt } from "./imagePromptCompletion"
import { resolvePluginStorageKey, resolveSharedGenerationConfigStorageKey } from "./pluginStorage"
import { validatePluginFetchBlobUrl } from "./pluginFetchBlob"

interface UsePluginRuntimeBridgeParams {
	/* 是否正在等待本地文件对话框 */
	awaitingLocalFileDialogRef: MutableRefObject<boolean>
	/** 画布 */
	canvas: Canvas
	/** 通道 token */
	channelToken: string
	/** 文件选择器请求引用 */
	filePickerRequestRef: MutableRefObject<PluginFilePickerRequest | null>
	/** iframe 引用 */
	iframeRef: RefObject<HTMLIFrameElement | null>
	/** 插件 */
	plugin: CanvasDesignPlugin
	/** 插件窗口引用 */
	pluginWindowRef: RefObject<HTMLDivElement | null>
	/** 插件 iframe 上报画布图片拖拽投放目标时，由 PluginWindow 透传给专门的拖拽 hook */
	onCanvasAssetDragTarget?: (
		target: Extract<
			PluginRuntimeMessage,
			{ type: "magic-canvas-plugin:canvas-asset-drag-target" }
		>,
	) => void
	/** 设置文件选择器请求 */
	setFilePickerRequest: Dispatch<SetStateAction<PluginFilePickerRequest | null>>
	/** 设置框架高度 */
	setFrameHeight: Dispatch<SetStateAction<number>>
}

export function usePluginRuntimeBridge({
	awaitingLocalFileDialogRef,
	canvas,
	channelToken,
	filePickerRequestRef,
	iframeRef,
	plugin,
	pluginWindowRef,
	onCanvasAssetDragTarget,
	setFilePickerRequest,
	setFrameHeight,
}: UsePluginRuntimeBridgeParams) {
	useEffect(() => {
		const postPluginMessage = (message: Record<string, unknown>, transfer?: Transferable[]) => {
			iframeRef.current?.contentWindow?.postMessage(
				{
					channelToken,
					...message,
				},
				"*",
				transfer,
			)
		}
		const respondToRequest = (
			request: PluginFilePickerRequest,
			result: { files?: PluginFileAsset[]; error?: string },
		) => {
			postPluginMessage({
				type: "magic-canvas-plugin:pick-files-result",
				requestId: request.requestId,
				...result,
			})
		}

		const rejectMissingCapability = (data: PluginRuntimeMessage, capability: string) => {
			const resultType = getPluginRuntimeResultType(data.type)
			const message = `Plugin capability not declared: ${capability}`
			console.warn(`[PluginPanel] ${message}`, plugin.name)
			if (resultType && "requestId" in data) {
				postPluginMessage({
					type: resultType,
					requestId: data.requestId,
					error: message,
				})
			}
		}

		const withPluginStorageKey = (key: string): string => {
			return resolvePluginStorageKey(plugin.name, key)
		}

		const sharedGenerationConfigStorageKey = resolveSharedGenerationConfigStorageKey()

		const closeFilePicker = () => {
			const request = filePickerRequestRef.current
			if (!request || awaitingLocalFileDialogRef.current) return
			filePickerRequestRef.current = null
			setFilePickerRequest(null)
			respondToRequest(request, { files: [] })
		}

		const handleMessage = (event: MessageEvent<unknown>) => {
			if (event.source !== iframeRef.current?.contentWindow) return
			const data = parsePluginRuntimeMessage(event.data, channelToken)
			if (!data) return
			const capability = getPluginRuntimeMessageCapability(data.type)
			if (capability && !pluginHasCapability(plugin, capability)) {
				rejectMissingCapability(data, capability)
				return
			}

			if (data.type === "magic-canvas-plugin:set-height") {
				setFrameHeight(clampPluginPanelHeight(data.height))
				return
			}

			if (data.type === "magic-canvas-plugin:close") {
				canvas.pluginManager.close(plugin.name)
				return
			}

			if (data.type === "magic-canvas-plugin:resolve-resource") {
				void resolvePluginResource(plugin, data.path).then(
					(url) => {
						postPluginMessage({
							type: "magic-canvas-plugin:resolve-resource-result",
							requestId: data.requestId,
							url,
						})
					},
					(error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:resolve-resource-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
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

			if (data.type === "magic-canvas-plugin:canvas-asset-drag-target") {
				// 该消息是拖拽过程中的高频状态同步，交给外部拖拽 hook 维护当前 drop 目标。
				onCanvasAssetDragTarget?.(data)
				return
			}

			if (data.type === "magic-canvas-plugin:get-image-models") {
				void getPluginImageModels(canvas).then(
					(models) => {
						postPluginMessage({
							type: "magic-canvas-plugin:get-image-models-result",
							requestId: data.requestId,
							models,
						})
					},
					(error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:get-image-models-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:generate-and-place") {
				void generatePluginImages(canvas, data.params).then(
					(result) => {
						postPluginMessage({
							type: "magic-canvas-plugin:generate-and-place-result",
							requestId: data.requestId,
							result,
						})
					},
					(error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:generate-and-place-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:complete-image-prompt") {
				void completePluginImagePrompt(canvas, data.params).then(
					(result) => {
						postPluginMessage({
							type: "magic-canvas-plugin:complete-image-prompt-result",
							requestId: data.requestId,
							result,
						})
					},
					(error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:complete-image-prompt-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:upload-file") {
				const file = new File([data.arrayBuffer], data.fileName, { type: data.mimeType })
				void pickPluginFiles(canvas, [file], { type: "image" }).then(
					(files) => {
						postPluginMessage({
							type: "magic-canvas-plugin:upload-file-result",
							requestId: data.requestId,
							file: files[0] ?? null,
						})
					},
					(error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:upload-file-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:resolve-file-assets") {
				void resolvePluginFileAssets(canvas, data.files, data.options).then(
					(files) => {
						postPluginMessage({
							type: "magic-canvas-plugin:resolve-file-assets-result",
							requestId: data.requestId,
							files,
						})
					},
					(error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:resolve-file-assets-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:read-canvas-clipboard") {
				void readPluginCanvasClipboard(canvas).then(
					(result) => {
						postPluginMessage({
							type: "magic-canvas-plugin:read-canvas-clipboard-result",
							requestId: data.requestId,
							payload: result.payload,
							uploadedAssets: result.uploadedAssets,
						})
					},
					(error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:read-canvas-clipboard-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
					},
				)
				return
			}

			if (data.type === "magic-canvas-plugin:fetch-blob") {
				let validatedUrl: URL
				try {
					validatedUrl = validatePluginFetchBlobUrl(
						plugin,
						data.url,
						window.location.origin,
					)
				} catch (error) {
					postPluginMessage({
						type: "magic-canvas-plugin:fetch-blob-result",
						requestId: data.requestId,
						error: getErrorMessage(error),
					})
					return
				}

				void fetch(validatedUrl.toString())
					.then((r) => r.arrayBuffer())
					.then((arrayBuffer) => {
						postPluginMessage(
							{
								type: "magic-canvas-plugin:fetch-blob-result",
								requestId: data.requestId,
								arrayBuffer,
							},
							[arrayBuffer],
						)
					})
					.catch((error) => {
						postPluginMessage({
							type: "magic-canvas-plugin:fetch-blob-result",
							requestId: data.requestId,
							error: getErrorMessage(error),
						})
					})
				return
			}

			if (data.type === "magic-canvas-plugin:storage-get") {
				try {
					const storageKey = withPluginStorageKey(data.key)
					postPluginMessage({
						type: "magic-canvas-plugin:storage-get-result",
						requestId: data.requestId,
						value: window.localStorage.getItem(storageKey),
					})
				} catch (error) {
					postPluginMessage({
						type: "magic-canvas-plugin:storage-get-result",
						requestId: data.requestId,
						error: getErrorMessage(error),
					})
				}
				return
			}

			if (data.type === "magic-canvas-plugin:storage-set") {
				try {
					const storageKey = withPluginStorageKey(data.key)
					window.localStorage.setItem(storageKey, data.value)
					postPluginMessage({
						type: "magic-canvas-plugin:storage-set-result",
						requestId: data.requestId,
					})
				} catch (error) {
					postPluginMessage({
						type: "magic-canvas-plugin:storage-set-result",
						requestId: data.requestId,
						error: getErrorMessage(error),
					})
				}
				return
			}

			if (data.type === "magic-canvas-plugin:storage-remove") {
				try {
					const storageKey = withPluginStorageKey(data.key)
					window.localStorage.removeItem(storageKey)
					postPluginMessage({
						type: "magic-canvas-plugin:storage-remove-result",
						requestId: data.requestId,
					})
				} catch (error) {
					postPluginMessage({
						type: "magic-canvas-plugin:storage-remove-result",
						requestId: data.requestId,
						error: getErrorMessage(error),
					})
				}
				return
			}

			if (data.type === "magic-canvas-plugin:storage-get-shared-generation-config") {
				try {
					postPluginMessage({
						type: "magic-canvas-plugin:storage-get-shared-generation-config-result",
						requestId: data.requestId,
						value: window.localStorage.getItem(sharedGenerationConfigStorageKey),
					})
				} catch (error) {
					postPluginMessage({
						type: "magic-canvas-plugin:storage-get-shared-generation-config-result",
						requestId: data.requestId,
						error: getErrorMessage(error),
					})
				}
				return
			}

			if (data.type === "magic-canvas-plugin:storage-set-shared-generation-config") {
				try {
					window.localStorage.setItem(sharedGenerationConfigStorageKey, data.value)
					postPluginMessage({
						type: "magic-canvas-plugin:storage-set-shared-generation-config-result",
						requestId: data.requestId,
					})
				} catch (error) {
					postPluginMessage({
						type: "magic-canvas-plugin:storage-set-shared-generation-config-result",
						requestId: data.requestId,
						error: getErrorMessage(error),
					})
				}
				return
			}

			if (data.type === "magic-canvas-plugin:storage-remove-shared-generation-config") {
				try {
					window.localStorage.removeItem(sharedGenerationConfigStorageKey)
					postPluginMessage({
						type: "magic-canvas-plugin:storage-remove-shared-generation-config-result",
						requestId: data.requestId,
					})
				} catch (error) {
					postPluginMessage({
						type: "magic-canvas-plugin:storage-remove-shared-generation-config-result",
						requestId: data.requestId,
						error: getErrorMessage(error),
					})
				}
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
	}, [
		awaitingLocalFileDialogRef,
		canvas,
		channelToken,
		filePickerRequestRef,
		iframeRef,
		onCanvasAssetDragTarget,
		plugin,
		pluginWindowRef,
		setFilePickerRequest,
		setFrameHeight,
	])
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
