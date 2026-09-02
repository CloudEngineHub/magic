import { act, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import IsolatedHTMLRenderer from "../IsolatedHTMLRenderer"

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
		handleAgentMessage: vi.fn(async () => false),
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
		handleMagicUploadFiles: vi.fn(),
		handleMagicAddFilesToMessage: vi.fn(),
		handleMagicDownloadFiles: vi.fn(),
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

vi.mock("../components/StylePanel/controls", () => ({
	ZoomControls: () => null,
}))

vi.mock("../components/DevConsole", () => ({
	DevConsolePanel: () => null,
}))

const defaultProps = {
	content: "<html><body>history</body></html>",
	filePathMapping: new Map<string, string>(),
	openNewTab: vi.fn(),
	fileId: "history-file",
	attachmentList: [],
	selectedProject: { id: "project-1" },
	isVisible: true,
}

function getSetContentCalls(postMessage: ReturnType<typeof vi.fn>) {
	return postMessage.mock.calls.filter(([message]) => message?.type === "setContent")
}

function dispatchIframeMessage(
	iframe: HTMLIFrameElement,
	type: string,
	origin = window.location.origin,
	extraData: Record<string, unknown> = {},
) {
	act(() => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type, ...extraData },
				origin,
				source: iframe.contentWindow,
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
	})

	it("enables presentation and low-risk media capabilities for HTML previews", async () => {
		render(<IsolatedHTMLRenderer {...defaultProps} />)
		await flushReactEffects()

		const iframe = screen.getByTestId("isolated-html-content-iframe")
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

	it("shows the scrollbar style only while a PPT is manually zoomed", async () => {
		hookState.isManualZoom = true
		hookState.shouldApplyScaling = true

		const { container, rerender } = render(
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
		render(
			<IsolatedHTMLRenderer
				{...defaultProps}
				fileId="student-file"
				virtualStorageMarkerId="index-file"
				selectedProject={{ id: "project-1", current_topic_id: "topic-1" }}
			/>,
		)

		await flushReactEffects()

		expect(virtualStorageMocks.buildNamespace).toHaveBeenCalledWith({
			projectId: "project-1",
			topicId: "topic-1",
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

	it("uses the scoped selected topic for virtual storage", async () => {
		const scopedTopicStore = { selectedTopic: { id: "topic-from-micro-app" } }

		render(
			<IsolatedHTMLRenderer
				{...defaultProps}
				selectedProject={{ id: "project-1", current_topic_id: "old-topic" }}
				topicStore={scopedTopicStore as unknown as TopicStore}
			/>,
		)
		await flushReactEffects()

		expect(virtualStorageMocks.buildNamespace).toHaveBeenCalledWith({
			projectId: "project-1",
			topicId: "topic-from-micro-app",
			fileId: "history-file",
		})
	})

	it("passes the explicit projectId to Agent actions", async () => {
		render(<IsolatedHTMLRenderer {...defaultProps} projectId="project-from-preview" />)
		await flushReactEffects()

		expect(agentActionMocks.useIframeAgentActions).toHaveBeenCalledWith(
			"project-from-preview",
			undefined,
			defaultProps.selectedProject,
		)
	})

	it("passes the scoped topic store to Agent actions", async () => {
		const scopedTopicStore = { selectedTopic: { id: "topic-from-micro-app" } }

		render(
			<IsolatedHTMLRenderer
				{...defaultProps}
				projectId="project-from-preview"
				topicStore={scopedTopicStore as unknown as TopicStore}
			/>,
		)
		await flushReactEffects()

		expect(agentActionMocks.useIframeAgentActions).toHaveBeenCalledWith(
			"project-from-preview",
			scopedTopicStore,
			defaultProps.selectedProject,
		)
	})

	it("does not inject content into a sibling iframe from another iframeReady message", async () => {
		render(
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
		render(<IsolatedHTMLRenderer {...defaultProps} />)
		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		const postMessage = vi
			.spyOn(iframe.contentWindow as Window, "postMessage")
			.mockImplementation(vi.fn())

		dispatchIframeMessage(iframe, "iframeReady")
		dispatchIframeMessage(iframe, "pageLoaded")
		await flushReactEffects()

		expect(getSetContentCalls(postMessage)).toHaveLength(1)
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

		const { rerender } = render(
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
		const { rerender } = render(
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

	it("keeps the renderer file identity when a link message contains a forged fileId", async () => {
		const openNewTab = vi.fn()
		const iframeProps = { ...defaultProps, openNewTab, fileId: "current-file" }
		render(<IsolatedHTMLRenderer {...iframeProps} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(iframe, "linkClicked", window.location.origin, {
			href: "/target.html",
			autoEdit: true,
			fileId: "forged-file",
		})
		await flushReactEffects()

		expect(openNewTab).toHaveBeenCalledWith("current-file", "/target.html", true)
	})

	it("ignores link messages from an unexpected origin", async () => {
		const openNewTab = vi.fn()
		render(<IsolatedHTMLRenderer {...defaultProps} openNewTab={openNewTab} />)

		const iframe = screen.getByTestId("isolated-html-content-iframe") as HTMLIFrameElement
		dispatchIframeMessage(iframe, "linkClicked", "https://untrusted.example", {
			href: "/target.html",
		})
		await flushReactEffects()

		expect(openNewTab).not.toHaveBeenCalled()
	})
})
