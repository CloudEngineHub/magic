import { createRef } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WechatArticleView, { type WechatArticleViewRef } from "./article"
import { loadWechatArticleHtml } from "./wechatArticleHtml"
import type { IsolatedHTMLRendererRef } from "../../../../contents/HTML/IsolatedHTMLRenderer"

const { rendererStartInspectorMock, rendererStartInspectorAppendMock, rendererStopInspectorMock } =
	vi.hoisted(() => ({
		rendererStartInspectorMock: vi.fn(),
		rendererStartInspectorAppendMock: vi.fn(),
		rendererStopInspectorMock: vi.fn(),
	}))

vi.mock("./wechatArticleHtml", () => ({
	loadWechatArticleHtml: vi.fn(() =>
		Promise.resolve({
			content: "<main>article</main>",
			filePathMapping: new Map(),
		}),
	),
}))

vi.mock("../../components/CardActionStrip", () => ({
	CardActionStrip: (props: {
		customActions?: Array<{
			key: string
			label: string
			active?: boolean
			onClick: () => void
			testId?: string
		}>
	}) => (
		<div data-testid="wechat-article-floating-actions">
			{props.customActions?.map((action) => (
				<button
					key={action.key}
					type="button"
					aria-label={action.label}
					aria-pressed={action.active}
					data-testid={action.testId}
					onClick={action.onClick}
				>
					{action.label}
				</button>
			))}
		</div>
	),
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getAdminLocaleModules: () => ({}),
	getLocaleModules: () => ({}),
	loadFallbackLocale: () => Promise.resolve({ default: {} }),
	loadMagicFlowLocale: () => Promise.resolve({ default: {} }),
}))

vi.mock("antd", () => {
	const api = {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warning: vi.fn(),
		loading: vi.fn(),
		confirm: vi.fn(),
		destroyAll: vi.fn(),
	}
	return {
		App: Object.assign(() => null, {
			useApp: () => ({
				message: api,
				modal: api,
				notification: api,
			}),
		}),
		Modal: api,
		message: api,
		notification: api,
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallback?: string | Record<string, string | number>) => {
			if (typeof fallback === "string") return fallback
			if (fallback?.defaultValue) {
				return String(fallback.defaultValue).replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
					String(fallback[token] ?? ""),
				)
			}
			return key
		},
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
}))

vi.mock("../../../../contents/HTML/IsolatedHTMLRenderer", async () => {
	const { forwardRef, useEffect, useImperativeHandle, useRef } = await import("react")

	return {
		__esModule: true,
		default: forwardRef<IsolatedHTMLRendererRef>(function MockIsolatedHTMLRenderer(
			props: { content?: string },
			ref,
		) {
			const iframeRef = useRef<HTMLIFrameElement>(null)

			useEffect(() => {
				if (!iframeRef.current) return
				const frameDocument = document.implementation.createHTMLDocument("wechat article")
				frameDocument.open()
				frameDocument.write(props.content || "")
				frameDocument.close()
				Object.defineProperty(iframeRef.current, "contentDocument", {
					configurable: true,
					value: frameDocument,
				})
			}, [props.content])

			useImperativeHandle(ref, () => ({
				getIframeElement: () => iframeRef.current,
				getEditorRef: () => null,
				resetContent: vi.fn(),
				updateContent: vi.fn(),
				getContent: () => Promise.resolve(null),
				getFetchInterceptedCallback: () => undefined,
				toggleDevConsole: vi.fn(),
				startInspector: rendererStartInspectorMock,
				stopInspector: rendererStopInspectorMock,
				startInspectorAppend: rendererStartInspectorAppendMock,
			}))

			return (
				<div data-testid="mock-isolated-html-renderer">
					<iframe ref={iframeRef} title="mock wechat article" />
					{props.content}
				</div>
			)
		}),
	}
})

describe("WechatArticleView", () => {
	beforeEach(() => {
		rendererStartInspectorMock.mockClear()
		rendererStartInspectorAppendMock.mockClear()
		rendererStopInspectorMock.mockClear()
		vi.mocked(loadWechatArticleHtml).mockResolvedValue({
			content: "<main>article</main>",
			filePathMapping: new Map(),
		})
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					text: () => Promise.resolve("<main>article</main>"),
				}),
			),
		)
	})

	it("starts article inspection in append mode without creating a new topic", async () => {
		const ref = createRef<WechatArticleViewRef>()

		render(
			<WechatArticleView
				ref={ref}
				post={{
					meta: { id: "wechat-post-1", title: "Article" },
					cards: [],
					article: { path: "article.html", fileId: "article-file-1" },
				}}
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(ref.current).not.toBeNull()
		})
		await screen.findByTestId("mock-isolated-html-renderer")

		ref.current?.startInspector()

		expect(rendererStartInspectorAppendMock).toHaveBeenCalledTimes(1)
		expect(rendererStartInspectorMock).not.toHaveBeenCalled()
	})

	it("exposes the loaded HTML content for WeChat editor copy export", async () => {
		const ref = createRef<WechatArticleViewRef>()

		render(
			<WechatArticleView
				ref={ref}
				post={{
					meta: { id: "wechat-post-1", title: "Article" },
					cards: [],
					article: { path: "article.html", fileId: "article-file-1" },
				}}
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(ref.current?.getArticleHtml()).toBe("<main>article</main>")
		})
	})

	it("exposes rendered paste-safe HTML with inline styles for WeChat copy export", async () => {
		vi.mocked(loadWechatArticleHtml).mockResolvedValueOnce({
			content:
				'<html><head><style>.lead{color:red;font-weight:700}</style></head><body><main><p class="lead">article</p><script>window.bad=true</script></main></body></html>',
			filePathMapping: new Map(),
		})
		const ref = createRef<WechatArticleViewRef>()

		render(
			<WechatArticleView
				ref={ref}
				post={{
					meta: { id: "wechat-post-1", title: "Article" },
					cards: [],
					article: { path: "article.html", fileId: "article-file-1" },
				}}
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			const html = ref.current?.getArticleHtml() || ""
			expect(html).toContain('<p class="lead" style="color:red;font-weight:700">article</p>')
			expect(html).not.toContain("<style>")
			expect(html).not.toContain("<script>")
		})
	})

	it("renders post comments inside the article renderer content", async () => {
		render(
			<WechatArticleView
				post={{
					meta: {
						id: "wechat-post-1",
						title: "Article",
						commentCount: "2",
						comments: [
							{
								name: "Alice",
								text: "这个案例很有启发",
								time: "刚刚",
								location: "上海",
								likes: "8",
							},
						],
					},
					cards: [],
					article: { path: "article.html", fileId: "article-file-1" },
				}}
				attachmentList={[]}
			/>,
		)

		const renderer = await screen.findByTestId("mock-isolated-html-renderer")

		expect(renderer).toHaveTextContent("这个案例很有启发")
		expect(renderer).toHaveTextContent("Alice")
		expect(renderer).toHaveTextContent("精选评论 2")
		expect(renderer).toHaveTextContent("user-select:none")
		expect(renderer).toHaveTextContent("max-width:760px")
		expect(screen.queryByTestId("wechat-article-comments")).not.toBeInTheDocument()
	})

	it("shows the full-content view mode switch inside the article page", async () => {
		render(
			<WechatArticleView
				post={{
					meta: { id: "wechat-post-1", title: "Article", author: "Datawhale" },
					cards: [],
					article: { path: "article.html", fileId: "article-file-1" },
				}}
				attachmentList={[]}
			/>,
		)

		await screen.findByTestId("mock-isolated-html-renderer")

		expect(screen.getByTestId("wechat-article-desktop-frame")).toBeInTheDocument()
		expect(screen.queryByLabelText("全文内容视图切换")).not.toBeInTheDocument()
		expect(screen.getByTestId("wechat-article-floating-actions")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "手机预览" }))

		const phoneFrame = screen.getByTestId("wechat-article-phone-frame")
		expect(phoneFrame).toBeInTheDocument()
		expect(phoneFrame).toHaveClass("animate-in", "duration-300", "py-8")
		expect(phoneFrame.firstElementChild).toHaveStyle({ transformOrigin: "top center" })
		const browserContent = screen.getByTestId("wechat-article-phone-browser-content")
		expect(browserContent).toBeInTheDocument()
		const inlineArticle = screen.getByTestId("wechat-article-phone-inline-html")
		expect(inlineArticle.shadowRoot?.textContent).toContain("article")
		expect(
			within(browserContent).queryByTestId("mock-isolated-html-renderer"),
		).not.toBeInTheDocument()
		expect(screen.getByLabelText("关闭预览")).toBeInTheDocument()
		expect(screen.getByLabelText("更多")).toBeInTheDocument()
		expect(screen.getByTestId("wechat-article-phone-meta")).toHaveTextContent("Datawhale")
		expect(screen.getByTestId("wechat-article-phone-bottom-bar")).toHaveTextContent("写留言")
		expect(screen.queryByTestId("wechat-article-desktop-frame")).not.toBeInTheDocument()
	})

	it("keeps article styles isolated from the main document in phone preview", async () => {
		vi.mocked(loadWechatArticleHtml).mockResolvedValueOnce({
			content:
				"<html><head><style>body{padding-right:48px!important}</style></head><body><main>article</main></body></html>",
			filePathMapping: new Map(),
		})

		render(
			<WechatArticleView
				post={{
					meta: { id: "wechat-post-1", title: "Article", author: "Datawhale" },
					cards: [],
					article: { path: "article.html", fileId: "article-file-1" },
				}}
				attachmentList={[]}
			/>,
		)

		await screen.findByTestId("mock-isolated-html-renderer")
		fireEvent.click(screen.getByRole("button", { name: "手机预览" }))

		const inlineArticle = screen.getByTestId("wechat-article-phone-inline-html")
		expect(inlineArticle.shadowRoot?.querySelector("style")?.textContent).toContain(
			"padding-right:48px",
		)
		expect(
			Array.from(document.body.querySelectorAll("style")).some((style) =>
				style.textContent?.includes("padding-right:48px"),
			),
		).toBe(false)
		expect(document.body.style.paddingRight).toBe("")
	})
})
