import type { CSSProperties, ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WechatArticleView from "./article"
import { loadWechatArticleHtml } from "./wechatArticleHtml"

const { mockUseIsMobile } = vi.hoisted(() => ({
	mockUseIsMobile: vi.fn(() => true),
}))

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: mockUseIsMobile,
}))

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

vi.mock("@/assets/locales/locale-adapters", () => ({
	getAdminLocaleModules: () => ({}),
	getLocaleModules: () => ({}),
	loadFallbackLocale: () => Promise.resolve({ default: {} }),
	loadMagicFlowLocale: () => Promise.resolve({ default: {} }),
}))

vi.mock("./wechatArticleHtml", () => ({
	loadWechatArticleHtml: vi.fn(),
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

vi.mock("../../components/PhoneShell", () => ({
	__esModule: true,
	default: ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
		<div data-testid="mock-phone-shell" style={style}>
			{children}
		</div>
	),
}))

vi.mock("../../hooks/usePhoneScaling", () => ({
	usePhoneScaling: () => ({
		containerRef: { current: null },
		scale: 1,
		width: 393,
		height: 852,
	}),
}))

vi.mock("../../../../contents/HTML/IsolatedHTMLRenderer", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-isolated-html-renderer" />,
}))

describe("WechatArticleView mobile", () => {
	beforeEach(() => {
		mockUseIsMobile.mockReturnValue(true)
		vi.mocked(loadWechatArticleHtml).mockResolvedValue({
			content:
				'<html><head><style>.hero{width:720px}</style></head><body><main><img class="hero" src="cover.png" /><p>article</p></main></body></html>',
			filePathMapping: new Map(),
		})
	})

	it("defaults to the phone preview and constrains article HTML on mobile", async () => {
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

		await screen.findByTestId("wechat-article-phone-frame")

		expect(screen.queryByTestId("wechat-article-desktop-frame")).not.toBeInTheDocument()
		expect(screen.queryByTestId("mock-isolated-html-renderer")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "手机预览" })).toHaveAttribute(
			"aria-pressed",
			"true",
		)

		await waitFor(() => {
			const shadowRoot = screen.getByTestId("wechat-article-phone-inline-html").shadowRoot
			expect(shadowRoot?.textContent).toContain("article")
			const resetStyle = shadowRoot?.querySelector(
				"style[data-wechat-phone-preview-reset='true']",
			)
			expect(resetStyle?.textContent).toContain("max-width: 100%")
		})
	})
})
