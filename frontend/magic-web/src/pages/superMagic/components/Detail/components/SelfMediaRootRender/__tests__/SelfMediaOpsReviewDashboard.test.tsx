import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SelfMediaOpsReviewDashboard from "../components/SelfMediaOpsReviewDashboard"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"

const mockHtmlRendererProps = vi.hoisted(() => vi.fn())

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/IsolatedHTMLRenderer", async () => {
	const React = await vi.importActual<typeof import("react")>("react")
	return {
		default: React.forwardRef(function MockIsolatedHTMLRenderer(
			props: Record<string, unknown>,
			ref,
		) {
			void ref
			mockHtmlRendererProps(props)
			return React.createElement("div", {
				"data-testid": "self-media-ops-review-html-renderer",
				"data-relative-file-path": props.relative_file_path,
			})
		}),
	}
})

vi.mock("@/components/tiptap-templates/simple/simple-editor", async () => {
	const React = await vi.importActual<typeof import("react")>("react")
	const renderMarkdown = (content: string) =>
		content
			.split(/\n+/)
			.filter(Boolean)
			.map((line, index) => {
				if (line.startsWith("# ")) {
					return React.createElement("h1", { key: index }, line.slice(2))
				}
				if (line.startsWith("- ")) {
					return React.createElement("li", { key: index }, line.slice(2))
				}
				const boldMatch = line.match(/^\*\*(.+?)\*\*：(.+)$/)
				if (boldMatch) {
					return React.createElement(
						"p",
						{ key: index },
						React.createElement("strong", null, boldMatch[1]),
						`：${boldMatch[2]}`,
					)
				}
				return React.createElement("p", { key: index }, line)
			})

	return {
		SimpleEditor: ({ content }: { content?: string }) =>
			React.createElement(
				"div",
				{ "data-testid": "simple-editor-markdown-preview" },
				renderMarkdown(content ?? ""),
			),
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			(
				({
					"detail.selfMedia.common.untitledPost": "Untitled",
					"detail.selfMedia.opsMetrics.fields.reads": "Reads",
					"detail.selfMedia.opsMetrics.fields.likes": "Likes",
					"detail.selfMedia.opsMetrics.fields.saves": "Saves",
					"detail.selfMedia.opsMetrics.fields.comments": "Comments",
					"detail.selfMedia.opsMetrics.fields.shares": "Shares",
					"detail.selfMedia.opsMetrics.loading": "Loading",
					"detail.selfMedia.opsReview.actionsTitle": "Next actions",
					"detail.selfMedia.opsReview.close": "Close review",
					"detail.selfMedia.opsReview.commentsTitle": "Audience signals",
					"detail.selfMedia.opsReview.conversionSignal": "Conversion signal",
					"detail.selfMedia.opsReview.deltaReads": "Reads change",
					"detail.selfMedia.opsReview.edit": "Edit data",
					"detail.selfMedia.opsReview.empty": "No data yet",
					"detail.selfMedia.opsReview.engagementRate": "Engagement rate",
					"detail.selfMedia.opsReview.funnelTitle": "Traffic efficiency",
					"detail.selfMedia.opsReview.impactTitle": "Impact map",
					"detail.selfMedia.opsReview.markdownTitle": "Markdown review report",
					"detail.selfMedia.opsReview.qualityTitle": "Quality mix",
					"detail.selfMedia.opsReview.reviewHtmlTitle": "HTML review report",
					"detail.selfMedia.opsReview.reviewTitle": "Review report",
					"detail.selfMedia.opsReview.sourceStatus.fetched": "Fetched",
					"detail.selfMedia.opsReview.sourceStatus.pending": "Pending",
					"detail.selfMedia.opsReview.sourceStatus.failed": "Failed",
					"detail.selfMedia.opsReview.sourceStatus.unknown": "Not fetched",
					"detail.selfMedia.opsReview.summaryTitle": "Performance brief",
					"detail.selfMedia.opsReview.sync": "Sync data",
					"detail.selfMedia.opsReview.title": "Operations review",
					"detail.selfMedia.opsReview.trendTitle": "Sync trend",
				}) as Record<string, string>
			)[key] ?? key,
	}),
}))

describe("SelfMediaOpsReviewDashboard", () => {
	it("renders a dense executive operations dashboard with unified chart colors", async () => {
		render(
			<SelfMediaOpsReviewDashboard
				open
				target={buildTarget()}
				onClose={vi.fn()}
				onLoadData={async () => buildOpsReviewData()}
			/>,
		)

		expect(await screen.findByTestId("self-media-ops-review-dashboard")).toHaveAttribute(
			"data-palette",
			"executive",
		)
		expect(screen.getByTestId("self-media-ops-review-brief")).toHaveTextContent(
			"Performance brief",
		)
		expect(screen.getByTestId("self-media-ops-review-kpis")).toHaveTextContent("12.8%")
		expect(screen.getByTestId("self-media-ops-review-impact-map")).toHaveTextContent(
			"Impact map",
		)
		expect(screen.getByTestId("self-media-ops-review-efficiency-funnel")).toHaveTextContent(
			"Traffic efficiency",
		)
		expect(screen.getByTestId("self-media-ops-review-quality-mix")).toHaveTextContent(
			"Quality mix",
		)
		expect(screen.getByTestId("self-media-ops-review-actions")).toHaveTextContent(
			"把教程场景拆成团队协作案例",
		)
	})

	it("renders review.html through the shared HTML preview runtime", async () => {
		render(
			<SelfMediaOpsReviewDashboard
				open
				target={buildTarget()}
				onClose={vi.fn()}
				onLoadData={async () => ({
					...buildOpsReviewData(),
					reviewHtml: {
						content:
							"<html><body><button data-action='send-next-step'>发送下一步</button></body></html>",
					},
				})}
			/>,
		)

		const renderer = await screen.findByTestId("self-media-ops-review-html-renderer")
		expect(renderer).toHaveAttribute("data-relative-file-path", "posts/post-1/ops/review.html")
		expect(screen.queryByTestId("self-media-ops-review-html-frame")).not.toBeInTheDocument()
		expect(mockHtmlRendererProps).toHaveBeenCalledWith(
			expect.objectContaining({
				content:
					"<html><body><button data-action='send-next-step'>发送下一步</button></body></html>",
				relative_file_path: "posts/post-1/ops/review.html",
				disableDynamicResourceInterception: true,
				containIframeOverscroll: true,
			}),
		)
	})

	it("renders legacy review.md as a real markdown preview", async () => {
		render(
			<SelfMediaOpsReviewDashboard
				open
				target={buildTarget()}
				onClose={vi.fn()}
				onLoadData={async () => ({
					...buildOpsReviewData(),
					reviewHtml: null,
					reviewMarkdown: {
						content:
							"# 复盘结论\n\n- 第一条：标题钩子有效\n- 第二条：补团队协作案例\n\n**下一步**：做评论区追问。",
					},
				})}
			/>,
		)

		const preview = await screen.findByTestId("self-media-ops-review-markdown-preview")
		expect(within(preview).getByTestId("simple-editor-markdown-preview")).toBeInTheDocument()
		expect(within(preview).getByRole("heading", { name: "复盘结论" })).toBeInTheDocument()
		expect(within(preview).getByText("第一条：标题钩子有效")).toBeInTheDocument()
		expect(within(preview).getByText("下一步")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-ops-review-markdown")).not.toBeInTheDocument()
	})
})

function buildTarget(): SelfMediaPlatformPostItem {
	return {
		platform: "rednote",
		index: 0,
		entry: { id: "post-1", name: "Post One", entry: "posts/post-1/post.json" },
		post: {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
				author: "Magic Lab",
			},
			cards: [],
		},
	} as SelfMediaPlatformPostItem
}

function buildOpsReviewData() {
	return {
		source: {
			version: 1,
			updatedAt: "2026-06-12T08:00:00.000Z",
			platform: "rednote",
			publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
			fetchStatus: "fetched" as const,
			lastFetchedAt: "2026-06-12T08:00:00.000Z",
		},
		metrics: {
			version: 1,
			updatedAt: "2026-06-12T08:00:00.000Z",
			source: "real-platform" as const,
			metrics: {
				reads: "1280",
				likes: "96",
				saves: "42",
				comments: "18",
				shares: "22",
			},
			derivedMetrics: {
				engagementRate: "12.8%",
				saveRate: "3.3%",
				shareRate: "1.7%",
			},
			history: [
				{
					fetchedAt: "2026-06-10T08:00:00.000Z",
					metrics: { reads: "820", likes: "41", saves: "12", shares: "8" },
				},
				{
					fetchedAt: "2026-06-11T08:00:00.000Z",
					metrics: { reads: "1040", likes: "70", saves: "27", shares: "16" },
				},
				{
					fetchedAt: "2026-06-12T08:00:00.000Z",
					metrics: { reads: "1280", likes: "96", saves: "42", shares: "22" },
				},
			],
		},
		comments: {
			version: 1,
			updatedAt: "2026-06-12T08:00:00.000Z",
			source: "real-platform" as const,
			summary: "评论集中在团队协作、模板复用和是否支持多人编辑。",
			comments: [
				{
					id: "c1",
					author: "Alice",
					text: "这个能不能多人一起维护？",
					intent: "购买咨询",
					sentiment: "question" as const,
				},
				{
					id: "c2",
					author: "Bob",
					text: "想看真实团队案例。",
					intent: "选题建议",
					sentiment: "positive" as const,
				},
			],
			insights: ["把教程场景拆成团队协作案例", "评论区追问是否需要模板包"],
		},
		reviewHtml: null,
		reviewMarkdown: null,
	}
}
