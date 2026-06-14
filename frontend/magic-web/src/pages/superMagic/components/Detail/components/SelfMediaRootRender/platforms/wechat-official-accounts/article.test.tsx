import { createRef } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WechatArticleView, { type WechatArticleViewRef } from "./article"
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
	CardActionStrip: () => null,
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
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
}))

vi.mock("../../../../contents/HTML/IsolatedHTMLRenderer", async () => {
	const { forwardRef, useImperativeHandle } = await import("react")

	return {
		__esModule: true,
		default: forwardRef<IsolatedHTMLRendererRef>(
			function MockIsolatedHTMLRenderer(_props, ref) {
				useImperativeHandle(ref, () => ({
					getIframeElement: () => null,
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

				return <div data-testid="mock-isolated-html-renderer" />
			},
		),
	}
})

describe("WechatArticleView", () => {
	beforeEach(() => {
		rendererStartInspectorMock.mockClear()
		rendererStartInspectorAppendMock.mockClear()
		rendererStopInspectorMock.mockClear()
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
})
