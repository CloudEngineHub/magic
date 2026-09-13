import { act, render, screen } from "@testing-library/react"
import { createRef, type ReactElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { HostConversationProvider } from "@/pages/superMagic/contexts/HostConversationContext"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import IsolatedHTMLRenderer, { type IsolatedHTMLRendererRef } from "../IsolatedHTMLRenderer"

const hookState = vi.hoisted(() => ({
	editorContentInjectedValues: [] as boolean[],
	isManualZoom: false,
	shouldApplyScaling: false,
}))

const envMock = vi.hoisted(() => vi.fn(() => ""))

const virtualStorageMocks = vi.hoisted(() => ({
	buildNamespace: vi.fn(() => "magic-html-storage:test"),
	createContext: vi.fn(async () => ({
		protocol: "magic-html-virtual-storage",
		renderId: "render-1",
		token: "token-1",
		namespace: "magic-html-storage:test",
		targetOrigin: "*",
		snapshot: {
			localStorage: {},
			sessionStorage: {},
			cookies: {},
			indexedDB: {},
		},
	})),
	getFullContent: vi.fn((content: string) => `<!doctype html>${content}`),
}))

const iframeMessageMocks = vi.hoisted(() => ({
	handleAgentMessage: vi.fn(async () => true),
	handleMagicUploadFiles: vi.fn(),
	handleMagicAddFilesToMessage: vi.fn(),
	handleMagicDownloadFiles: vi.fn(),
}))

const agentActionMocks = vi.hoisted(() => ({
	useIframeAgentActions: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: {
			language: "zh-CN",
			resolvedLanguage: "zh-CN",
			on: vi.fn(),
			off: vi.fn(),
		},
	}),
}))

vi.mock("@/utils/env", () => ({
	env: envMock,
	isDev: false,
	isCommercial: vi.fn(() => true),
	isPrivateDeployment: vi.fn(() => false),
	isInternationalEnv: vi.fn(() => false),
	isProductionEnv: vi.fn(() => false),
	isTestEnv: vi.fn(() => true),
	getPrivateDeploymentConfig: vi.fn(() => null),
}))

vi.mock("@/utils/log", () => ({
	logger: {
		createLogger: () => ({
			report: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		}),
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {},
	FileApi: {},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			authorization: "",
			organizationCode: "",
			userInfo: null,
		},
	},
}))

vi.mock("@/pages/chatNew/components/MessageEditor/components/InputFiles/utils", () => ({
	genFileData: (file: File) => ({ name: file.name, file, status: "init" }),
}))

vi.mock("@/pages/superMagic/utils/projectAttachments/attachmentMutationWaiter", () => ({
	waitForProjectAttachmentChange: vi.fn(async () => ({
		projectId: "project-1",
		status: "applied",
		matchMode: "exact-file",
	})),
}))

vi.mock("@/models/config/stores/theme.store", () => ({
	themeStore: {
		theme: "light",
		mode: "light",
		setTheme: vi.fn(),
		setMode: vi.fn(),
		syncDocumentDarkClass: vi.fn(),
	},
}))

vi.mock("antd-style", () => ({
	createStyles: () => () => ({
		styles: {
			rendererContainer: "renderer-container",
			hiddenScrollbar: "hidden-scrollbar",
			pptManualZoomScrollbar: "ppt-manual-zoom-scrollbar",
			iframe: "iframe",
			shadowHost: "shadow-host",
			loadingContainer: "loading-container",
		},
		cx: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" "),
	}),
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: {
		confirm: vi.fn(() => ({ destroy: vi.fn() })),
		info: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		info: vi.fn(),
		warning: vi.fn(),
		error: vi.fn(),
		loading: vi.fn(),
		destroy: vi.fn(),
	},
}))

vi.mock("@/hooks/useUploadFiles", () => ({
	useUpload: () => ({
		upload: vi.fn(async () => ({ fullfilled: [], rejected: [] })),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/services/UploadTokenService", () => ({
	superMagicUploadTokenService: {
		getUploadTokenUrl: "",
		getUploadToken: vi.fn(),
		saveFileToProject: vi.fn(),
	},
}))

vi.mock("../iframe-api/iframeApi", () => ({
	saveIframeFileContent: vi.fn(),
	createIframeFile: vi.fn(),
	deleteIframeFile: vi.fn(),
	deleteIframeFiles: vi.fn(),
	moveIframeFile: vi.fn(),
	renameIframeFile: vi.fn(),
	getIframeFileInfo: vi.fn(),
}))

vi.mock("../iframe-bridge/contexts/StylePanelContext", () => ({
	StylePanelStoreProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("../hooks/useHTMLEditorV2", () => ({
	useHTMLEditorV2: vi.fn(({ contentInjected }: { contentInjected: boolean }) => {
		hookState.editorContentInjectedValues.push(contentInjected)
	}),
}))

vi.mock("../hooks/useZoomControls", () => ({
	useZoomControls: () => ({
		scaleRatio: 1,
		shouldApplyScaling: hookState.shouldApplyScaling,
		isScaleReady: true,
		isManualZoom: hookState.isManualZoom,
		handleScaleChange: vi.fn(),
		handleResetZoom: vi.fn(),
		getContentWrapperStyle: () => ({}),
		getIframeStyle: () => ({}),
	}),
}))

vi.mock("../media/useMediaScenario", () => ({
	useMediaScenario: () => ({
		isMediaScenario: false,
		injectMediaScript: (content: string) => content,
		handleMediaSpeakerEdit: vi.fn(),
		saveMediaConfiguration: vi.fn(),
	}),
}))

vi.mock("../media/utils", () => ({
	MEDIA_MESSAGE_TYPES: {
		SPEAKER_EDITED: "MEDIA_SPEAKER_EDITED",
		IMAGE_URL_REQUEST: "MEDIA_IMAGE_URL_REQUEST",
	},
	handleMediaImageUrlRequest: vi.fn(),
}))

vi.mock("../hooks/useImageDrop", () => ({
	useImageDrop: () => ({
		isDragOver: false,
		isGlobalDragActive: false,
		dragOverHandlers: {
			onDragEnter: vi.fn(),
			onDragOver: vi.fn(),
			onDragLeave: vi.fn(),
			onDrop: vi.fn(),
		},
	}),
}))

vi.mock("../hooks/useDevConsole", () => ({
	useDevConsole: () => ({
		enabled: false,
		toggle: vi.fn(),
		consoleEntries: [],
		networkEntries: [],
		apiCallEntries: [],
		messageEntries: [],
		storageSnapshot: null,
		storageLoading: false,
		activeTab: "console",
		setActiveTab: vi.fn(),
		clearConsole: vi.fn(),
		clearNetwork: vi.fn(),
		clearApiCalls: vi.fn(),
		clearMessages: vi.fn(),
		clearAll: vi.fn(),
		sendErrorToAgent: vi.fn(),
		executeCode: vi.fn(),
		requestCompletions: vi.fn(async () => []),
		requestStorageSnapshot: vi.fn(),
		consoleErrorCount: 0,
		networkErrorCount: 0,
		apiCallErrorCount: 0,
	}),
}))

vi.mock("@/components/business/ElementInspector", () => ({
	useElementInspector: () => ({
		active: false,
		hoveredElement: null,
		selectedElement: null,
		clearSelection: vi.fn(),
		stop: vi.fn(),
		start: vi.fn(),
		toggle: vi.fn(),
	}),
	ElementInspectorOverlay: () => null,
	buildAgentPromptContent: vi.fn(() => ""),
}))

vi.mock("../hooks/useInspectorToolbarMode", () => ({
	useInspectorToolbarMode: () => ({
		hideInfoCard: false,
		isAppendPicking: false,
		startInToolbarMode: vi.fn(),
		startInAppendMode: vi.fn(),
		inspectorModeRef: { current: "devConsole" },
	}),
}))

vi.mock("../hooks/useFetchInterceptionCache", () => ({
	useFetchInterceptionCache: () => ({
		handleFetchIntercepted: vi.fn(),
		dynamicDependencyEntries: [],
	}),
}))

vi.mock("../utils/virtual-storage", () => ({
	buildHtmlVirtualStorageNamespace: virtualStorageMocks.buildNamespace,
	createVirtualStorageContext: virtualStorageMocks.createContext,
	virtualStorageRegistry: {
		register: vi.fn(),
		unregister: vi.fn(),
	},
}))

vi.mock("../utils/full-content", () => ({
	decodeHTMLEntities: (content: string) => content,
	getFullContent: virtualStorageMocks.getFullContent,
}))

vi.mock("../hooks/useCurrentHtmlFileInfo", () => ({
	useCurrentHtmlFileInfo: () => ({
		relativeFilePath: "index.html",
		fileName: "index.html",
	}),
}))

vi.mock("../hooks/useHtmlAppPermissions", () => ({
	useHtmlAppPermissions: () => ({
		htmlAppConfig: null,
		htmlAppConfigState: { loading: false, error: null },
		htmlAppInstanceKey: "test-app",
		authorizeHtmlPermission: vi.fn(async () => true),
	}),
}))

vi.mock("../iframe-api/hooks/useIframeFS", () => ({
	useIframeFS: () => ({
		handleFSMessage: vi.fn(async () => false),
	}),
}))

vi.mock("../iframe-api/hooks/useIframeLLM", () => ({
	useIframeLLM: () => ({
		handleLLMMessage: vi.fn(async () => false),
	}),
}))

vi.mock("../iframe-api/hooks/useIframeAgent", () => ({
	useIframeAgent: () => ({
		handleAgentMessage: iframeMessageMocks.handleAgentMessage,
	}),
}))

vi.mock("../iframe-api/hooks/useIframeUserInfo", () => ({
	useIframeUserInfo: () => ({
		handleUserInfoMessage: vi.fn(async () => false),
	}),
}))

vi.mock("../hooks/useIframeAgentActions", () => ({
	useIframeAgentActions: (...args: [string | undefined, unknown?]) => {
		agentActionMocks.useIframeAgentActions(...args)
		return {
			getAgentList: vi.fn(),
			createTopicAndSend: vi.fn(),
			sendMessage: vi.fn(),
		}
	},
}))

vi.mock("../iframe-api/hooks/useMagicFiles", () => ({
	useMagicFiles: () => ({
		handleMagicUploadFiles: iframeMessageMocks.handleMagicUploadFiles,
		handleMagicAddFilesToMessage: iframeMessageMocks.handleMagicAddFilesToMessage,
		handleMagicDownloadFiles: iframeMessageMocks.handleMagicDownloadFiles,
	}),
}))

vi.mock("../components/SelectionOverlay", () => ({
	SelectionOverlay: () => null,
}))

vi.mock("../components/DropOverlay", () => ({
	DropOverlay: () => null,
}))

vi.mock("../components/StylePanel", () => ({
	StylePanel: () => null,
}))

vi.mock("../components/ElementContextPanel", () => ({
	ElementContextPanel: () => <div data-testid="html-editor-context-panel" />,
}))

vi.mock("../components/StylePanel/controls", () => ({
	ZoomControls: () => null,
}))

vi.mock("../components/DevConsole", () => ({
	DevConsolePanel: () => null,
}))

const defaultHostProject = { id: "project-1" }

const defaultProps = {
	content: "<html><body>history</body></html>",
	filePathMapping: new Map<string, string>(),
	openNewTab: vi.fn(),
	fileId: "history-file",
	attachmentList: [],
	isVisible: true,
}

function renderIsolated(
	ui: ReactElement,
	host: {
		selectedProject?: { id: string; current_topic_id?: string } | null
		topicStore?: TopicStore
	} | null = {},
) {
	if (host === null) {
		return render(ui)
	}

	function Wrapper({ children }: { children: ReactNode }) {
		return (
			<HostConversationProvider
				selectedProject={
					"selectedProject" in host ? host.selectedProject : defaultHostProject
				}
				topicStore={host.topicStore}
			>
				{children}
			</HostConversationProvider>
		)
	}

	return render(ui, { wrapper: Wrapper })
}

function getSetContentCalls(postMessage: MockInstance<typeof window.postMessage>) {
	return postMessage.mock.calls.filter(([message]) => message?.type === "setContent")
}

function dispatchIframeMessage(
	iframe: HTMLIFrameElement,
	type: string,
	origin = window.location.origin,
	extraData: Record<string, unknown> = {},
	source: Window | null = iframe.contentWindow,
) {
	act(() => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type, ...extraData },
				origin,
				source,
			}),
		)
	})
}

async function flushReactEffects() {
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
	})
}

describe("IsolatedHTMLRenderer iframe injection", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
		envMock.mockReturnValue("")
		hookState.editorContentInjectedValues = []
		hookState.isManualZoom = false
		hookState.shouldApplyScaling = false
		agentActionMocks.useIframeAgentActions.mockClear()
	})

	afterEach(() => {
		act(() => {
			vi.runOnlyPendingTimers()
		})
		vi.useRealTimers()
		vi.restoreAllMocks()
		delete (window as Window & { project_id?: string }).project_id
	})

	it("enables presentation and low-risk media capabilities for HTML previews", async () => {
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} />)
		await flushReactEffects()

		const iframe = screen.getByTestId("isolated-html-content-iframe")
		expect(screen.getByTestId("html-editor-canvas")).toBeInTheDocument()
		const sandboxTokens = iframe.getAttribute("sandbox")?.split(/\s+/) ?? []
		const allowedFeatures = iframe
			.getAttribute("allow")
			?.split(";")
			.map((feature) => feature.trim())
			.filter(Boolean)

		expect(sandboxTokens).toEqual(
			expect.arrayContaining(["allow-orientation-lock", "allow-presentation"]),
		)
		expect(allowedFeatures).toEqual(
			expect.arrayContaining([
				"fullscreen",
				"autoplay",
				"picture-in-picture",
				"encrypted-media",
				"web-share",
				"clipboard-write",
			]),
		)
	})

	it("does not expose fixed editor test ids from an inactive cached preview", async () => {
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} isVisible={false} isEditMode />)
		await flushReactEffects()

		expect(screen.queryByTestId("html-editor-canvas")).not.toBeInTheDocument()
		expect(screen.queryByTestId("isolated-html-content-iframe")).not.toBeInTheDocument()
	})

	it("unmounts the portaled context toolbar when the cached tab is inactive", async () => {
		const { rerender } = renderIsolated(
			<IsolatedHTMLRenderer {...defaultProps} isEditMode isVisible isTabActive />,
		)
		await flushReactEffects()

		expect(screen.getByTestId("html-editor-context-panel")).toBeInTheDocument()

		rerender(
			<IsolatedHTMLRenderer {...defaultProps} isEditMode isVisible isTabActive={false} />,
		)
		await flushReactEffects()

		expect(screen.queryByTestId("html-editor-context-panel")).not.toBeInTheDocument()
	})

	it("shows the scrollbar style only while a PPT is manually zoomed", async () => {
		hookState.isManualZoom = true
		hookState.shouldApplyScaling = true

		const { container, rerender } = renderIsolated(
			<IsolatedHTMLRenderer {...defaultProps} isPptRender manualScale={1.2} />,
		)

		const getScrollableContent = () => container.querySelector(".ppt-manual-zoom-scrollbar")

		await flushReactEffects()
		expect(getScrollableContent()).toBeInTheDocument()

		rerender(<IsolatedHTMLRenderer {...defaultProps} manualScale={1.2} />)

		await flushReactEffects()
		expect(getScrollableContent()).not.toBeInTheDocument()
	})

	it("uses the MicroApp entry marker for storage across html file switches", async () => {
		renderIsolated(
			<IsolatedHTMLRenderer
				{...defaultProps}
				fileId="student-file"
				virtualStorageMarkerId="index-file"
			/>,
		)

		await flushReactEffects()

		expect(virtualStorageMocks.buildNamespace).toHaveBeenCalledWith({
			projectId: "project-1",
			fileId: "index-file",
		})

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		vi.spyOn(iframe.contentWindow as Window, "postMessage").mockImplementation(vi.fn())
		dispatchIframeMessage(iframe, "iframeReady")
		await flushReactEffects()

		expect(virtualStorageMocks.getFullContent).toHaveBeenCalledWith(
			defaultProps.content,
			"index-file",
			expect.any(Object),
		)
	})

	it("does not rebuild virtual storage or re-inject content when the selected topic changes", async () => {
		const firstTopicStore = { selectedTopic: { id: "topic-a" } }
		const secondTopicStore = { selectedTopic: { id: "topic-b" } }

		const { rerender } = render(
			<HostConversationProvider
				selectedProject={{ id: "project-1", current_topic_id: "topic-a" }}
				topicStore={firstTopicStore as unknown as TopicStore}
			>
				<IsolatedHTMLRenderer {...defaultProps} />
			</HostConversationProvider>,
		)
		await flushReactEffects()

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const postMessage = vi
			.spyOn(iframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())
		dispatchIframeMessage(iframe, "iframeReady")
		await flushReactEffects()

		expect(getSetContentCalls(postMessage)).toHaveLength(1)
		const namespaceCallsBefore = virtualStorageMocks.buildNamespace.mock.calls.length
		const contextCallsBefore = virtualStorageMocks.createContext.mock.calls.length

		// 模拟微应用编辑页「新建话题」：仅当前话题变化，入口文件与项目不变。
		rerender(
			<HostConversationProvider
				selectedProject={{ id: "project-1", current_topic_id: "topic-b" }}
				topicStore={secondTopicStore as unknown as TopicStore}
			>
				<IsolatedHTMLRenderer {...defaultProps} />
			</HostConversationProvider>,
		)
		await flushReactEffects()
		await flushReactEffects()

		expect(virtualStorageMocks.buildNamespace.mock.calls).toHaveLength(namespaceCallsBefore)
		expect(virtualStorageMocks.createContext.mock.calls).toHaveLength(contextCallsBefore)
		// 不该因话题切换而再次向 iframe 注入内容。
		expect(getSetContentCalls(postMessage)).toHaveLength(1)
	})

	it("passes the explicit projectId to Agent actions", async () => {
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} projectId="project-from-preview" />)
		await flushReactEffects()

		expect(agentActionMocks.useIframeAgentActions).toHaveBeenCalledWith(
			"project-from-preview",
			undefined,
			defaultHostProject,
			{ microAppId: undefined, microAppName: undefined },
			undefined,
		)
	})

	it("does not read window.project_id when host props omit projectId", async () => {
		;(window as Window & { project_id?: string }).project_id = "share-window-project"

		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} projectId={undefined} />, {
			selectedProject: undefined,
		})
		await flushReactEffects()

		expect(agentActionMocks.useIframeAgentActions).toHaveBeenCalledWith(
			undefined,
			undefined,
			undefined,
			{ microAppId: undefined, microAppName: undefined },
			undefined,
		)
	})

	it("passes the scoped topic store to Agent actions", async () => {
		const scopedTopicStore = { selectedTopic: { id: "topic-from-micro-app" } }

		renderIsolated(
			<IsolatedHTMLRenderer {...defaultProps} projectId="project-from-preview" />,
			{
				topicStore: scopedTopicStore as unknown as TopicStore,
			},
		)
		await flushReactEffects()

		expect(agentActionMocks.useIframeAgentActions).toHaveBeenCalledWith(
			"project-from-preview",
			scopedTopicStore,
			defaultHostProject,
			{ microAppId: undefined, microAppName: undefined },
			undefined,
		)
	})

	it("does not inject content into a sibling iframe from another iframeReady message", async () => {
		renderIsolated(
			<>
				<IsolatedHTMLRenderer
					{...defaultProps}
					fileId="history-file-a"
					content="<html><body>A</body></html>"
				/>
				<IsolatedHTMLRenderer
					{...defaultProps}
					fileId="history-file-b"
					content="<html><body>B</body></html>"
				/>
			</>,
		)

		const [iframeA, iframeB] = screen.getAllByTestId(
			"isolated-html-content-iframe",
		) as HTMLIFrameElement[]
		const postMessageA = vi
			.spyOn(iframeA.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())
		const postMessageB = vi
			.spyOn(iframeB.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())

		dispatchIframeMessage(iframeA, "iframeReady")

		await flushReactEffects()
		await flushReactEffects()

		expect(getSetContentCalls(postMessageA)).toHaveLength(1)
		expect(getSetContentCalls(postMessageB)).toHaveLength(0)

		dispatchIframeMessage(iframeB, "iframeReady")

		await flushReactEffects()

		expect(getSetContentCalls(postMessageB)).toHaveLength(1)
	})

	it("does not send content twice for iframeReady and pageLoaded", async () => {
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} />)
		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const postMessage = vi
			.spyOn(iframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())

		dispatchIframeMessage(iframe, "iframeReady")
		dispatchIframeMessage(iframe, "pageLoaded")
		await flushReactEffects()

		expect(getSetContentCalls(postMessage)).toHaveLength(1)
	})

	it("reloads the original content when resetContent is called", async () => {
		const rendererRef = createRef<IsolatedHTMLRendererRef>()
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} ref={rendererRef} />)
		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const postMessage = vi
			.spyOn(iframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())

		dispatchIframeMessage(iframe, "iframeReady")
		await flushReactEffects()
		expect(getSetContentCalls(postMessage)).toHaveLength(1)

		await act(async () => {
			rendererRef.current?.resetContent()
			await Promise.resolve()
		})

		const setContentCalls = getSetContentCalls(postMessage)
		expect(setContentCalls).toHaveLength(2)
		expect(setContentCalls[1][0]).toMatchObject({
			content: setContentCalls[0][0].content,
		})
	})

	it("updates location query when the same HTML navigation changes", async () => {
		const firstNavigation = {
			filePath: "index.html",
			search: "?value=123",
			hash: "",
			anchor: "",
		}
		const secondNavigation = {
			...firstNavigation,
			search: "?value=456",
		}

		const { rerender } = renderIsolated(
			<IsolatedHTMLRenderer {...defaultProps} htmlNavigation={firstNavigation} />,
		)
		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const postMessage = vi
			.spyOn(iframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())

		dispatchIframeMessage(iframe, "iframeReady")
		await flushReactEffects()

		expect(getSetContentCalls(postMessage)).toHaveLength(1)
		expect(getSetContentCalls(postMessage)[0][0]).toMatchObject({
			locationSearch: "?value=123",
		})

		rerender(<IsolatedHTMLRenderer {...defaultProps} htmlNavigation={secondNavigation} />)
		const nextIframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		await flushReactEffects()

		expect(nextIframe).not.toBe(iframe)
		expect(nextIframe.src).toBe(iframe.src)
		expect(getSetContentCalls(postMessage)).toHaveLength(1)

		const nextPostMessage = vi
			.spyOn(nextIframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())
		dispatchIframeMessage(nextIframe, "iframeReady")
		await flushReactEffects()

		expect(getSetContentCalls(nextPostMessage)).toHaveLength(1)
		expect(getSetContentCalls(nextPostMessage)[0][0]).toMatchObject({
			locationSearch: "?value=456",
		})
	})

	it("recreates a cross-origin sandbox shell for query updates", async () => {
		const externalShellUrl = "https://husky.example/husky.html"
		envMock.mockReturnValue(externalShellUrl)

		const firstNavigation = {
			filePath: "index.html",
			search: "?value=123",
			hash: "",
			anchor: "",
		}
		const secondNavigation = { ...firstNavigation, search: "?value=456" }
		const { rerender } = renderIsolated(
			<IsolatedHTMLRenderer {...defaultProps} htmlNavigation={firstNavigation} />,
		)
		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const postMessage = vi
			.spyOn(iframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())

		dispatchIframeMessage(iframe, "iframeReady", "https://husky.example")
		await flushReactEffects()

		rerender(<IsolatedHTMLRenderer {...defaultProps} htmlNavigation={secondNavigation} />)
		const nextIframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		await flushReactEffects()

		expect(nextIframe).not.toBe(iframe)
		expect(nextIframe.src).toBe(externalShellUrl)
		expect(getSetContentCalls(postMessage)).toHaveLength(1)

		const nextPostMessage = vi
			.spyOn(nextIframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())
		dispatchIframeMessage(nextIframe, "iframeReady", "https://husky.example")
		await flushReactEffects()

		expect(getSetContentCalls(nextPostMessage)).toHaveLength(1)
		expect(getSetContentCalls(nextPostMessage)[0][0]).toMatchObject({
			locationSearch: "?value=456",
		})
	})

	it("does not open a tab when iframe navigation points at the preview shell", async () => {
		const openNewTab = vi.fn()
		const iframeProps = { ...defaultProps, openNewTab, fileId: "cover-file" }
		renderIsolated(<IsolatedHTMLRenderer {...iframeProps} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(iframe, "linkClicked", window.location.origin, {
			href: "/husky.html",
		})
		await flushReactEffects()

		expect(openNewTab).not.toHaveBeenCalled()
	})

	it("keeps the renderer file identity when a link message contains a forged fileId", async () => {
		const openNewTab = vi.fn()
		const iframeProps = { ...defaultProps, openNewTab, fileId: "current-file" }
		renderIsolated(<IsolatedHTMLRenderer {...iframeProps} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(iframe, "linkClicked", window.location.origin, {
			href: "/target.html",
			autoEdit: true,
			fileId: "forged-file",
		})
		await flushReactEffects()

		expect(openNewTab).toHaveBeenCalledWith("current-file", "/target.html", true)
	})

	it("accepts same-origin link messages from a nested iframe of the current preview", async () => {
		const openNewTab = vi.fn()
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} openNewTab={openNewTab} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const nestedSource = {} as Window
		vi.spyOn(iframe.contentWindow as Window, "frames", "get").mockReturnValue([
			nestedSource,
		] as unknown as Window[])

		dispatchIframeMessage(
			iframe,
			"linkClicked",
			window.location.origin,
			{ href: "/nested-target.html" },
			nestedSource,
		)
		await flushReactEffects()

		expect(openNewTab).toHaveBeenCalledWith("history-file", "/nested-target.html", false)
	})

	it("ignores same-origin link messages from an unrelated source", async () => {
		const openNewTab = vi.fn()
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} openNewTab={openNewTab} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(
			iframe,
			"linkClicked",
			window.location.origin,
			{ href: "/target.html" },
			window,
		)
		await flushReactEffects()

		expect(openNewTab).not.toHaveBeenCalled()
	})

	it("ignores link messages from an unexpected origin", async () => {
		const openNewTab = vi.fn()
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} openNewTab={openNewTab} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(iframe, "linkClicked", "https://untrusted.example", {
			href: "/target.html",
		})
		await flushReactEffects()

		expect(openNewTab).not.toHaveBeenCalled()
	})

	it("ignores input messages from an unexpected source", async () => {
		const publish = vi.spyOn(pubsub, "publish")
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(
			iframe,
			"MAGIC_SET_INPUT_MESSAGE",
			window.location.origin,
			{ message: "forged input" },
			window,
		)
		await flushReactEffects()

		expect(publish).not.toHaveBeenCalledWith(PubSubEvents.Set_Input_Message, "forged input")
	})

	it("accepts input messages from the current iframe source", async () => {
		const publish = vi.spyOn(pubsub, "publish")
		renderIsolated(<IsolatedHTMLRenderer {...defaultProps} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(iframe, "MAGIC_SET_INPUT_MESSAGE", window.location.origin, {
			message: "trusted input",
		})
		await flushReactEffects()

		expect(publish).toHaveBeenCalledWith(PubSubEvents.Set_Input_Message, "trusted input")
	})

	it("ignores privileged legacy messages from an unexpected source", async () => {
		const saveEditContent = vi.fn()
		const publish = vi.spyOn(pubsub, "publish")
		renderIsolated(
			<IsolatedHTMLRenderer {...defaultProps} isEditMode saveEditContent={saveEditContent} />,
		)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const forgedSource = window
		dispatchIframeMessage(
			iframe,
			"MAGIC_DOWNLOAD_FILES_REQUEST",
			window.location.origin,
			{ requestId: "forged-download", filePaths: ["secret.txt"] },
			forgedSource,
		)
		dispatchIframeMessage(
			iframe,
			"MAGIC_SEND_MESSAGE_REQUEST",
			window.location.origin,
			{ requestId: "forged-send", message: "forged message" },
			forgedSource,
		)
		dispatchIframeMessage(
			iframe,
			"saveContent",
			window.location.origin,
			{ content: "forged content" },
			forgedSource,
		)
		dispatchIframeMessage(iframe, "MAGIC_SET_INPUT_MESSAGE", "https://untrusted.example", {
			message: "wrong-origin input",
		})
		await flushReactEffects()

		expect(iframeMessageMocks.handleMagicDownloadFiles).not.toHaveBeenCalled()
		expect(iframeMessageMocks.handleAgentMessage).not.toHaveBeenCalled()
		expect(saveEditContent).not.toHaveBeenCalled()
		expect(publish).not.toHaveBeenCalledWith(PubSubEvents.Set_Input_Message, expect.anything())
		expect(publish).not.toHaveBeenCalledWith(
			PubSubEvents.Set_Input_Message,
			"wrong-origin input",
		)
	})
})
