import { useRef, forwardRef, useState, useCallback } from "react"
import UIProvider from "./components/ui/custom/UIProvider"
import Zoom from "./components/Zoom"
import Tools from "./components/Tools"
import Layers from "./components/Layers"
import ElementTools from "./components/ElementTools"
import { CanvasProvider, useCanvas } from "./context/CanvasContext"
import { CanvasUIProvider, useCanvasPanelUI } from "./context/CanvasUIContext"
import { LayersUIProvider, useLayersUI } from "./context/LayersUIContext"
import { ElementMenuProvider } from "./components/ElementMenu/ElementMenuProvider"
import { useMount, useUnmount, useUpdateEffect } from "ahooks"
import { Canvas } from "./canvas/Canvas"
import ImageMessageEditor from "./components/ImageMessageEditor"
import VideoGenerateEditor from "./components/VideoGenerateEditor"
import MessageHistory from "./components/MessageHistory"
import VideoFullscreenOverlay from "./components/VideoFullscreenOverlay"
import ImageElementFullscreenOverlay from "./components/ImageElementFullscreenOverlay"
import { MagicProvider, useMagic } from "./context/MagicContext"
import { toPlainObject } from "./canvas/utils/utils"
import { PortalContainerProvider } from "./components/ui/custom/PortalContainerContext"
import { CanvasDesignI18nProvider } from "./context/I18nContext"
import { HostUiLocaleProvider } from "./context/HostUiLocaleContext"
import type { CanvasDesignRef, CanvasDesignProps } from "./types"
import CanvasTips from "./components/CanvasTips"
import { FloatingUIProvider } from "./context/FloatingUIContext"
import { useCanvasDesignRef } from "./hooks/useCanvasDesignRef"
import { useCanvasEventListeners } from "./hooks/useCanvasEventListeners"
import ImageCropPanel from "./components/ImageCropPanel"
import ImageExtendPanel from "./components/ImageExtendPanel"
import ImageEraserPanel from "./components/ImageEraserPanel"
import ElementRenameOverlay from "./components/ElementRenameOverlay"
export { prewarmCanvasDesignImageWorker } from "./prewarm"
import ElementActionHints from "./components/ElementActionHints"
import PluginPanel from "./components/PluginPanel"

import styles from "./index.module.css"

const CanvasDesignContent = forwardRef<CanvasDesignRef, CanvasDesignProps>((props, ref) => {
	const {
		id,
		readonly = false,
		data = {},
		marker = {},
		viewport = {},
		getDevice,
		t,
		shareHostBottomChrome = false,
	} = props

	const {
		defaultData,
		onCanvasDesignDataChange,
		onCanvasDesignDataPatchChange,
		elementActionHints,
		onElementActionHintAction,
	} = data

	const {
		defaultMarkers,
		beforeMarkerCreate,
		onMarkerCreated,
		onMarkerDeleted,
		onMarkerUpdated,
		onMarkerRestored,
	} = marker

	const { autoLoadCacheViewport = true } = viewport

	const { canvas, setCanvas } = useCanvas()

	const { width: layersWidth, collapsed: layersCollapsed } = useLayersUI()

	const { methods, permissions } = useMagic()

	const { fullscreenMediaElement, setFullscreenMediaElement } = useCanvasPanelUI()

	const canvasContainerRef = useRef<HTMLDivElement>(null)

	const canvasInstanceRef = useRef<Canvas | null>(null)
	const loadDocumentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// 处理 ref 方法暴露
	useCanvasDesignRef(ref)

	// 处理所有事件监听（onMarkerRestored 在 restoreMarkers 后直接调用，不通过画布事件）
	useCanvasEventListeners({
		readonly,
		methods,
		beforeMarkerCreate,
		onMarkerCreated,
		onMarkerDeleted,
		onMarkerUpdated,
		onCanvasDesignDataChange,
		onCanvasDesignDataPatchChange,
	})

	// 更新视口偏移量
	const updatePadding = useCallback(
		(instance: Canvas | null) => {
			if (!instance) return
			const left = layersCollapsed ? 0 : layersWidth + 8
			instance.viewportController.setDefaultViewportPadding({
				left,
				right: 0,
				top: 0,
				bottom: 0,
			})
		},
		[layersCollapsed, layersWidth],
	)

	useMount(() => {
		const designProjectId = id.trim()
		if (!designProjectId) {
			throw new Error("CanvasDesign: id is required as designProjectId.")
		}
		if (!canvasContainerRef.current) return
		const scopeElement = canvasContainerRef.current.closest("[data-canvas-ui-component]")
		const canvasInstance = new Canvas({
			element: canvasContainerRef.current,
			scopeElement:
				scopeElement instanceof HTMLElement ? scopeElement : canvasContainerRef.current,
			id: designProjectId,
			defaultReadyonly: readonly,
			plugins: props.plugins,
			magic: {
				methods: methods,
				permissions: permissions,
			},
			getDevice: getDevice,
			t: t,
		})

		setCanvas(canvasInstance)
		// 保存到 ref，确保卸载时能拿到实例
		canvasInstanceRef.current = canvasInstance
		updatePadding(canvasInstance)

		// 监听 document:loaded 事件，恢复 markers
		canvasInstance.eventEmitter.once("document:loaded", () => {
			// 恢复 markers
			if (defaultMarkers?.length) {
				canvasInstance.markerManager.restoreMarkers(defaultMarkers)
				// 直接回调，无需监听画布事件（数据本就来自父组件）
				const actualMarkers = canvasInstance.markerManager.exportMarkers()
				onMarkerRestored?.(actualMarkers)
			}
		})

		// 确保react层事件都监听了, 再初始化
		loadDocumentTimerRef.current = setTimeout(() => {
			loadDocumentTimerRef.current = null
			if (canvasInstanceRef.current !== canvasInstance) {
				return
			}
			// 使用传入的 defaultCanvasData 或默认空数据
			// 兼容 useImmer 创建的 Proxy 对象，转换为普通对象
			canvasInstance.loadDocument(defaultData ? toPlainObject(defaultData) : { elements: [] })
			// 从 storage 读取 viewport 信息并加载
			if (methods?.getStorage) {
				const storageData = methods.getStorage()
				if (autoLoadCacheViewport) {
					if (storageData?.viewport) {
						canvasInstance.loadViewport(storageData.viewport)
					} else {
						canvasInstance.viewportController.fitToScreen()
					}
				}
			}
		}, 10)
	})

	useUnmount(() => {
		if (loadDocumentTimerRef.current) {
			clearTimeout(loadDocumentTimerRef.current)
			loadDocumentTimerRef.current = null
		}
		const canvasInstance = canvasInstanceRef.current
		if (!canvasInstance) return
		canvasInstance.destroy()
		canvasInstanceRef.current = null
		setCanvas(null)
	})

	useUpdateEffect(() => {
		canvas?.setReadonly(readonly)
	}, [readonly, canvas])

	useUpdateEffect(() => {
		canvas?.setT(t)
	}, [t, canvas])

	useUpdateEffect(() => {
		canvas?.updateDeviceInfo(getDevice)
	}, [getDevice, canvas])

	useUpdateEffect(() => {
		canvas?.magicConfigManager.update({
			methods: methods,
			permissions: permissions,
		})
		canvas?.invalidateMagicModelListCaches()
	}, [methods, permissions, canvas, t])

	useUpdateEffect(() => {
		updatePadding(canvas)
	}, [layersCollapsed, layersWidth, canvas, updatePadding])

	return (
		<FloatingUIProvider canvas={canvas}>
			<div ref={canvasContainerRef} className={styles.canvasContainer} />
			<ElementActionHints hints={elementActionHints} onAction={onElementActionHintAction} />
			{!readonly && <ElementRenameOverlay />}
			{!readonly && <ElementTools />}
			{!readonly && <ImageMessageEditor />}
			{!readonly && <VideoGenerateEditor />}
			{!readonly && <ImageCropPanel />}
			{!readonly && <ImageExtendPanel />}
			{!readonly && <ImageEraserPanel />}
			<MessageHistory />
			{fullscreenMediaElement?.type === "video" ? (
				<VideoFullscreenOverlay
					elementId={fullscreenMediaElement.elementId}
					onClose={() => setFullscreenMediaElement(null)}
				/>
			) : null}
			{fullscreenMediaElement?.type === "image" ? (
				<ImageElementFullscreenOverlay
					elementId={fullscreenMediaElement.elementId}
					onClose={() => setFullscreenMediaElement(null)}
				/>
			) : null}
			<Layers />
			{!readonly && <Tools />}
			{!readonly && <PluginPanel />}
			{!readonly && <CanvasTips />}
			<Zoom shareHostBottomChrome={shareHostBottomChrome} />
		</FloatingUIProvider>
	)
})

const CanvasDesign = forwardRef<CanvasDesignRef, CanvasDesignProps>((props, ref) => {
	const { getDevice } = props

	const appContainerRef = useRef<HTMLDivElement | null>(null)

	const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)

	const setAppContainerRef = useCallback((node: HTMLDivElement | null) => {
		appContainerRef.current = node
		if (node) {
			setPortalContainer(node)
		}
	}, [])

	return (
		<MagicProvider
			readonly={props.readonly}
			methods={props.magic?.methods}
			permissions={props.magic?.permissions}
			hostUiLocale={props.magic?.hostUiLocale}
			projectAttachmentMentionTree={props.data?.projectAttachmentMentionTree}
			defaultProjectAttachmentFolderId={props.data?.defaultProjectAttachmentFolderId}
			defaultProjectAttachmentFolderName={props.data?.defaultProjectAttachmentFolderName}
			mentionDataServiceCtor={props.data?.mentionDataServiceCtor}
			mentionExtension={props.data?.mentionExtension}
			referenceResourcePanelRenderer={props.data?.referenceResourcePanelRenderer}
		>
			<UIProvider>
				<CanvasDesignI18nProvider t={props.t}>
					<HostUiLocaleProvider locale={props.magic?.hostUiLocale}>
						<PortalContainerProvider value={portalContainer}>
							<div
								ref={setAppContainerRef}
								className={styles.appContainer}
								data-canvas-ui-component
							>
								<CanvasProvider>
									<CanvasUIProvider readonly={props.readonly}>
										<ElementMenuProvider>
											<LayersUIProvider getDevice={getDevice}>
												<CanvasDesignContent ref={ref} {...props} />
											</LayersUIProvider>
										</ElementMenuProvider>
									</CanvasUIProvider>
								</CanvasProvider>
							</div>
						</PortalContainerProvider>
					</HostUiLocaleProvider>
				</CanvasDesignI18nProvider>
			</UIProvider>
		</MagicProvider>
	)
})

export default CanvasDesign
