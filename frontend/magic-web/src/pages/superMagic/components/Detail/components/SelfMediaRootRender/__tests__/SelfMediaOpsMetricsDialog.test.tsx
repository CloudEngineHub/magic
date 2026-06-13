import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SelfMediaOpsMetricsDialog from "../components/SelfMediaOpsMetricsDialog"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaFileStorageService } from "../services/SelfMediaFileStorageService"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const text =
				(
					{
						"detail.selfMedia.opsMetrics.title": "Operations workspace",
						"detail.selfMedia.opsMetrics.description": "Manage {{title}}",
						"detail.selfMedia.opsMetrics.summary": "{{count}} metrics filled",
						"detail.selfMedia.opsMetrics.loading": "Loading",
						"detail.selfMedia.opsMetrics.metricPlaceholder": "Enter value",
						"detail.selfMedia.opsMetrics.notesPlaceholder": "Metric notes",
						"detail.selfMedia.opsMetrics.commentsSummaryPlaceholder":
							"Summarize reader feedback",
						"detail.selfMedia.opsMetrics.commentsRawPlaceholder":
							"One comment per line",
						"detail.selfMedia.opsMetrics.reviewPlaceholder":
							"Write review and next actions",
						"detail.selfMedia.opsMetrics.sourceUrlPlaceholder":
							"Paste published article URL",
						"detail.selfMedia.opsMetrics.cancel": "Cancel",
						"detail.selfMedia.opsMetrics.edit": "Edit",
						"detail.selfMedia.opsMetrics.done": "Done",
						"detail.selfMedia.opsMetrics.save": "Save",
						"detail.selfMedia.opsMetrics.saving": "Saving",
						"detail.selfMedia.opsMetrics.fetchPublishedData": "Fetch published data",
						"detail.selfMedia.opsMetrics.fetchingPublishedData": "Fetching",
						"detail.selfMedia.opsMetrics.sourceUrlRequired":
							"Published article URL is required.",
						"detail.selfMedia.opsMetrics.optionalToggle": "Optional manual data",
						"detail.selfMedia.opsMetrics.sourceStatus.pending": "Pending fetch",
						"detail.selfMedia.opsMetrics.sourceStatus.fetched": "Fetched",
						"detail.selfMedia.opsMetrics.sourceStatus.failed": "Fetch failed",
						"detail.selfMedia.opsMetrics.sourceStatus.unknown": "Not fetched",
						"detail.selfMedia.opsMetrics.sourceLastFetched": "Last fetched {{time}}",
						"detail.selfMedia.opsMetrics.sourceFailureReason": "Reason: {{reason}}",
						"detail.selfMedia.opsMetrics.sections.source": "Published link",
						"detail.selfMedia.opsMetrics.sections.metrics": "Metrics",
						"detail.selfMedia.opsMetrics.sections.feedback": "Feedback",
						"detail.selfMedia.opsMetrics.sections.review": "Review",
						"detail.selfMedia.opsMetrics.fields.sourceUrl": "Article URL",
						"detail.selfMedia.opsMetrics.fields.reads": "Reads",
						"detail.selfMedia.opsMetrics.fields.likes": "Likes",
						"detail.selfMedia.opsMetrics.fields.saves": "Saves",
						"detail.selfMedia.opsMetrics.fields.comments": "Comments",
						"detail.selfMedia.opsMetrics.fields.shares": "Shares",
						"detail.selfMedia.opsMetrics.fields.follows": "Follows",
						"detail.selfMedia.opsMetrics.fields.conversions": "Conversions",
						"detail.selfMedia.opsMetrics.fields.notes": "Notes",
						"detail.selfMedia.opsMetrics.fields.feedbackSummary": "Feedback summary",
						"detail.selfMedia.opsMetrics.fields.commentSamples": "Comment samples",
						"detail.selfMedia.opsMetrics.fields.review": "Review",
						"detail.selfMedia.opsMetrics.preview.empty": "Not available",
					} as Record<string, string>
				)[key] ?? key
			return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
				String(options?.[name] ?? ""),
			)
		},
	}),
}))

describe("SelfMediaOpsMetricsDialog", () => {
	it("shows the real-data fetch status from the source file", async () => {
		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService({
					loadPostOpsSource: vi.fn().mockResolvedValue({
						version: 1,
						updatedAt: "2026-06-11T08:05:00.000Z",
						platform: "rednote",
						publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
						fetchStatus: "failed",
						lastFetchedAt: "2026-06-11T08:10:00.000Z",
						failureReason: "Login required",
					}),
				})}
			/>,
		)

		expect(await screen.findByTestId("self-media-ops-source-status")).toHaveTextContent(
			"Fetch failed",
		)
		expect(screen.getByTestId("self-media-ops-source-status")).toHaveTextContent(
			"Last fetched 2026-06-11T08:10:00.000Z",
		)
		expect(screen.getByTestId("self-media-ops-source-status")).toHaveTextContent(
			"Reason: Login required",
		)
	})

	it("opens directly in editable data mode", async () => {
		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService()}
			/>,
		)

		expect(await screen.findByTestId("self-media-ops-source-url")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-ops-metrics-save")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-ops-preview")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-ops-edit")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-ops-metrics-reads")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-ops-optional-toggle"))

		expect(screen.getByTestId("self-media-ops-metrics-reads")).toBeInTheDocument()
	})

	it("does not prefill optional archive fields from reference engagement data", async () => {
		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService()}
			/>,
		)

		await screen.findByTestId("self-media-ops-source-url")
		fireEvent.click(screen.getByTestId("self-media-ops-optional-toggle"))

		expect(screen.getByTestId("self-media-ops-metrics-likes")).toHaveValue("")
		expect(screen.getByTestId("self-media-ops-metrics-comments")).toHaveValue("")
		expect(screen.getByTestId("self-media-ops-comments-raw")).toHaveValue("")
	})

	it("binding a published URL does not create fake metrics, comments, or review files", async () => {
		const savePostOpsSource = vi.fn().mockResolvedValue(undefined)
		const savePostOpsMetrics = vi.fn().mockResolvedValue(undefined)
		const savePostOpsComments = vi.fn().mockResolvedValue(undefined)
		const savePostOpsReview = vi.fn().mockResolvedValue(undefined)
		const savePostOpsReviewHtml = vi.fn().mockResolvedValue(undefined)

		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService({
					savePostOpsSource,
					savePostOpsMetrics,
					savePostOpsComments,
					savePostOpsReview,
					savePostOpsReviewHtml,
				})}
			/>,
		)

		fireEvent.change(await screen.findByTestId("self-media-ops-source-url"), {
			target: { value: "https://www.xiaohongshu.com/explore/post-1" },
		})
		fireEvent.click(screen.getByTestId("self-media-ops-metrics-save"))

		await waitFor(() => {
			expect(savePostOpsSource).toHaveBeenCalled()
		})
		expect(savePostOpsMetrics).not.toHaveBeenCalled()
		expect(savePostOpsComments).not.toHaveBeenCalled()
		expect(savePostOpsReview).not.toHaveBeenCalled()
		expect(savePostOpsReviewHtml).not.toHaveBeenCalled()
	})

	it("persists metrics, feedback, and review files from the operations workspace", async () => {
		const savePostOpsMetrics = vi.fn().mockResolvedValue(undefined)
		const savePostOpsSource = vi.fn().mockResolvedValue(undefined)
		const savePostOpsComments = vi.fn().mockResolvedValue(undefined)
		const savePostOpsReviewHtml = vi.fn().mockResolvedValue(undefined)
		const fileStorageService = {
			loadPostOpsSource: vi.fn().mockResolvedValue(null),
			loadPostOpsMetrics: vi.fn().mockResolvedValue(null),
			loadPostOpsComments: vi.fn().mockResolvedValue(null),
			loadPostOpsReviewHtml: vi.fn().mockResolvedValue(null),
			loadPostOpsReview: vi.fn().mockResolvedValue(null),
			savePostOpsSource,
			savePostOpsMetrics,
			savePostOpsComments,
			savePostOpsReviewHtml,
		} as unknown as SelfMediaFileStorageService

		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={fileStorageService}
			/>,
		)

		await screen.findByTestId("self-media-ops-source-url")
		fireEvent.click(screen.getByTestId("self-media-ops-optional-toggle"))

		fireEvent.change(screen.getByTestId("self-media-ops-metrics-reads"), {
			target: { value: "3.4w" },
		})
		fireEvent.change(screen.getByTestId("self-media-ops-metrics-likes"), {
			target: { value: "1.2w" },
		})
		fireEvent.change(screen.getByTestId("self-media-ops-metrics-comments"), {
			target: { value: "128" },
		})
		fireEvent.change(screen.getByTestId("self-media-ops-source-url"), {
			target: { value: "https://www.xiaohongshu.com/explore/post-1" },
		})
		fireEvent.change(screen.getByTestId("self-media-ops-comments-summary"), {
			target: { value: "读者主要关注团队协作和转化效果。" },
		})
		fireEvent.change(screen.getByTestId("self-media-ops-comments-raw"), {
			target: {
				value: "Alice｜能不能团队一起维护？｜购买咨询\nBob｜想看真实案例｜选题建议",
			},
		})
		fireEvent.change(screen.getByTestId("self-media-ops-review-content"), {
			target: { value: "结论：选题有效。\n下一步：补一篇团队协作案例。" },
		})
		fireEvent.click(screen.getByTestId("self-media-ops-metrics-save"))

		await waitFor(() => {
			expect(savePostOpsSource).toHaveBeenCalledWith(
				"posts/post-1/post.json",
				expect.objectContaining({
					platform: "rednote",
					publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
					fetchStatus: "pending",
				}),
			)
			expect(savePostOpsMetrics).toHaveBeenCalledWith(
				"posts/post-1/post.json",
				expect.objectContaining({
					metrics: expect.objectContaining({
						reads: "3.4w",
						likes: "1.2w",
						comments: "128",
					}),
				}),
			)
			expect(savePostOpsComments).toHaveBeenCalledWith(
				"posts/post-1/post.json",
				expect.objectContaining({
					summary: "读者主要关注团队协作和转化效果。",
					comments: [
						expect.objectContaining({
							author: "Alice",
							text: "能不能团队一起维护？",
							intent: "购买咨询",
						}),
						expect.objectContaining({
							author: "Bob",
							text: "想看真实案例",
							intent: "选题建议",
						}),
					],
				}),
			)
			expect(savePostOpsReviewHtml).toHaveBeenCalledWith(
				"posts/post-1/post.json",
				expect.objectContaining({
					content: expect.stringContaining("下一步：补一篇团队协作案例。"),
				}),
			)
			const savedReviewHtml = savePostOpsReviewHtml.mock.calls[0]?.[1]?.content
			expect(savedReviewHtml).toContain('class="ops-review-report"')
			expect(savedReviewHtml).toContain("核心判断")
		})
	})

	it("preserves the existing source fetch status when saving manual archive data for the same URL", async () => {
		const savePostOpsSource = vi.fn().mockResolvedValue(undefined)
		const savePostOpsMetrics = vi.fn().mockResolvedValue(undefined)

		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService({
					loadPostOpsSource: vi.fn().mockResolvedValue({
						version: 1,
						updatedAt: "2026-06-11T08:05:00.000Z",
						platform: "rednote",
						publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
						fetchStatus: "fetched",
						lastFetchedAt: "2026-06-11T08:10:00.000Z",
					}),
					savePostOpsSource,
					savePostOpsMetrics,
				})}
			/>,
		)

		await screen.findByDisplayValue("https://www.xiaohongshu.com/explore/post-1")
		fireEvent.click(screen.getByTestId("self-media-ops-optional-toggle"))
		fireEvent.change(screen.getByTestId("self-media-ops-metrics-reads"), {
			target: { value: "3.4w" },
		})
		fireEvent.click(screen.getByTestId("self-media-ops-metrics-save"))

		await waitFor(() => {
			expect(savePostOpsSource).toHaveBeenCalledWith(
				"posts/post-1/post.json",
				expect.objectContaining({
					publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
					fetchStatus: "fetched",
					lastFetchedAt: "2026-06-11T08:10:00.000Z",
				}),
			)
		})
		expect(savePostOpsMetrics).toHaveBeenCalled()
	})

	it("preserves the existing auto sync configuration when saving source data", async () => {
		const savePostOpsSource = vi.fn().mockResolvedValue(undefined)
		const autoSync = {
			enabled: true,
			taskId: "task-1",
			timeConfig: {
				type: "weekly_repeat",
				day: "2",
				time: "10:30",
			},
			updatedAt: "2026-06-11T08:00:00.000Z",
		}

		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService({
					loadPostOpsSource: vi.fn().mockResolvedValue({
						version: 1,
						updatedAt: "2026-06-11T08:05:00.000Z",
						platform: "rednote",
						publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
						fetchStatus: "pending",
						autoSync,
					}),
					savePostOpsSource,
				})}
			/>,
		)

		await screen.findByDisplayValue("https://www.xiaohongshu.com/explore/post-1")
		fireEvent.click(screen.getByTestId("self-media-ops-metrics-save"))

		await waitFor(() => {
			expect(savePostOpsSource).toHaveBeenCalledWith(
				"posts/post-1/post.json",
				expect.objectContaining({
					publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
					autoSync,
				}),
			)
		})
	})

	it("updates auto sync before saving a changed source URL", async () => {
		const savePostOpsSource = vi.fn().mockResolvedValue(undefined)
		const onUpdateAutoSyncPublishedUrl = vi.fn().mockResolvedValue(true)
		const autoSync = {
			enabled: true,
			taskId: "task-1",
			timeConfig: {
				type: "weekly_repeat",
				day: "2",
				time: "10:30",
			},
			updatedAt: "2026-06-11T08:00:00.000Z",
		}

		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService({
					loadPostOpsSource: vi.fn().mockResolvedValue({
						version: 1,
						updatedAt: "2026-06-11T08:05:00.000Z",
						platform: "rednote",
						publishedUrl: "https://www.xiaohongshu.com/explore/old-post-1",
						fetchStatus: "pending",
						autoSync,
					}),
					savePostOpsSource,
				})}
				onUpdateAutoSyncPublishedUrl={onUpdateAutoSyncPublishedUrl}
			/>,
		)

		fireEvent.change(await screen.findByTestId("self-media-ops-source-url"), {
			target: { value: "https://www.xiaohongshu.com/explore/new-post-1" },
		})
		fireEvent.click(screen.getByTestId("self-media-ops-metrics-save"))

		await waitFor(() => {
			expect(onUpdateAutoSyncPublishedUrl).toHaveBeenCalledWith(
				buildTarget(),
				"https://www.xiaohongshu.com/explore/new-post-1",
				autoSync,
			)
		})
		expect(savePostOpsSource).toHaveBeenCalledWith(
			"posts/post-1/post.json",
			expect.objectContaining({
				publishedUrl: "https://www.xiaohongshu.com/explore/new-post-1",
				autoSync: expect.objectContaining({
					enabled: true,
					taskId: "task-1",
					timeConfig: autoSync.timeConfig,
					updatedAt: expect.any(String),
				}),
			}),
		)
	})

	it("requires the published URL before fetching published data", async () => {
		const onFetchPublishedData = vi.fn()

		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={vi.fn()}
				target={buildTarget()}
				fileStorageService={buildFileStorageService()}
				onFetchPublishedData={onFetchPublishedData}
			/>,
		)

		const fetchButton = await screen.findByTestId("self-media-ops-fetch-published-data")

		expect(fetchButton).toBeDisabled()
		fireEvent.click(fetchButton)

		expect(onFetchPublishedData).not.toHaveBeenCalled()
	})

	it("saves the published URL before asking the IP operations expert to fetch data", async () => {
		const savePostOpsSource = vi.fn().mockResolvedValue(undefined)
		const onFetchPublishedData = vi.fn().mockResolvedValue(undefined)
		const fileStorageService = buildFileStorageService({ savePostOpsSource })
		const onOpenChange = vi.fn()

		render(
			<SelfMediaOpsMetricsDialog
				open
				onOpenChange={onOpenChange}
				target={buildTarget()}
				fileStorageService={fileStorageService}
				onFetchPublishedData={onFetchPublishedData}
			/>,
		)

		fireEvent.change(await screen.findByTestId("self-media-ops-source-url"), {
			target: { value: "https://www.xiaohongshu.com/explore/post-1" },
		})
		fireEvent.click(screen.getByTestId("self-media-ops-fetch-published-data"))

		await waitFor(() => {
			expect(savePostOpsSource).toHaveBeenCalledWith(
				"posts/post-1/post.json",
				expect.objectContaining({
					platform: "rednote",
					publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
					fetchStatus: "pending",
				}),
			)
			expect(onFetchPublishedData).toHaveBeenCalledWith(
				buildTarget(),
				"https://www.xiaohongshu.com/explore/post-1",
			)
		})
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})
})

function buildFileStorageService(
	overrides: Partial<SelfMediaFileStorageService> = {},
): SelfMediaFileStorageService {
	return {
		loadPostOpsSource: vi.fn().mockResolvedValue(null),
		loadPostOpsMetrics: vi.fn().mockResolvedValue(null),
		loadPostOpsComments: vi.fn().mockResolvedValue(null),
		loadPostOpsReviewHtml: vi.fn().mockResolvedValue(null),
		loadPostOpsReview: vi.fn().mockResolvedValue(null),
		savePostOpsSource: vi.fn().mockResolvedValue(undefined),
		savePostOpsMetrics: vi.fn().mockResolvedValue(undefined),
		savePostOpsComments: vi.fn().mockResolvedValue(undefined),
		savePostOpsReviewHtml: vi.fn().mockResolvedValue(undefined),
		savePostOpsReview: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as SelfMediaFileStorageService
}

function buildTarget(): SelfMediaPlatformPostItem {
	return {
		platform: "rednote",
		index: 0,
		entry: {
			id: "post-1",
			name: "Post One",
			entry: "posts/post-1/post.json",
		},
		post: {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
				feedLikes: "1.2w",
				commentCount: "128",
			},
			cards: [],
		},
	} as SelfMediaPlatformPostItem
}
