import { createStyles } from "antd-style"
import {
	type Ref,
	useEffect,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle,
	useMemo,
	useLayoutEffect,
	useCallback,
} from "react"
import { useDeepCompareEffect, useMemoizedFn } from "ahooks"
import { filterInjectedTags } from "./utils"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { superMagicUploadTokenService } from "@/pages/superMagic/components/MessageEditor/services/UploadTokenService"
import { genFileData } from "@/pages/chatNew/components/MessageEditor/components/InputFiles/utils"
import { useUpload } from "@/hooks/useUploadFiles"
import { useTranslation } from "react-i18next"
import { addContentToChat } from "@/pages/superMagic/components/Detail/components/AIOptimization/utils"
import { decodeHTMLEntities, getFullContent } from "./utils/full-content"
import { extractStaticDependencies } from "./utils/extractDependencies"
import {
	buildHtmlVirtualStorageNamespace,
	createVirtualStorageContext,
	virtualStorageRegistry,
	type VirtualStorageRuntimeContext,
} from "./utils/virtual-storage"
import {
	clearIframeRenderLifecycleTimeout,
	createIframeRenderLifecycleState,
	mapSandboxTelemetryToLifecycleReport,
	reportIframeRenderLifecycleStage,
	startIframeRenderLifecycleSession,
	type IframeRenderLifecycleStage,
	type IframeRenderLifecycleContext,
} from "./telemetry/iframeRenderLifecycle"
import {
	HTML_SANDBOX_TELEMETRY_MESSAGE,
	normalizeHtmlSandboxTelemetryMessage,
} from "@dtyq/html-sandbox/telemetry"
import { useMediaScenario } from "./media/useMediaScenario"
import { handleMediaImageUrlRequest, MEDIA_MESSAGE_TYPES } from "./media/utils"
import { cn } from "@/lib/utils"
import { StylePanel } from "./components/StylePanel"
import type { HTMLEditorV2Ref, SaveResult } from "./iframe-bridge/types/props"
import type {
	ImageUploadRequestPayload,
	ImageUploadResultPayload,
} from "./iframe-bridge/types/messages"
import { useHTMLEditorV2 } from "./hooks/useHTMLEditorV2"
import { useImageDrop } from "./hooks/useImageDrop"
import { SelectionOverlay } from "./components/SelectionOverlay"
import { DropOverlay } from "./components/DropOverlay"
import { useZoomControls } from "./hooks/useZoomControls"
import { StylePanelStoreProvider } from "./iframe-bridge/contexts/StylePanelContext"
import { TAILWIND_Z_INDEX_CLASSES } from "./constants/z-index"
import { DevConsolePanel } from "./components/DevConsole"
import type { DevConsoleLayout } from "./components/DevConsole/types"
import { useDevConsole } from "./hooks/useDevConsole"
import { platformKey } from "@/utils/storage"
import { waitForProjectAttachmentChange } from "@/pages/superMagic/utils/projectAttachments/attachmentMutationWaiter"
import { useCurrentHtmlFileInfo } from "./hooks/useCurrentHtmlFileInfo"
import { useInspectorToolbarMode } from "./hooks/useInspectorToolbarMode"
import {
	useElementInspector,
	ElementInspectorOverlay,
} from "@/components/business/ElementInspector"
import type { CanonicalContentDimensions } from "./utils/slide-dimensions"
export interface IsolatedHTMLRendererRef {
	getIframeElement: () => HTMLIFrameElement | null
	getEditorRef: () => React.RefObject<HTMLEditorV2Ref> | null
	resetContent: () => void
	updateContent: (
		newContent: string,
		options?: {
			restoreSelectionMode?: boolean
		},
	) => void
	getContent: () => Promise<string | null>
	getFetchInterceptedCallback: () => OnFetchIntercepted | undefined
	toggleDevConsole: () => void
	/** Start element inspector in toolbar mode (no info card; selection creates new topic) */
	startInspector: () => void
	/** Stop element inspector mode */
	stopInspector: () => void
	/** Start element inspector in append mode (selection appends element info to current editor) */
	startInspectorAppend: () => void
}
//HTML预览增强组件 iframe里面的内容尺寸，用于计算缩放比例
export interface IsolatedHTMLRendererContentMetrics {
	contentWidth: number
	contentHeight: number
	phase?: "initial" | "settled"
	hasHorizontalOverflow?: boolean
	hasVerticalOverflow?: boolean
	verticalScrollbarWidth?: number
}
import magicToast from "@/components/base/MagicToaster/utils"
import {
	resolveUploadPath,
	cleanPath,
	getHtmlDirectoryPath,
	resolveHtmlRelativePath,
	findAttachmentByFileId,
	findDirectoryByRelativePath,
	normalizeProjectPath,
	deduplicateFilePath,
	type ProjectAttachmentNode,
} from "./utils/file-utils"
import { logger as Logger } from "@/utils/log"
import { useFetchInterceptionCache } from "./hooks/useFetchInterceptionCache"
import { POST_MESSAGE_TARGET_STRATEGIES, type OnFetchIntercepted } from "./utils/fetchInterceptor"
import { useIframeFS } from "./iframe-api/hooks/useIframeFS"
import { useIframeLLM } from "./iframe-api/hooks/useIframeLLM"
import { useIframeDatabase } from "./iframe-api/hooks/useIframeDatabase"
import { useIframeAgent } from "./iframe-api/hooks/useIframeAgent"
import { useIframeUserInfo } from "./iframe-api/hooks/useIframeUserInfo"
import { useMagicFiles } from "./iframe-api/hooks/useMagicFiles"
import { useIframeAgentActions } from "./hooks/useIframeAgentActions"
import {
	useHtmlAppPermissions,
	type HtmlAppPermissionController,
} from "./hooks/useHtmlAppPermissions"
import {
	saveIframeFileContent,
	createIframeFile,
	deleteIframeFile,
	deleteIframeFiles,
	moveIframeFile,
	renameIframeFile,
	getIframeFileInfo,
} from "./iframe-api/iframeApi"

import { env } from "@/utils/env"
import { userStore } from "@/models/user"
import { ContactApi } from "@/apis"
import MagicModal from "@/components/base/MagicModal"

interface IsolatedHTMLRendererProps {
	content: string
	/** API 返回的最原始 HTML 内容（未经 processHtmlContent 处理） */
	rawSourceCode?: string
	sandboxType?: "iframe" | "shadow-dom"
	className?: string
	isPptRender?: boolean
	isFullscreen?: boolean
	isEditMode?: boolean
	isSaving?: boolean
	saveEditContent?: (
		content: any,
		fileId?: string,
		enable_shadow?: boolean,
		fetchFileVersions?: (fileId: string) => void,
		isPPTEditMode?: boolean,
	) => Promise<void>
	onSaveReady?: (triggerSave: () => Promise<SaveResult | undefined>) => void
	fileId?: string
	filePathMapping: Map<string, string>
	/** 当前 HTML 所在目录，用于相对资源解析、上传默认目录等历史逻辑。 */
	htmlRelativeFolderPath?: string
	openNewTab: (fileId: string, path: string, autoEdit?: boolean) => void
	selectedProject?: any
	attachmentList?: any[]
	setSlideContents?: (slideContents: Map<number, string>) => void
	slideIndex?: number
	setProcessedContent?: (processedContent: string) => void
	isPlaybackMode?: boolean
	toolbarClassName?: string
	/** Mount target for `createPortal` (e.g. save/cancel) at style toolbar’s right */
	toolbarEndRef?: Ref<HTMLDivElement | null>
	isVisible?: boolean
	iframeClassName?: string
	containIframeOverscroll?: boolean //控制HTML预览增强组件内部是否启用
	hideVerticalScroll?: boolean
	enableScalingHeightCalculation?: boolean
	scaleContentDimensions?: CanonicalContentDimensions | null
	waitForSettledContentMetrics?: boolean
	autoFitScalePaddingFactor?: number
	autoFitVerticalPadding?: number
	manualScale?: number | null
	onManualScaleChange?: (scale: number | null) => void
	onScaleRatioChange?: (scale: number) => void
	disableDynamicResourceInterception?: boolean
	disableIframeDocumentClickBridge?: boolean // **重要** 控制HTML预览增强组件内部是否禁用 iframe 到父层的通用 DOM_CLICK 桥接
	onRenderReady?: () => void //控制HTML预览组件的skeleton结束时机
	onContentMetrics?: (metrics: IsolatedHTMLRendererContentMetrics) => void //计算HTML预览组件内部内容尺寸
	onInterrupt?: () => void //新增：中断回调
	/** 调试控制台关闭时回调（用于同步父组件状态）*/
	onDevConsoleClose?: () => void
	/** Parent-controlled DevTools state, kept in sync across iframe remounts. */
	devConsoleEnabled?: boolean
	/** AI 选取（appendToEditor）状态变化回调 */
	onAppendPickingChange?: (picking: boolean) => void
	/** 元素选取状态变化回调 */
	onInspectorActiveChange?: (active: boolean) => void
	/** Enable content-level inspector fallback for renderers without runtime support. */
	enableInlineInspectorFallback?: boolean
	/** Parent-owned controller used by the HTML detail toolbar and runtime. */
	permissionController?: HtmlAppPermissionController
}

function isHtmlImagesUploadPath(path: string): boolean {
	const normalized = normalizeProjectPath(path.trim().replace(/^\.\//, ""))
	return normalized === "images" || normalized.startsWith("images/")
}

/**
 * 根据目录和文件名，生成上传文件路径
 * @param path
 * @param fileName
 * @returns
 */
function resolveImageUploadRequestPath(path: string, fileName: string): string {
	const trimmedPath = path.trim() || "./images"
	const pathWithoutTrailingSlash = trimmedPath.replace(/\/+$/, "")
	const normalized = normalizeProjectPath(pathWithoutTrailingSlash.replace(/^\.\//, ""))
	const isDirectoryPath = trimmedPath.endsWith("/") || normalized === "images"

	if (!isDirectoryPath) return trimmedPath

	const uploadDirectory = normalized === "images" ? "./images" : pathWithoutTrailingSlash
	return `${uploadDirectory}/${fileName}`
}

interface MagicI18nLangSubscribeRequest {
	type: "MAGIC_I18N_LANG_SUBSCRIBE"
	requestId?: string
}

interface MagicContextGetRequest {
	type: "MAGIC_CONTEXT_GET_REQUEST"
	requestId?: string
}

interface MagicContextUser {
	user_id: string
	magic_id?: string
	organization_code?: string
	nickname?: string
	real_name?: string
	avatar_url?: string
	phone?: string
	email?: string | null
	job_title?: string
	path_nodes?: unknown[]
}

interface MagicContextPayload {
	userId: string
	userName: string
	user: MagicContextUser
	organizationCode: string
	language: string
}

interface LegacyImageUploadRequestData {
	targetSelector: string
}

const useStyles = createStyles(({ css }) => {
	return {
		rendererContainer: css`
			width: 100%;
			height: 100%;
			overflow: auto;
		`,
		hiddenScrollbar: css`
			scrollbar-width: none;
			-ms-overflow-style: none;

			&::-webkit-scrollbar {
				display: none;
				width: 0;
				height: 0;
			}
		`,
		pptManualZoomScrollbar: css`
			scrollbar-width: thin;
			scrollbar-color: rgb(var(--muted-foreground-rgb) / 0.45) transparent;

			&::-webkit-scrollbar {
				width: 8px;
				height: 8px;
			}

			&::-webkit-scrollbar-track {
				background: transparent;
			}

			&::-webkit-scrollbar-thumb {
				border: 2px solid transparent;
				border-radius: 9999px;
				background-color: rgb(var(--muted-foreground-rgb) / 0.45);
				background-clip: content-box;
			}

			&::-webkit-scrollbar-thumb:hover {
				background-color: rgb(var(--muted-foreground-rgb) / 0.7);
			}
		`,
		iframe: css`
			width: 100%;
			height: 100%;
			display: block;
		`,
		shadowHost: css`
			width: 100%;
			height: 100%;
			display: block;
			position: relative;
		`,
		loadingContainer: css`
			width: 100%;
			height: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		`,
	}
})

const logger = Logger.createLogger("IsolatedHTMLRenderer")

function normalizeContextUser(
	profile: any,
	fallback: any,
	userId: string,
	organizationCode: string,
): MagicContextUser {
	return {
		user_id: profile?.user_id || fallback?.user_id || userId,
		magic_id: profile?.magic_id || fallback?.magic_id,
		organization_code:
			profile?.organization_code || fallback?.organization_code || organizationCode,
		nickname: profile?.nickname || fallback?.nickname,
		real_name: profile?.real_name || fallback?.real_name,
		avatar_url: profile?.avatar_url || fallback?.avatar,
		phone: profile?.phone || fallback?.phone,
		email: profile?.email || fallback?.email,
		job_title: profile?.job_title,
		path_nodes: profile?.path_nodes,
	}
}

function getContextUserName(user: MagicContextUser): string {
	return (user.real_name || user.nickname || "").trim()
}

// Internal component that uses the StylePanelStore context
const IsolatedHTMLRendererInner = forwardRef<IsolatedHTMLRendererRef, IsolatedHTMLRendererProps>(
	(props, ref) => {
		const {
			content,
			rawSourceCode,
			sandboxType = "iframe",
			className,
			isPptRender,
			isFullscreen,
			isEditMode,
			isSaving = false,
			saveEditContent,
			onSaveReady,
			fileId,
			filePathMapping,
			openNewTab,
			htmlRelativeFolderPath,
			selectedProject,
			attachmentList,
			isPlaybackMode,
			toolbarClassName,
			toolbarEndRef,
			iframeClassName,
			isVisible,
			containIframeOverscroll = false,
			hideVerticalScroll = false,
			enableScalingHeightCalculation = false,
			scaleContentDimensions,
			waitForSettledContentMetrics = false,
			autoFitScalePaddingFactor = 1,
			autoFitVerticalPadding = 0,
			manualScale,
			onManualScaleChange,
			onScaleRatioChange,
			disableDynamicResourceInterception = false,
			disableIframeDocumentClickBridge = false,
			onRenderReady,
			onContentMetrics,
			onDevConsoleClose,
			devConsoleEnabled,
			onAppendPickingChange,
			onInspectorActiveChange,
			enableInlineInspectorFallback = false,
			permissionController,
		} = props
		const externalRenderSiteUrl = useMemo(() => env("MAGIC_HTML_SANDBOX_URL"), [])
		const htmlSandboxShellUrl = useMemo(
			() => externalRenderSiteUrl || "/husky.html",
			[externalRenderSiteUrl],
		)
		const externalRenderSiteOrigin = useMemo(() => {
			if (!externalRenderSiteUrl) return ""

			try {
				return new URL(externalRenderSiteUrl).origin
			} catch {
				return ""
			}
		}, [externalRenderSiteUrl])

		const iframeTargetOrigin = useMemo(
			() => externalRenderSiteOrigin || window.location.origin,
			[externalRenderSiteOrigin],
		)

		const postMessageTargetStrategy = useMemo(
			() =>
				externalRenderSiteUrl
					? POST_MESSAGE_TARGET_STRATEGIES.CROSS_ORIGIN_PARENT
					: POST_MESSAGE_TARGET_STRATEGIES.SAME_ORIGIN_ANCESTOR,
			[externalRenderSiteUrl],
		)

		const { styles, cx } = useStyles()
		const containerRef = useRef<HTMLDivElement>(null)
		const contentWrapperRef = useRef<HTMLDivElement>(null)
		const scrollContainerRef = useRef<HTMLDivElement>(null)
		const iframeRef = useRef<HTMLIFrameElement>(null)
		useEffect(() => {
			const iframe = iframeRef.current
			if (!iframe) return
			// Legacy fullscreen attributes for old WebKit/Firefox engines.
			iframe.setAttribute("allowfullscreen", "true")
			iframe.setAttribute("webkitallowfullscreen", "true")
			iframe.setAttribute("mozallowfullscreen", "true")
		}, [])

		const [iframeLoaded, setIframeLoaded] = useState(false)
		const [contentInjected, setContentInjected] = useState(false) // 标记内容是否已注入到 iframe
		const [processedSourceCode, setProcessedSourceCode] = useState<string | undefined>(
			undefined,
		) // 预处理后的 HTML 源码（供 DevConsole Sources 面板展示）
		const [virtualStorageContext, setVirtualStorageContext] =
			useState<VirtualStorageRuntimeContext | null>(null)
		const hasRenderedOnceRef = useRef(false) // 跟踪 iframe 是否至少已渲染一次
		const hasNotifiedRenderReadyRef = useRef(false)
		const hasIframeI18nSubscriberRef = useRef(false)
		const renderLifecycleRef = useRef(createIframeRenderLifecycleState())
		// Fallback timer: unblocks scaling when sandbox never sends contentMetrics
		const contentMetricsFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

		// Track selected element for zoom centering
		const [selectedElementRect, setSelectedElementRect] = useState<{
			top: number
			left: number
			width: number
			height: number
		} | null>(null)
		const [scalingContentMetrics, setScalingContentMetrics] = useState<{
			contentWidth: number
			contentHeight: number
			phase?: "initial" | "settled"
		} | null>(null)
		const shouldWaitForSettledContentMetrics =
			waitForSettledContentMetrics && !scaleContentDimensions

		// 使用缩放控制 hook 处理 PPT 渲染模式
		const {
			scaleRatio,
			shouldApplyScaling,
			isScaleReady,
			isManualZoom,
			handleScaleChange,
			getContentWrapperStyle,
			getIframeStyle,
		} = useZoomControls({
			containerRef,
			iframeRef,
			isPptRender,
			isFullscreen,
			iframeLoaded,
			contentInjected,
			isVisible,
			isEditMode,
			selectedElementRect,
			enableHeightCalculation: enableScalingHeightCalculation,
			scaleContentDimensions,
			contentMetricsOverride: scalingContentMetrics,
			waitForSettledContentMetrics: shouldWaitForSettledContentMetrics,
			autoFitScalePaddingFactor,
			autoFitVerticalPadding,
			manualScale,
			onManualScaleChange,
		})

		useEffect(() => {
			if (isPptRender && isScaleReady) {
				onScaleRatioChange?.(scaleRatio)
			}
		}, [isPptRender, isScaleReady, onScaleRatioChange, scaleRatio])

		const buildRenderLifecycleContext = useMemoizedFn((): IframeRenderLifecycleContext => {
			const lifecycle = renderLifecycleRef.current

			return {
				sessionId: lifecycle.sessionId,
				elapsedMs: Date.now() - lifecycle.startedAt,
				sandboxType,
				renderMode: externalRenderSiteUrl ? "cross-origin" : "same-origin",
				shellUrl: htmlSandboxShellUrl,
				shellOrigin: externalRenderSiteOrigin || window.location.origin,
				targetOrigin: iframeTargetOrigin,
				postMessageTargetStrategy,
				source: {
					depth: 0,
					fileId: fileId || "",
					path: htmlRelativeFolderPath || "",
				},
				fileId: fileId || "",
				relativeFilePath: htmlRelativeFolderPath || "",
				isPptRender: Boolean(isPptRender),
				isFullscreen: Boolean(isFullscreen),
				isEditMode: Boolean(isEditMode),
				isPlaybackMode: Boolean(isPlaybackMode),
				isVisible: Boolean(isVisible),
				shouldApplyScaling,
				isScaleReady,
				iframeLoaded,
				contentInjected,
				contentLength: content.length,
			}
		})

		const reportRenderLifecycleStage = useMemoizedFn(
			(
				stage: IframeRenderLifecycleStage,
				extra: Record<string, unknown> = {},
				options: { once?: boolean } = { once: true },
			) => {
				reportIframeRenderLifecycleStage({
					logger,
					lifecycle: renderLifecycleRef.current,
					getContext: buildRenderLifecycleContext,
					stage,
					extra,
					options,
				})
			},
		)

		const clearRenderLifecycleTimeout = useMemoizedFn(() => {
			clearIframeRenderLifecycleTimeout(renderLifecycleRef.current)
		})

		const startRenderLifecycleSession = useMemoizedFn((reason: string) => {
			startIframeRenderLifecycleSession({
				logger,
				lifecycleRef: renderLifecycleRef,
				getContext: buildRenderLifecycleContext,
				reason,
			})
		})

		// 跟踪缩放准备就绪时机以避免后续渲染时闪烁
		useEffect(() => {
			if (isScaleReady && isVisible) {
				hasRenderedOnceRef.current = true
				reportRenderLifecycleStage("scale_ready")
			}
		}, [isScaleReady, isVisible, reportRenderLifecycleStage])
		//控制HTML预览组件的skeleton结束时机
		useEffect(() => {
			hasNotifiedRenderReadyRef.current = false
			if (content) {
				startRenderLifecycleSession("content_changed")
			} else {
				clearRenderLifecycleTimeout()
			}
			setScalingContentMetrics(null)
			if (contentMetricsFallbackTimerRef.current) {
				clearTimeout(contentMetricsFallbackTimerRef.current)
				contentMetricsFallbackTimerRef.current = null
			}
		}, [clearRenderLifecycleTimeout, content, startRenderLifecycleSession])

		const notifyRenderReady = useMemoizedFn(() => {
			if (hasNotifiedRenderReadyRef.current) return

			hasNotifiedRenderReadyRef.current = true
			reportRenderLifecycleStage("render_ready")
			reportRenderLifecycleStage("render_success")
			clearRenderLifecycleTimeout()
			onRenderReady?.()
		})

		useEffect(() => {
			return () => {
				clearRenderLifecycleTimeout()
			}
		}, [clearRenderLifecycleTimeout])

		// Handle zoom request from iframe (trackpad pinch-to-zoom)
		const handleIframeZoomRequest = useMemoizedFn((delta: number) => {
			const scaleFactor = 0.002 // Sensitivity adjustment
			const scaleChange = delta * scaleFactor
			const newScale = scaleRatio + scaleChange
			handleScaleChange(newScale)
		})

		// V2 编辑机制相关
		const editorRef = useRef<HTMLEditorV2Ref>(null)
		useHTMLEditorV2({
			iframeRef,
			isEditMode,
			sandboxType,
			iframeLoaded,
			contentInjected,
			targetOrigin: iframeTargetOrigin,
			scaleRatio,
			saveEditContent,
			fileId,
			filePathMapping,
			editorRef,
			isPptRender,
			onZoomRequest: handleIframeZoomRequest,
		})

		// 使用 media scenario hook
		const {
			isMediaScenario,
			injectMediaScript,
			handleMediaSpeakerEdit,
			saveMediaConfiguration,
		} = useMediaScenario({
			attachmentList,
			fileId,
		})

		const { t, i18n } = useTranslation("super")
		const contextCacheRef = useRef<{
			key: string
			value?: MagicContextPayload
			promise?: Promise<MagicContextPayload>
		} | null>(null)

		const buildContextPayload = useMemoizedFn(async (): Promise<MagicContextPayload> => {
			const fallbackUser = userStore.user.userInfo
			const userId = fallbackUser?.user_id || ""
			const organizationCode = userStore.user.organizationCode?.trim() || ""
			const language = i18n.resolvedLanguage || i18n.language || "zh-CN"

			if (!userId) {
				throw new Error("Current user is not available")
			}
			if (!organizationCode) {
				throw new Error("Current organization is not available")
			}

			const cacheKey = `${organizationCode}:${userId}:${language}`
			const cached = contextCacheRef.current
			if (cached?.key === cacheKey && cached.value) return cached.value
			if (cached?.key === cacheKey && cached.promise) return cached.promise

			const promise = ContactApi.getUsersInfo({
				user_ids: [userId],
				query_type: 2,
				page_token: "",
			}).then((response) => {
				const profile = response?.items?.[0]
				if (!profile) {
					throw new Error("Current user profile is not available")
				}

				const user = normalizeContextUser(profile, fallbackUser, userId, organizationCode)
				const userName = getContextUserName(user)
				if (!userName) {
					throw new Error("Current user display name is not available")
				}

				const runtime = {
					userId,
					userName,
					user,
					organizationCode,
					language,
				}
				contextCacheRef.current = { key: cacheKey, value: runtime }
				return runtime
			})

			contextCacheRef.current = { key: cacheKey, promise }
			return promise
		})

		const handleContextMessage = useMemoizedFn(async (payload: MagicContextGetRequest) => {
			const { requestId } = payload
			if (!requestId) return

			try {
				const context = await buildContextPayload()
				iframeRef.current?.contentWindow?.postMessage(
					{
						type: "MAGIC_CONTEXT_GET_RESPONSE",
						requestId,
						success: true,
						content: context,
					},
					"*",
				)
			} catch (error) {
				logger.error("获取 HTML context 失败", error)
				iframeRef.current?.contentWindow?.postMessage(
					{
						type: "MAGIC_CONTEXT_GET_RESPONSE",
						requestId,
						success: false,
						error: error instanceof Error ? error.message : "Failed to get context",
					},
					"*",
				)
			}
		})

		const currentHtmlFileInfo = useCurrentHtmlFileInfo({
			attachmentList: attachmentList as ProjectAttachmentNode[] | undefined,
			fileId,
		})
		// DevTools console — resolve the full file path (with filename) for the current HTML file
		const currentHtmlFilePath = currentHtmlFileInfo.relativeFilePath
		const htmlEntryFilePath = currentHtmlFilePath || ""
		const devConsoleFilePath = currentHtmlFilePath
		const devConsole = useDevConsole({
			iframeRef,
			fileId,
			relativeFilePath: devConsoleFilePath,
		})
		const setDevConsoleEnabled = devConsole.setEnabled
		const [devConsoleLayout, setDevConsoleLayout] = useState<DevConsoleLayout>(() => {
			return localStorage.getItem(platformKey("devConsole_layout")) === "right"
				? "right"
				: "bottom"
		})
		const handleDevConsoleLayoutChange = useCallback((layout: DevConsoleLayout) => {
			setDevConsoleLayout(layout)
			localStorage.setItem(platformKey("devConsole_layout"), layout)
		}, [])

		useEffect(() => {
			if (devConsoleEnabled !== undefined) {
				setDevConsoleEnabled(devConsoleEnabled)
			}
		}, [devConsoleEnabled, setDevConsoleEnabled])

		// Element inspector (independent, can be triggered from DevConsole or elsewhere)
		const elementInspector = useElementInspector({ iframeRef })
		const inspectorFileInfo = useMemo(() => {
			if (!fileId) return undefined
			const file = findAttachmentByFileId(
				attachmentList as ProjectAttachmentNode[] | undefined,
				fileId,
			)
			if (!file?.file_name) return undefined
			return { fileId, fileName: file.file_name, filePath: file.relative_file_path ?? "" }
		}, [fileId, attachmentList])
		const {
			hideInfoCard: inspectorHideInfoCard,
			startInToolbarMode,
			startInAppendMode,
			isAppendPicking,
		} = useInspectorToolbarMode(elementInspector, t, inspectorFileInfo)

		useEffect(() => {
			onAppendPickingChange?.(isAppendPicking)
		}, [isAppendPicking, onAppendPickingChange])

		useEffect(() => {
			onInspectorActiveChange?.(elementInspector.active)
		}, [elementInspector.active, onInspectorActiveChange])

		const { upload } = useUpload<any>({
			url: superMagicUploadTokenService.getUploadTokenUrl,
			body: {
				project_id: selectedProject?.id ?? "",
				expires: 3600,
			},
			rewriteFileName: false,
			useSnowflakeId: true,
		})

		const toStoredRelativePath = useMemoizedFn((uploadedRelativePath: string) => {
			return resolveHtmlRelativePath(uploadedRelativePath, currentHtmlFilePath)
		})

		const ensureHtmlImagesDirectoryId = useMemoizedFn(async () => {
			if (!selectedProject?.id) throw new Error("No project selected")

			const htmlDirectoryPath = getHtmlDirectoryPath(currentHtmlFilePath)
			const imagesDirectoryPath = `${htmlDirectoryPath}images`
			const htmlDirectory = findDirectoryByRelativePath(
				attachmentList as ProjectAttachmentNode[] | undefined,
				htmlDirectoryPath,
			)
			const existingDirectory = findDirectoryByRelativePath(
				attachmentList as ProjectAttachmentNode[] | undefined,
				imagesDirectoryPath,
			)
			if (existingDirectory?.file_id) return existingDirectory.file_id

			const res = await createIframeFile({
				project_id: selectedProject.id,
				parent_id: currentHtmlFileInfo.parentId || htmlDirectory?.file_id || "",
				file_name: "images",
				is_directory: true,
				ignore_duplicate: true,
			})
			if (!res?.file_id) throw new Error("Failed to create images directory")
			return res.file_id
		})

		const uploadImageFileToProject = useMemoizedFn(
			async ({
				file,
				path,
				fileSize,
				parentId,
			}: {
				file: File
				path: string
				fileSize?: number
				parentId?: string
			}) => {
				if (!selectedProject?.id) {
					throw new Error("No project selected")
				}

				const resolvedPath = deduplicateFilePath(
					resolveUploadPath(path, currentHtmlFilePath),
					attachmentList as ProjectAttachmentNode[] | undefined,
				)
				const cleanPathValue = cleanPath(resolvedPath)
				const resolvedParentId =
					parentId ??
					(isHtmlImagesUploadPath(path) ? await ensureHtmlImagesDirectoryId() : undefined)

				const token = await superMagicUploadTokenService.getUploadToken(
					selectedProject.id,
					cleanPathValue || "",
				)
				const newFiles = Array.from([file]).map(genFileData)
				const { fullfilled } = await upload(newFiles, token)
				if (fullfilled.length === 0) {
					throw new Error("Upload failed")
				}

				// 使用上传 SDK 返回的真实 OSS 路径（雪花 ID key），而非拼接的 dir + file.name，
				// 避免 file_key 与 OSS 实际对象路径不一致导致后端访问 404。
				const uploadedKey = fullfilled[0].value.key

				// 从去重后的路径中提取实际文件名
				const deduplicatedFileName = resolvedPath.includes("/")
					? resolvedPath.slice(resolvedPath.lastIndexOf("/") + 1)
					: resolvedPath

				const saveRes = await superMagicUploadTokenService.saveFileToProject({
					project_id: selectedProject.id,
					parent_id: resolvedParentId,
					file_key: uploadedKey,
					file_name: deduplicatedFileName || file.name,
					file_size: fileSize || file.size,
					file_type: "user_upload",
					source: 2,
					storage_type: "workspace",
					relative_file_path: resolvedPath,
				})

				if (!saveRes?.relative_file_path) {
					throw new Error("Uploaded file path is empty")
				}

				return {
					uploadedRelativeFilePath: saveRes.relative_file_path,
					storedRelativeFilePath: toStoredRelativePath(saveRes.relative_file_path),
				}
			},
		)

		// 拖拽插入图片 hook
		const { isDragOver, isGlobalDragActive, dragOverHandlers } = useImageDrop({
			iframeRef,
			isEditMode,
			scaleRatio,
			relative_file_path: htmlRelativeFolderPath,
			attachmentList,
			filePathMapping,
			uploadImageFileToProject,
			targetOrigin: iframeTargetOrigin,
			onUploadSuccess: () => {
				pubsub.publish(PubSubEvents.Update_Attachments)
			},
		})

		// 消息列表预览这类只依赖预处理结果的场景，不需要再启用运行时相对路径拦截，
		// 避免把不在附件树里的原始相对路径也带进通用业务拦截链。
		// 扁平化 attachmentList，供 IframeFS 使用
		const flatFileList = useMemo(() => {
			const seen = new Set<string>()
			const result: { file_id: string; relative_file_path: string; updated_at?: string }[] =
				[]
			const flatten = (items: any[]) => {
				for (const item of items) {
					if (item.file_id && item.relative_file_path) {
						const key = item.relative_file_path.replace(/^\/+/, "")
						if (!seen.has(key)) {
							seen.add(key)
							result.push(item)
						}
					}
					if (item.children?.length) flatten(item.children)
				}
			}
			if (attachmentList?.length) flatten(attachmentList)
			return result
		}, [attachmentList])
		const fallbackPermissionController = useHtmlAppPermissions({
			content,
			rawSourceCode,
			relativeFilePath: htmlEntryFilePath,
			projectId: selectedProject?.id,
			fileList: flatFileList,
			enabled: !permissionController,
		})
		const { htmlAppConfig, authorizeHtmlPermission, authorizeHtmlPermissions } =
			permissionController || fallbackPermissionController

		const { handleFSMessage } = useIframeFS({
			iframeRef,
			targetOrigin: iframeTargetOrigin,
			entryPath: htmlEntryFilePath,
			fileList: flatFileList,
			appConfig: htmlAppConfig,
			projectId: selectedProject?.id,
			uploadFn: uploadImageFileToProject,
			saveContentFn: ({ file_id, content }) => saveIframeFileContent([{ file_id, content }]),
			mkdirFn: useMemoizedFn(async ({ name, parentId }) => {
				if (!selectedProject?.id) throw new Error("No project selected")
				const res = await createIframeFile({
					project_id: selectedProject.id,
					parent_id: parentId,
					file_name: name,
					is_directory: true,
				})
				const fileId = res?.file_id
				if (!fileId) throw new Error(`Failed to create directory: ${name}`)
				return { file_id: fileId }
			}),
			deleteFn: useMemoizedFn(async ({ file_id, project_id }) => {
				await deleteIframeFile(file_id, project_id)
			}),
			deleteFilesFn: useMemoizedFn(async ({ file_ids, project_id }) => {
				await deleteIframeFiles(file_ids, project_id)
			}),
			moveFileFn: useMemoizedFn(async ({ file_id, target_parent_id, project_id }) => {
				await moveIframeFile({ file_id, target_parent_id, project_id })
			}),
			renameFileFn: useMemoizedFn(async ({ file_id, target_name }) => {
				await renameIframeFile({ file_id, target_name })
			}),
			verifyFileFn: useMemoizedFn(async ({ file_id, project_id }) =>
				getIframeFileInfo(file_id, project_id),
			),
			authorizePermission: authorizeHtmlPermission,
			confirmProjectDeleteFn: useMemoizedFn(
				({ path, isDirectory, appRootDir, operation }) =>
					new Promise<boolean>((resolve) => {
						const operationText = t(
							`htmlEditor.projectFileOperationConfirm.operations.${operation || "delete"}`,
						)
						const targetTypeText = t(
							`htmlEditor.projectFileOperationConfirm.targetTypes.${isDirectory ? "directory" : "file"}`,
						)
						const displayAppRootDir =
							appRootDir || t("htmlEditor.projectFileOperationConfirm.projectRoot")
						const modal = MagicModal.confirm({
							title: t("htmlEditor.projectFileOperationConfirm.title", {
								operation: operationText,
							}),
							content: t("htmlEditor.projectFileOperationConfirm.content", {
								operation: operationText,
								targetType: targetTypeText,
								path,
								appRootDir: displayAppRootDir,
							}),
							okText: operationText,
							cancelText: t("htmlEditor.projectFileOperationConfirm.cancel"),
							closable: false,
							maskClosable: false,
							centered: true,
							onOk: () => {
								modal.destroy()
								resolve(true)
							},
							onCancel: () => {
								modal.destroy()
								resolve(false)
							},
						})
					}),
			),
		})

		const { handleLLMMessage } = useIframeLLM({
			iframeRef,
			targetOrigin: iframeTargetOrigin,
			baseUrl: (env("MAGIC_SERVICE_BASE_URL") as string) || "",
			getAuthorization: () => userStore.user.authorization?.trim() || "",
			getOrganizationCode: () => userStore.user.organizationCode?.trim() || "",
			authorizePermission: authorizeHtmlPermission,
		})

		const { handleDatabaseMessage } = useIframeDatabase({
			iframeRef,
			projectId: selectedProject?.id,
		})

		const { getAgentList, createTopicAndSend, sendMessage } = useIframeAgentActions()

		const { handleAgentMessage } = useIframeAgent({
			iframeRef,
			targetOrigin: iframeTargetOrigin,
			getAgentList,
			createTopicAndSend,
			sendMessage,
			enableWriteOperations: true,
			authorizePermission: authorizeHtmlPermission,
		})

		const { handleUserInfoMessage } = useIframeUserInfo({
			iframeRef,
			targetOrigin: iframeTargetOrigin,
			getUserInfo: useMemoizedFn(() => {
				const info = userStore.user.userInfo
				if (!info) return null
				const realName = info.real_name || ""
				const nickname = info.nickname || ""
				return {
					user_id: info.user_id || "",
					magic_id: info.magic_id || "",
					nickname,
					real_name: realName,
					name: realName || nickname,
					avatar: info.avatar || "",
					organization_code: info.organization_code || "",
				}
			}),
			authorizeUserInfo: useMemoizedFn(({ scopes, reason }) =>
				authorizeHtmlPermissions(scopes, {
					reason,
					presentation: "userInfo",
				}),
			),
		})

		const isDynamicInterceptionEnabled = !disableDynamicResourceInterception
		const dynamicResourceInterceptionConfig = useMemo(() => {
			return {
				enable: isDynamicInterceptionEnabled,
				fileId: fileId || "",
				postMessageTargetStrategy,
			}
		}, [fileId, isDynamicInterceptionEnabled, postMessageTargetStrategy])

		const { handleMagicUploadFiles, handleMagicAddFilesToMessage, handleMagicDownloadFiles } =
			useMagicFiles({
				iframeRef,
				targetOrigin: iframeTargetOrigin,
				selectedProject,
				attachmentList,
				htmlRelativeFolderPath,
				uploadImageFileToProject,
				authorizePermission: authorizeHtmlPermission,
			})

		// 监听 iframe 准备就绪并初始化内容
		useEffect(() => {
			try {
				const iframe = iframeRef.current
				if (!iframe) return

				setIframeLoaded(false)
				setContentInjected(false)

				// 同源和跨域统一通过 URL shell 自举，避免维护两套 shell 初始化流程。
				if (iframe.getAttribute("src") !== htmlSandboxShellUrl) {
					iframe.src = htmlSandboxShellUrl
				}
			} catch (error) {
				console.error("初始化iframe内容时出错:", error)
			}
		}, [htmlSandboxShellUrl])

		const getMarkerId = useMemoizedFn(() => {
			if (!attachmentList || !fileId) return fileId

			// 查找当前文件信息
			const currentFile = attachmentList.find((item: any) => item.file_id === fileId)
			if (currentFile?.parent_id) {
				// 查找父目录信息
				const parentDirectory = attachmentList.find(
					(item: any) => item.file_id === currentFile.parent_id,
				)
				// 如果父目录存在display_config，返回父目录ID
				if (parentDirectory?.display_config) {
					return currentFile.parent_id
				}
			}
			// 默认返回文件ID
			return fileId
		})

		useEffect(() => {
			let cancelled = false
			const markerId = getMarkerId()
			const namespace = buildHtmlVirtualStorageNamespace({
				projectId: selectedProject?.id,
				topicId: selectedProject?.current_topic_id,
				fileId: markerId || fileId,
			})

			setVirtualStorageContext(null)
			void createVirtualStorageContext({
				namespace,
				targetOrigin: window.location.origin,
			}).then((context) => {
				if (!cancelled) setVirtualStorageContext(context)
			})

			return () => {
				cancelled = true
			}
		}, [
			// attachmentList,
			fileId,
			getMarkerId,
			selectedProject?.current_topic_id,
			selectedProject?.id,
		])

		useEffect(() => {
			if (!virtualStorageContext) return
			const iframeWindow = iframeRef.current?.contentWindow
			if (!iframeWindow) return

			const registeredContext = {
				...virtualStorageContext,
				source: iframeWindow,
				origin: iframeTargetOrigin,
				expiresAt: undefined,
			}
			virtualStorageRegistry.register(registeredContext)
			return () => {
				virtualStorageRegistry.unregister(registeredContext)
			}
		}, [iframeLoaded, iframeTargetOrigin, virtualStorageContext])

		const reloadIframeContent = () => {
			pubsub.publish(PubSubEvents.Super_Magic_Detail_Refresh)
		}

		const notifyIframeI18nLang = useMemoizedFn(
			(source: "subscribe_ack" | "language_changed", requestId?: string) => {
				const currentLang = i18n.resolvedLanguage || i18n.language || "zh-CN"
				if (!iframeRef.current?.contentWindow) return

				iframeRef.current.contentWindow.postMessage(
					{
						type: "MAGIC_I18N_LANG_SUBSCRIBE",
						requestId,
						success: true,
						results: {
							lang: currentLang,
							source,
						},
					},
					iframeTargetOrigin,
				)
			},
		)

		const handleIframeElementLoad = useMemoizedFn(() => {
			reportRenderLifecycleStage("shell_loaded")
		})

		const handleIframeElementError = useMemoizedFn(() => {
			reportRenderLifecycleStage("shell_load_failed", {
				reason: "iframe_element_error",
			})
		})

		const refreshIframeContent = useMemoizedFn(() => {
			if (!virtualStorageContext) return
			hasIframeI18nSubscriberRef.current = false
			// 解码HTML实体
			let decodedContent = decodeHTMLEntities(content)

			// 如果是media场景，注入media脚本
			if (isMediaScenario) {
				decodedContent = injectMediaScript(decodedContent)
			}

			// 根据HTML文件上下文确定标记ID：如果父目录存在metadata则使用父目录ID，否则使用文件ID
			const markerId = getMarkerId()
			// 创建完整HTML内容
			const fullContent = getFullContent(decodedContent, markerId, {
				dynamicInterception: dynamicResourceInterceptionConfig,
				containOverscroll: containIframeOverscroll,
				hideVerticalScroll,
				disableParentClickBridge: disableIframeDocumentClickBridge,
				enableInlineInspectorFallback,
				postMessageTargetStrategy,
				virtualStorage: virtualStorageContext,
			})

			// 发送内容到iframe
			try {
				if (iframeRef.current && iframeRef.current.contentWindow) {
					iframeRef.current.contentWindow.postMessage(
						{
							type: "setContent",
							content: fullContent,
						},
						iframeTargetOrigin,
					)
					reportRenderLifecycleStage("set_content_sent", {
						fullContentLength: fullContent.length,
						markerId,
						dynamicInterceptionEnabled: Boolean(
							dynamicResourceInterceptionConfig?.enable,
						),
					})
					setProcessedSourceCode(fullContent)
				} else {
					reportRenderLifecycleStage("set_content_failed", {
						reason: "iframe_or_content_window_unavailable",
					})
					console.error("iframe或contentWindow不可用")
				}
			} catch (postError) {
				reportRenderLifecycleStage("set_content_failed", {
					reason: "post_message_failed",
					errorMessage:
						postError instanceof Error ? postError.message : String(postError),
					errorStack: postError instanceof Error ? postError.stack : undefined,
				})
				console.error("发送消息到iframe时出错:", postError)
			}
		})

		// 使用 fetch 拦截缓存 hook（必须在 refreshIframeContent 定义之后）
		const { handleFetchIntercepted, dynamicDependencyEntries } = useFetchInterceptionCache({
			attachmentList,
			sandboxType,
			isEditMode,
			iframeRef,
			content,
			refreshIframeContent,
			setContentInjected,
		})

		// Combine static + dynamic dependency entries for the DevConsole
		const staticDependencyEntries = useMemo(() => extractStaticDependencies(content), [content])
		const allDependencyEntries = useMemo(
			() => [...staticDependencyEntries, ...dynamicDependencyEntries],
			[staticDependencyEntries, dynamicDependencyEntries],
		)

		// Enrich network entries with originalUrl/resolvedUrl from dependency mapping
		const enrichedNetworkEntries = useMemo(() => {
			if (allDependencyEntries.length === 0) return devConsole.networkEntries
			const urlMap = new Map<string, string>()
			for (const dep of allDependencyEntries) {
				if (dep.originalUrl !== dep.resolvedUrl) {
					urlMap.set(dep.originalUrl, dep.resolvedUrl)
				}
			}
			if (urlMap.size === 0) return devConsole.networkEntries
			return devConsole.networkEntries.map((entry) => {
				const resolvedUrl = urlMap.get(entry.url)
				return resolvedUrl ? { ...entry, originalUrl: entry.url, resolvedUrl } : entry
			})
		}, [devConsole.networkEntries, allDependencyEntries])

		// Expose iframe element and editor ref via ref
		useImperativeHandle(
			ref,
			() => ({
				getIframeElement: () => iframeRef.current,
				getEditorRef: () => editorRef,
				resetContent: () => {
					// Clear edit history
					if (editorRef.current) {
						editorRef.current.clearHistory().catch((error) => {
							console.error("清除编辑历史失败:", error)
						})
					}
					// Refresh iframe content to original state
					refreshIframeContent()
				},
				updateContent: async (
					newContent: string,
					options?: {
						// 允许调用方在取消/放弃时禁用选择模式恢复
						restoreSelectionMode?: boolean
					},
				) => {
					hasIframeI18nSubscriberRef.current = false
					// Save current edit mode state before updating content
					const wasInEditMode = isEditMode
					// 默认恢复；仅显式传 false 时不恢复
					const shouldRestoreSelectionMode = options?.restoreSelectionMode !== false

					// Clear edit history and reset editor state
					if (editorRef.current) {
						await editorRef.current.clearHistory().catch((error) => {
							console.error("清除编辑历史失败:", error)
						})
						await editorRef.current.resetEditorState().catch((error) => {
							console.error("重置编辑器状态失败:", error)
						})
					}
					// Update iframe with new content
					let decodedContent = decodeHTMLEntities(newContent)

					// 如果是media场景，注入media脚本
					if (isMediaScenario) {
						decodedContent = injectMediaScript(decodedContent)
					}

					// 根据HTML文件上下文确定标记ID
					const markerId = getMarkerId()
					if (!virtualStorageContext) return
					// 创建完整HTML内容
					const fullContent = getFullContent(decodedContent, markerId, {
						dynamicInterception: dynamicResourceInterceptionConfig,
						containOverscroll: containIframeOverscroll,
						hideVerticalScroll,
						disableParentClickBridge: disableIframeDocumentClickBridge,
						enableInlineInspectorFallback,
						postMessageTargetStrategy,
						virtualStorage: virtualStorageContext,
					})
					// 发送内容到iframe
					try {
						if (iframeRef.current && iframeRef.current.contentWindow) {
							console.log("更新html内容为新版本")
							iframeRef.current.contentWindow.postMessage(
								{
									type: "setContent",
									content: fullContent,
								},
								iframeTargetOrigin,
							)

							// Re-enter selection mode after iframe content is replaced
							// Wait for iframe runtime to be ready, then restore edit mode
							if (wasInEditMode && shouldRestoreSelectionMode && editorRef.current) {
								// Wait a bit for iframe runtime to initialize
								setTimeout(async () => {
									try {
										await editorRef.current?.enableSelectionMode()
									} catch (error) {
										console.error("重新进入选择模式失败:", error)
									}
								}, 500)
							}
						} else {
							console.error("iframe或contentWindow不可用")
						}
					} catch (postError) {
						console.error("发送消息到iframe时出错:", postError)
					}
				},
				getContent: async () => {
					if (editorRef.current) {
						try {
							return await editorRef.current.getContent()
						} catch (error) {
							console.error("获取内容失败:", error)
							return null
						}
					}
					return null
				},
				getFetchInterceptedCallback: () => handleFetchIntercepted,
				toggleDevConsole: devConsole.toggle,
				startInspector: () => {
					startInToolbarMode()
				},
				stopInspector: () => {
					elementInspector.stop()
				},
				startInspectorAppend: () => {
					startInAppendMode()
				},
			}),
			[
				containIframeOverscroll,
				disableIframeDocumentClickBridge,
				dynamicResourceInterceptionConfig,
				getMarkerId,
				hideVerticalScroll,
				injectMediaScript,
				isEditMode,
				isMediaScenario,
				refreshIframeContent,
				editorRef,
				handleFetchIntercepted,
				iframeTargetOrigin,
				postMessageTargetStrategy,
				devConsole.toggle,
				elementInspector,
				enableInlineInspectorFallback,
				startInAppendMode,
				startInToolbarMode,
				virtualStorageContext,
			],
		)

		// 处理iframe中的图片上传请求
		const handleImageUploadRequest = (
			data: ImageUploadRequestPayload | LegacyImageUploadRequestData,
		) => {
			const isStructuredRequest = (
				requestData: ImageUploadRequestPayload | LegacyImageUploadRequestData,
			): requestData is ImageUploadRequestPayload => {
				return (
					"requestId" in requestData &&
					"action" in requestData &&
					"selector" in requestData &&
					"suggestedPath" in requestData
				)
			}

			const postStructuredImageUploadResult = (payload: ImageUploadResultPayload) => {
				iframeRef.current?.contentWindow?.postMessage(
					{
						type: "IMAGE_UPLOAD_RESULT",
						data: payload,
					},
					iframeTargetOrigin,
				)
			}

			const fileInput = document.createElement("input")
			fileInput.type = "file"
			fileInput.accept = "image/*"
			fileInput.style.display = "none"
			document.body.appendChild(fileInput)

			fileInput.addEventListener("change", async (e) => {
				const file = (e.target as HTMLInputElement).files?.[0]
				if (!file) {
					if (isStructuredRequest(data)) {
						postStructuredImageUploadResult({
							requestId: data.requestId,
							action: data.action,
							selector: data.selector,
							success: false,
							cancelled: true,
						})
					}
					document.body.removeChild(fileInput)
					return
				}

				try {
					magicToast.loading({
						content: t("topicFiles.fileUploading"),
						duration: 0,
					})

					const suggestedUploadPath = isStructuredRequest(data)
						? data.suggestedPath
						: "./images"
					const uploadPath = resolveImageUploadRequestPath(suggestedUploadPath, file.name)
					const uploadResult = await uploadImageFileToProject({
						file,
						path: uploadPath,
						fileSize: file.size,
					})
					const previewUrl = await fileToBase64(file)

					if (isStructuredRequest(data)) {
						postStructuredImageUploadResult({
							requestId: data.requestId,
							action: data.action,
							selector: data.selector,
							success: true,
							previewUrl,
							relativeFilePath: uploadResult.storedRelativeFilePath,
						})
					} else {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "IMAGE_UPLOAD_RESULT",
								src: previewUrl,
								dataSrc: uploadResult.storedRelativeFilePath,
								targetSelector: data.targetSelector,
							},
							iframeTargetOrigin,
						)
					}

					void waitForProjectAttachmentChange(selectedProject?.id, {
						operations: ["add"],
						matchMode: "project-any-apply",
						fallback: "full-refresh",
						reason: "html-isolated-image-upload",
						callback: () => {
							magicToast.destroy()
							magicToast.success(t("topicFiles.fileUploadSuccess"))
						},
					})
					console.log(
						"图片已转换为base64并发送给iframe",
						iframeRef.current?.contentWindow,
					)
				} catch (error) {
					console.error("转换图片失败:", error)
					if (isStructuredRequest(data)) {
						postStructuredImageUploadResult({
							requestId: data.requestId,
							action: data.action,
							selector: data.selector,
							success: false,
							error: error instanceof Error ? error.message : "图片转换失败",
						})
					} else {
						iframeRef.current?.contentWindow?.postMessage(
							{
								type: "IMAGE_UPLOAD_RESULT",
								error: "图片转换失败",
								targetSelector: data.targetSelector,
							},
							iframeTargetOrigin,
						)
					}
					magicToast.destroy()
					magicToast.error(t("topicFiles.fileUploadError", "文件上传失败"))
				} finally {
					document.body.removeChild(fileInput)
				}
			})

			// 触发文件选择
			try {
				fileInput.click()
			} catch (error) {
				console.error("触发文件选择失败:", error)
				if (isStructuredRequest(data)) {
					postStructuredImageUploadResult({
						requestId: data.requestId,
						action: data.action,
						selector: data.selector,
						success: false,
						error: error instanceof Error ? error.message : "触发文件选择失败",
					})
				}
				document.body.removeChild(fileInput)
			}
		}

		// 将文件转换为base64的工具函数
		const fileToBase64 = (file: File): Promise<string> => {
			return new Promise((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve(reader.result as string)
				reader.onerror = () => reject(new Error("文件读取失败"))
				reader.readAsDataURL(file)
			})
		}

		// 创建消息监听器
		const iframeMessageTypes = useMemo(
			() =>
				new Set<string>([
					"iframeReady",
					"pageLoaded",
					"contentLoaded",
					"domReady",
					"renderComplete",
					"pageFullyLoaded",
					"contentMetrics",
					"linkClicked",
					"DOWNLOAD_IMAGE",
					"REQUEST_IMAGE_UPLOAD",
					"AI_OPTIMIZATION_ACTION",
					"DOM_CLICK",
					"saveContent",
					"MAGIC_RELOAD_REQUEST",
					"MAGIC_SET_INPUT_MESSAGE",
					"MAGIC_UPLOAD_FILES_REQUEST",
					"MAGIC_ADD_FILES_TO_MESSAGE_REQUEST",
					"MAGIC_DOWNLOAD_FILES_REQUEST",
					"MAGIC_GET_AGENTS_REQUEST",
					"MAGIC_CREATE_TOPIC_AND_SEND_REQUEST",
					"MAGIC_SEND_MESSAGE_REQUEST",
					"MAGIC_I18N_LANG_SUBSCRIBE",
					"DRAG_POSITION_RESPONSE",
					HTML_SANDBOX_TELEMETRY_MESSAGE,
					MEDIA_MESSAGE_TYPES.SPEAKER_EDITED,
					MEDIA_MESSAGE_TYPES.IMAGE_URL_REQUEST,
				]),
			[],
		)

		const buildMessageLogContext = useMemoizedFn(
			(
				event: MessageEvent,
				messageType: string,
				extra: Record<string, unknown> = {},
			): Record<string, unknown> => {
				const href = typeof event.data?.href === "string" ? event.data.href : ""
				const autoEdit = event.data?.autoEdit === true

				return {
					messageType,
					href,
					autoEdit,
					origin: event.origin,
					fileId: fileId || "",
					relativeFilePath: htmlEntryFilePath,
					isPlaybackMode: Boolean(isPlaybackMode),
					userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
					...extra,
				}
			},
		)

		const handleMessage = useMemoizedFn(async (event: MessageEvent) => {
			const messageType = typeof event.data?.type === "string" ? event.data.type : ""
			const isExpectedSource = event.source === iframeRef.current?.contentWindow
			const isAllowedType = messageType ? iframeMessageTypes.has(messageType) : false
			const shouldStrictlyValidatePreviewSource =
				Boolean(messageType) &&
				[
					"iframeReady",
					"pageLoaded",
					"contentLoaded",
					"domReady",
					"renderComplete",
					"pageFullyLoaded",
					"contentMetrics",
				].includes(messageType)
			const isAllowedTelemetryOrigin =
				messageType === HTML_SANDBOX_TELEMETRY_MESSAGE &&
				Boolean(event.origin) &&
				(event.origin === iframeTargetOrigin || event.origin === window.location.origin)

			// 只处理来自iframe的消息，兼容钉钉 WebView source 不一致
			if (!isExpectedSource && !isAllowedType) {
				if (messageType === "linkClicked" || Boolean(event.data?.href)) {
					logger.report(
						"忽略 iframe link 消息：source 不匹配且类型不在白名单",
						buildMessageLogContext(event, messageType, {
							isExpectedSource,
							isAllowedType,
						}),
					)
				}
				return
			}

			if (shouldStrictlyValidatePreviewSource && !isExpectedSource) return

			// 检查是否是 EditorBridge 协议消息（由 MessageBridge 处理）
			// MessageBridge 的监听器会先处理新协议消息（有 version 字段的）
			// 这里只处理旧协议消息（没有 version 字段的）
			if (event.data?.version === "1.0.0") {
				// 新协议消息，由 MessageBridge 处理，这里跳过
				// 注意：MessageBridge 的监听器和这个监听器都会收到消息
				// MessageBridge 会处理新协议消息，这里只处理旧协议消息
				return
			}

			try {
				// 处理旧协议消息（没有 version 字段的）

				if (event.data && event.data.type === HTML_SANDBOX_TELEMETRY_MESSAGE) {
					const telemetryMessage = normalizeHtmlSandboxTelemetryMessage(event.data)
					if (!telemetryMessage || !isAllowedTelemetryOrigin) return
					const lifecycleReport = mapSandboxTelemetryToLifecycleReport(
						telemetryMessage.payload,
						event.origin,
					)

					if (lifecycleReport) {
						reportRenderLifecycleStage(lifecycleReport.stage, lifecycleReport.extra, {
							once: false,
						})
					}
					return
				}

				if (event.data && event.data.type === "iframeReady") {
					// iframe已准备好接收内容
					reportRenderLifecycleStage("iframe_ready", {
						origin: event.origin,
					})
					setIframeLoaded(true)
				} else if (event.data && event.data.type === "pageLoaded") {
					// Shell load 后再次兜底置为 ready，避免早期 iframeReady 丢失。
					reportRenderLifecycleStage("page_loaded", {
						origin: event.origin,
						isExpectedSource,
					})
					setIframeLoaded(true)
				} else if (event.data && event.data.type === "contentLoaded") {
					// 内容已写入iframe，但可能还未完成渲染
					reportRenderLifecycleStage("content_loaded")
					// 如果处于编辑模式，重置 contentInjected 状态以触发脚本重新注入
					// 因为 setContent 会清除 iframe 中的所有脚本，需要重新注入编辑脚本
					if (isEditMode) {
						// 重置 contentInjected 状态，这会触发 useHTMLEditorV2 中的 effect 重新运行
						// 从而重新注入编辑脚本并恢复编辑模式
						setContentInjected(false)
						// 使用 setTimeout 确保状态更新后立即重新设置为 true，触发 effect
						setTimeout(() => {
							setContentInjected(true)
						}, 0)
					}
				} else if (event.data && event.data.type === "domReady") {
					// DOM树构建完成
					reportRenderLifecycleStage("dom_ready")
				} else if (event.data && event.data.type === "renderComplete") {
					// iframe渲染真正完成，现在可以安全地计算缩放比例
					reportRenderLifecycleStage("render_complete")
					notifyRenderReady()
				} else if (event.data && event.data.type === "pageFullyLoaded") {
					// 页面完全加载完成（包括图片、样式表等）
					reportRenderLifecycleStage("page_fully_loaded")
					notifyRenderReady()
					// When sandbox doesn't support contentMetrics, unblock scaling after timeout
					if (shouldWaitForSettledContentMetrics) {
						if (contentMetricsFallbackTimerRef.current) {
							clearTimeout(contentMetricsFallbackTimerRef.current)
						}
						contentMetricsFallbackTimerRef.current = setTimeout(() => {
							setScalingContentMetrics((prev) => {
								if (prev?.phase === "settled") return prev
								const w = iframeRef.current?.offsetWidth ?? 0
								const h = iframeRef.current?.offsetHeight ?? 0
								if (w <= 0 || h <= 0) return prev
								return { contentWidth: w, contentHeight: h, phase: "settled" }
							})
						}, 1000)
					}
				} else if (event.data && event.data.type === "contentMetrics") {
					const contentWidth = Number(event.data?.contentWidth)
					const contentHeight = Number(event.data?.contentHeight)

					if (
						Number.isFinite(contentWidth) &&
						contentWidth > 0 &&
						Number.isFinite(contentHeight) &&
						contentHeight > 0
					) {
						const metricsPhase = event.data?.phase === "settled" ? "settled" : "initial"
						reportRenderLifecycleStage(
							metricsPhase === "settled"
								? "content_metrics_settled"
								: "content_metrics_initial",
							{
								contentWidth,
								contentHeight,
								hasHorizontalOverflow: event.data?.hasHorizontalOverflow === true,
								hasVerticalOverflow: event.data?.hasVerticalOverflow === true,
								verticalScrollbarWidth: Math.max(
									0,
									Number(event.data?.verticalScrollbarWidth) || 0,
								),
							},
						)
						// Real settled metrics arrived — cancel fallback timer
						if (metricsPhase === "settled" && contentMetricsFallbackTimerRef.current) {
							clearTimeout(contentMetricsFallbackTimerRef.current)
							contentMetricsFallbackTimerRef.current = null
						}
						const metricsPayload = {
							contentWidth,
							contentHeight,
							phase: metricsPhase,
							hasHorizontalOverflow: event.data?.hasHorizontalOverflow === true,
							hasVerticalOverflow: event.data?.hasVerticalOverflow === true,
							verticalScrollbarWidth: Math.max(
								0,
								Number(event.data?.verticalScrollbarWidth) || 0,
							),
						}

						if (!scaleContentDimensions) {
							setScalingContentMetrics((prev) => {
								if (prev?.phase === "settled" && metricsPhase !== "settled") {
									return prev
								}

								return {
									contentWidth,
									contentHeight,
									phase: metricsPhase,
								}
							})
						}
						onContentMetrics?.({
							contentWidth,
							contentHeight,
							phase: metricsPhase,
							hasHorizontalOverflow: metricsPayload.hasHorizontalOverflow,
							hasVerticalOverflow: metricsPayload.hasVerticalOverflow,
							verticalScrollbarWidth: metricsPayload.verticalScrollbarWidth,
						})
					}
				} else if (event.data && event.data.type === "linkClicked") {
					// 如果是回放模式，不处理链接点击
					if (isPlaybackMode) {
						logger.report(
							"回放模式忽略 iframe 链接点击",
							buildMessageLogContext(event, messageType, {
								isExpectedSource,
								isAllowedType,
							}),
						)
						return
					}

					const href = typeof event.data?.href === "string" ? event.data.href : ""
					const autoEdit = event.data?.autoEdit === true

					try {
						openNewTab(fileId || "", href, autoEdit)
					} catch (error) {
						logger.error(
							"处理 iframe 链接点击失败",
							buildMessageLogContext(event, messageType, {
								isExpectedSource,
								isAllowedType,
								href,
								autoEdit,
								errorMessage:
									error instanceof Error ? error.message : String(error),
								errorStack: error instanceof Error ? error.stack : undefined,
							}),
							error,
						)
					}
				} else if (event.data && event.data.type === "DOWNLOAD_IMAGE") {
					console.log("下载图片", event.data)
					if (!event.data?.data?.dataUrl) {
						return
					}
					const link = document.createElement("a")
					link.download = event.data?.data?.fileName || ""
					link.href = event.data?.data?.dataUrl || ""

					// 触发下载
					document.body.appendChild(link)
					link.click()
					document.body.removeChild(link)
					console.log("图片下载成功")
				} else if (event.data && event.data.type === "REQUEST_IMAGE_UPLOAD") {
					if (!isExpectedSource) {
						logger.report(
							"忽略跨实例图片上传消息：source 不匹配",
							buildMessageLogContext(event, messageType, {
								isExpectedSource,
								isAllowedType,
							}),
						)
						return
					}
					console.log("iframe请求图片上传", event.data)
					handleImageUploadRequest(event.data.data)
				} else if (event.data && event.data.type === "AI_OPTIMIZATION_ACTION") {
					console.log("AI优化操作", event.data)
					addContentToChat({
						attachmentList,
						file_id: fileId,
						t,
						payload: event.data,
					})
				} else if (event.data.type === "DOM_CLICK") {
					// console.log("DOM点击", event.data)
					// 关闭所有下拉菜单
					pubsub.publish(PubSubEvents.Close_All_Dropdowns)
					containerRef?.current?.click?.()
				} else if (event.data && event.data.type === "saveContent") {
					// Note: Legacy save mechanism (V1 editing script)
					// V2 editing mechanism uses MessageBridge and editorRef.current.save() instead
					// This is kept for backward compatibility if V1 script is still used somewhere
					console.log("收到旧版保存消息 (V1)", event.data)
					if (saveEditContent && typeof saveEditContent === "function") {
						const newContent = filterInjectedTags(event.data.content, filePathMapping)
						saveEditContent(newContent, String(fileId))
					}
				} else if (event.data && event.data.type === MEDIA_MESSAGE_TYPES.SPEAKER_EDITED) {
					// 处理媒体说话人编辑事件
					handleMediaSpeakerEdit(event.data.detail)
				} else if (
					event.data &&
					event.data.type === MEDIA_MESSAGE_TYPES.IMAGE_URL_REQUEST
				) {
					// 处理marked.js图片路径解析请求
					await handleMediaImageUrlRequest(event, attachmentList || [], fileId || "")
				} else if (event.data?.type?.startsWith("MAGIC_FS_")) {
					// 处理 window.Magic.fs.* 请求
					await handleFSMessage(event.data.type, event.data)
				} else if (event.data?.type?.startsWith("MAGIC_LLM_")) {
					// 处理 window.Magic.llm.* 请求
					await handleLLMMessage(event.data.type, event.data)
				} else if (event.data?.type?.startsWith("MAGIC_DB_")) {
					// 处理 window.Magic.db.* 请求
					await handleDatabaseMessage(event.data.type, event.data)
				} else if (event.data && event.data.type === "MAGIC_CONTEXT_GET_REQUEST") {
					// 处理 window.Magic.getContext() 请求
					await handleContextMessage(event.data)
				} else if (
					event.data?.type?.startsWith("MAGIC_GET_AGENTS_") ||
					event.data?.type?.startsWith("MAGIC_CREATE_TOPIC_AND_SEND_") ||
					event.data?.type?.startsWith("MAGIC_SEND_MESSAGE_")
				) {
					// 处理 window.Magic.getAgents / createTopicAndSend / sendMessage 请求
					await handleAgentMessage(event.data.type, event.data)
				} else if (event.data?.type?.startsWith("MAGIC_GET_USER_INFO_")) {
					// 处理 window.Magic.user.getInfo() 请求
					await handleUserInfoMessage(event.data.type, event.data)
				} else if (event.data && event.data.type === "MAGIC_RELOAD_REQUEST") {
					// 处理 window.Magic.reload() 请求
					reloadIframeContent()
				} else if (event.data && event.data.type === "MAGIC_SET_INPUT_MESSAGE") {
					// 处理 window.Magic.setInputMessage() 请求
					const message = event.data.message
					if (typeof message === "string") {
						pubsub.publish(PubSubEvents.Set_Input_Message, message)
					}
				} else if (event.data && event.data.type === "MAGIC_UPLOAD_FILES_REQUEST") {
					// 处理 window.Magic.uploadFiles() 请求
					handleMagicUploadFiles(event.data)
				} else if (event.data && event.data.type === "MAGIC_ADD_FILES_TO_MESSAGE_REQUEST") {
					// 处理 window.Magic.addFilesToMessage() 请求
					handleMagicAddFilesToMessage(event.data)
				} else if (event.data && event.data.type === "MAGIC_DOWNLOAD_FILES_REQUEST") {
					// 处理 window.Magic.downloadFiles() 请求
					handleMagicDownloadFiles(event.data)
				} else if (event.data && event.data.type === "MAGIC_I18N_LANG_SUBSCRIBE") {
					// 处理 window.Magic.i18n.subscribe() 请求
					const payload = event.data as MagicI18nLangSubscribeRequest
					hasIframeI18nSubscriberRef.current = true
					notifyIframeI18nLang("subscribe_ack", payload.requestId)
				}

				if (event.data && event.data.originalKey === "Escape") {
					pubsub.publish(PubSubEvents.Exit_Fullscreen)
				}
			} catch (error) {
				logger.error(
					"处理 iframe message 失败",
					buildMessageLogContext(event, messageType, {
						isExpectedSource,
						isAllowedType,
						errorMessage: error instanceof Error ? error.message : String(error),
						errorStack: error instanceof Error ? error.stack : undefined,
					}),
					error,
				)
			}
		})
		// 处理 iframe 内容更新：同源 /husky.html 和跨域渲染站都必须等 shell ready。
		const injectIframeContent = useMemoizedFn(
			(reason: "content_changed" | "visible_resume") => {
				hasRenderedOnceRef.current = false
				try {
					refreshIframeContent()
					setContentInjected(true)
					reportRenderLifecycleStage(
						"content_injected",
						{
							reason,
						},
						{ once: reason !== "visible_resume" },
					)
				} catch (error) {
					reportRenderLifecycleStage("content_inject_failed", {
						reason: "refresh_iframe_content_failed",
						errorMessage: error instanceof Error ? error.message : String(error),
						errorStack: error instanceof Error ? error.stack : undefined,
					})
					console.error("处理iframe内容时出错:", error)
					setContentInjected(false)
				}
			},
		)

		useDeepCompareEffect(() => {
			if (sandboxType !== "iframe" || !iframeRef.current || !content) return
			if (!iframeLoaded) return
			if (!virtualStorageContext) return

			injectIframeContent("content_changed")
		}, [
			content,
			iframeLoaded,
			htmlSandboxShellUrl,
			injectIframeContent,
			sandboxType,
			virtualStorageContext,
		])

		const previousIsVisibleRef = useRef(Boolean(isVisible))
		useEffect(() => {
			const wasVisible = previousIsVisibleRef.current
			const nextVisible = Boolean(isVisible)
			previousIsVisibleRef.current = nextVisible

			if (!isPptRender) return
			if (!nextVisible || wasVisible) return
			if (hasNotifiedRenderReadyRef.current) return
			if (sandboxType !== "iframe" || !iframeRef.current || !content) return
			if (!iframeLoaded) return
			if (!virtualStorageContext) return

			injectIframeContent("visible_resume")
		}, [
			content,
			iframeLoaded,
			injectIframeContent,
			isPptRender,
			isVisible,
			sandboxType,
			virtualStorageContext,
		])

		useEffect(() => {
			if (!isPptRender) return
			if (sandboxType !== "iframe") return
			if (!iframeRef.current?.contentWindow) return
			if (!contentInjected) return
			// Pause animations when slide is not visible
			iframeRef.current.contentWindow.postMessage(
				{
					type: "setAnimationState",
					paused: !isVisible,
				},
				iframeTargetOrigin,
			)
		}, [contentInjected, iframeTargetOrigin, isPptRender, isVisible, sandboxType])

		useEffect(() => {
			if (sandboxType !== "iframe") return

			const handleLanguageChanged = () => {
				if (!hasIframeI18nSubscriberRef.current) return
				notifyIframeI18nLang("language_changed")
			}

			i18n.on("languageChanged", handleLanguageChanged)
			return () => {
				i18n.off("languageChanged", handleLanguageChanged)
			}
		}, [i18n, notifyIframeI18nLang, sandboxType])

		useLayoutEffect(() => {
			window.addEventListener("message", handleMessage)
			return () => {
				window.removeEventListener("message", handleMessage)
			}
			//eslint-disable-next-line react-hooks/exhaustive-deps
		}, [])

		// 提供手动保存方法
		const triggerSave = useMemoizedFn(async () => {
			if (isMediaScenario) {
				// Media场景直接保存说话人配置
				saveMediaConfiguration()
			} else if (isEditMode && editorRef.current) {
				// 使用新的编辑机制 V2 保存
				try {
					const saveResult = await editorRef.current.save()
					console.log("[IsolatedHTMLRenderer] 保存结果:", {
						success: saveResult.success,
						fileId: saveResult.fileId,
						contentLength: saveResult.cleanContent.length,
					})

					if (!saveResult.success) {
						console.error("[IsolatedHTMLRenderer] 保存失败")
					}

					// 返回保存结果，方便调用方获取
					return saveResult
				} catch (error) {
					console.error("保存内容时出错:", error)
					throw error
				}
			}
		})

		// 将保存方法暴露给父组件
		useEffect(() => {
			if (onSaveReady && iframeLoaded) {
				onSaveReady(triggerSave)
			}
		}, [iframeLoaded, onSaveReady, isMediaScenario, triggerSave])

		return (
			<div
				ref={scrollContainerRef}
				className={cx(
					styles.rendererContainer,
					hideVerticalScroll && styles.hiddenScrollbar,
					"relative flex min-h-0 w-full flex-1",
					className,
				)}
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					overflow: hideVerticalScroll ? "hidden" : undefined,
				}}
			>
				{/* 工具栏 - 固定在顶部，不滚动 */}
				{sandboxType === "iframe" && isEditMode && (
					<>
						<StylePanel
							editorRef={editorRef as React.RefObject<HTMLEditorV2Ref>}
							disabled={isSaving}
							toolbarEndRef={toolbarEndRef}
							className={cn(
								"w-full flex-shrink-0",
								isPptRender &&
									`absolute left-1/2 ${TAILWIND_Z_INDEX_CLASSES.TOOLBAR.STYLE_PANEL} top-[10px] w-[98%] -translate-x-1/2 rounded-lg border border-border bg-card/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60`,
								toolbarClassName,
							)}
						/>
					</>
				)}

				{/* 可滚动内容容器 */}
				<div
					ref={containerRef}
					className={cx(
						hideVerticalScroll && styles.hiddenScrollbar,
						isPptRender && isManualZoom && styles.pptManualZoomScrollbar,
						cn(
							"relative flex min-h-0 w-full flex-1",
							devConsole.enabled && devConsoleLayout === "right"
								? "flex-row"
								: "flex-col",
							shouldApplyScaling && isFullscreen && "bg-black",
							shouldApplyScaling && !isFullscreen && "bg-[#eee] dark:bg-[#1c1c1c]",
						),
					)}
					style={{
						overflow: hideVerticalScroll
							? "hidden"
							: shouldApplyScaling
								? isManualZoom
									? "auto"
									: "hidden"
								: "auto",
						minHeight: 0,
					}}
				>
					{/* 内容包装器，使用 flex 居中 iframe */}
					<div
						ref={contentWrapperRef}
						className="relative min-h-0 min-w-0 flex-1"
						style={getContentWrapperStyle()}
					>
						{sandboxType === "iframe" ? (
							<>
								<iframe
									ref={iframeRef}
									className={cn(
										styles.iframe,
										"h-full w-full flex-shrink-0 border-none",
										iframeClassName,
									)}
									title="Isolated HTML Content"
									src={htmlSandboxShellUrl}
									onLoad={handleIframeElementLoad}
									onError={handleIframeElementError}
									sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups allow-downloads"
									allow="fullscreen"
									allowFullScreen
									translate="no"
									style={getIframeStyle(hasRenderedOnceRef.current)}
									data-testid="isolated-html-content-iframe"
								/>
								{/* 选择覆盖层 - 在父窗口中渲染元素高亮 */}
								{isEditMode && (
									<SelectionOverlay
										containerRef={contentWrapperRef}
										scrollContainerRef={scrollContainerRef}
										iframeRef={iframeRef}
										editorRef={editorRef}
										scaleRatio={scaleRatio}
										isPptRender={shouldApplyScaling}
										disabled={isSaving}
										onSelectedElementChange={setSelectedElementRect}
									/>
								)}
								{/* 拖拽放置覆盖层 - 拖拽图片时显示 */}
								{isEditMode && isGlobalDragActive && (
									<DropOverlay
										visible={isDragOver}
										onDragEnter={dragOverHandlers.onDragEnter}
										onDragOver={dragOverHandlers.onDragOver}
										onDragLeave={dragOverHandlers.onDragLeave}
										onDrop={dragOverHandlers.onDrop}
									/>
								)}
								{/* 元素检查覆盖层 - 独立于编辑模式 */}
								<ElementInspectorOverlay
									active={elementInspector.active}
									iframeRef={iframeRef}
									hoveredElement={elementInspector.hoveredElement}
									selectedElement={elementInspector.selectedElement}
									onClearSelection={elementInspector.clearSelection}
									onInsertToConsole={(code) => {
										devConsole.executeCode(code)
									}}
									onSendToAgent={(content) => {
										pubsub.publish(PubSubEvents.Set_Input_Message, content)
									}}
									hideInfoCard={inspectorHideInfoCard}
									scaleRatio={scaleRatio}
								/>
							</>
						) : (
							<div className={styles.shadowHost} translate="no" />
						)}
					</div>
					{/* DevTools 调试台 - 根据用户选择停靠在 iframe 底部或右侧 */}
					{sandboxType === "iframe" && devConsole.enabled && (
						<DevConsolePanel
							consoleEntries={devConsole.consoleEntries}
							networkEntries={enrichedNetworkEntries}
							apiCallEntries={devConsole.apiCallEntries}
							messageEntries={devConsole.messageEntries}
							storageSnapshot={devConsole.storageSnapshot}
							storageLoading={devConsole.storageLoading}
							sourceCode={content}
							rawSourceCode={rawSourceCode}
							processedSourceCode={processedSourceCode}
							dependencyEntries={allDependencyEntries}
							activeTab={devConsole.activeTab}
							onTabChange={devConsole.setActiveTab}
							onClearConsole={devConsole.clearConsole}
							onClearNetwork={devConsole.clearNetwork}
							onClearApiCalls={devConsole.clearApiCalls}
							onClearMessages={devConsole.clearMessages}
							onSendErrorToAgent={devConsole.sendErrorToAgent}
							onExecuteCode={devConsole.executeCode}
							onRequestCompletions={devConsole.requestCompletions}
							onRequestStorageSnapshot={devConsole.requestStorageSnapshot}
							onRefreshHtml={reloadIframeContent}
							consoleErrorCount={devConsole.consoleErrorCount}
							networkErrorCount={devConsole.networkErrorCount}
							apiCallErrorCount={devConsole.apiCallErrorCount}
							layout={devConsoleLayout}
							onLayoutChange={handleDevConsoleLayoutChange}
							onClose={() => {
								setDevConsoleEnabled(false)
								onDevConsoleClose?.()
							}}
							inspectorActive={elementInspector.active}
							onToggleInspector={elementInspector.toggle}
						/>
					)}
				</div>
			</div>
		)
	},
)

// 包装组件，提供 StylePanelStore 上下文
const IsolatedHTMLRendererComponent = forwardRef<
	IsolatedHTMLRendererRef,
	IsolatedHTMLRendererProps
>((props, ref) => {
	return (
		<StylePanelStoreProvider>
			<IsolatedHTMLRendererInner ref={ref} {...props} />
		</StylePanelStoreProvider>
	)
})

export default IsolatedHTMLRendererComponent
