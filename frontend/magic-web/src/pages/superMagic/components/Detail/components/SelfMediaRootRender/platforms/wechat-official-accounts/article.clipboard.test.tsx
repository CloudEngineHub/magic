import { createRef } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IsolatedHTMLRendererRef } from "../../../../contents/HTML/IsolatedHTMLRenderer"
import WechatArticleView, { type WechatArticleViewRef } from "./article"
import { loadWechatArticleHtml } from "./wechatArticleHtml"

const { crossOriginDocument } = vi.hoisted(() => ({
	crossOriginDocument: { value: false },
}))

vi.mock("./wechatArticleHtml", () => ({
	loadWechatArticleHtml: vi.fn(),
}))

vi.mock("../../components/CardActionStrip", () => ({
	CardActionStrip: () => null,
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getAdminLocaleModules: () => ({}),
	getLocaleModules: () => ({}),
	loadFallbackLocale: () => Promise.resolve({ default: {} }),
	loadMagicFlowLocale: () => Promise.resolve({ default: {} }),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallback?: string | Record<string, string | number>) => {
			if (typeof fallback === "string") return fallback
			if (fallback?.defaultValue) return String(fallback.defaultValue)
			return key
		},
	}),
	initReactI18next: { type: "3rdParty", init: () => undefined },
}))

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("../../../../contents/HTML/IsolatedHTMLRenderer", async () => {
	const { forwardRef, useEffect, useImperativeHandle, useRef } = await import("react")

	return {
		__esModule: true,
		default: forwardRef<IsolatedHTMLRendererRef>(function MockIsolatedHTMLRenderer(
			props: { content?: string; onRenderReady?: () => void },
			ref,
		) {
			const iframeRef = useRef<HTMLIFrameElement>(null)
			const { content, onRenderReady } = props

			useEffect(() => {
				if (!iframeRef.current) return
				const frameDocument = document.implementation.createHTMLDocument("wechat article")
				frameDocument.open()
				frameDocument.write(content || "")
				frameDocument.close()
				Object.defineProperty(iframeRef.current, "contentDocument", {
					configurable: true,
					get: () => {
						if (crossOriginDocument.value) {
							throw new DOMException("Blocked", "SecurityError")
						}
						return frameDocument
					},
				})
				Object.defineProperty(iframeRef.current, "contentWindow", {
					configurable: true,
					value: {
						addEventListener: vi.fn(),
						pageYOffset: 0,
						removeEventListener: vi.fn(),
						scrollY: 0,
					},
				})
				onRenderReady?.()
			}, [content, onRenderReady])

			useImperativeHandle(ref, () => ({
				getIframeElement: () => iframeRef.current,
				getEditorRef: () => null,
				resetContent: vi.fn(),
				updateContent: vi.fn(),
				getContent: () => Promise.resolve(null),
				getFetchInterceptedCallback: () => undefined,
				toggleDevConsole: vi.fn(),
				startInspector: vi.fn(),
				stopInspector: vi.fn(),
				startInspectorAppend: vi.fn(),
			}))

			return <iframe ref={iframeRef} title="mock wechat article" />
		}),
	}
})

const post = {
	meta: { id: "wechat-post-1", title: "Article" },
	cards: [],
	article: { path: "article.html", fileId: "article-file-1" },
}

describe("WechatArticleView clipboard HTML", () => {
	beforeEach(() => {
		crossOriginDocument.value = false
		vi.mocked(loadWechatArticleHtml).mockReset()
	})

	it("uses rendered iframe styles when the preview document is accessible", async () => {
		vi.mocked(loadWechatArticleHtml).mockResolvedValue({
			content:
				'<html><head><style>.lead{color:red;font-weight:700}</style></head><body><main><p class="lead">article</p><script>window.bad=true</script></main></body></html>',
			filePathMapping: new Map(),
		})
		const ref = createRef<WechatArticleViewRef>()

		render(<WechatArticleView ref={ref} post={post} attachmentList={[]} />)

		await screen.findByTitle("mock wechat article")
		await waitFor(() => expect(ref.current).not.toBeNull())
		const html = (await ref.current?.getArticleHtml()) || ""

		expect(html).toContain('<p class="lead" style="color:red;font-weight:700">article</p>')
		expect(html).not.toContain("<style>")
		expect(html).not.toContain("<script>")
	})

	it("falls back to async source conversion when the preview iframe is cross-origin", async () => {
		crossOriginDocument.value = true
		vi.mocked(loadWechatArticleHtml).mockResolvedValue({
			content:
				'<html><head><link rel="stylesheet" href="https://cdn.example.com/article.css"></head><body><p class="lead">article</p></body></html>',
			filePathMapping: new Map(),
		})
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(".lead { color: rgb(230, 57, 70); }"),
			}),
		)
		const ref = createRef<WechatArticleViewRef>()

		render(<WechatArticleView ref={ref} post={post} attachmentList={[]} />)

		await screen.findByTitle("mock wechat article")
		await waitFor(() => expect(ref.current).not.toBeNull())
		const html = (await ref.current?.getArticleHtml()) || ""

		expect(html).toContain('class="lead"')
		expect(html).toContain("color:rgb(230, 57, 70)")
		expect(html).not.toContain("<link")
	})
})
