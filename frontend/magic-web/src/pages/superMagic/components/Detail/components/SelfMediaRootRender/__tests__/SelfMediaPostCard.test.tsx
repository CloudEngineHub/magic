import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SelfMediaPostCard from "../components/SelfMediaPostCard"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"detail.selfMedia.home.dataSyncNow": "Sync now",
				"detail.selfMedia.home.autoSync": "Auto sync",
				"detail.selfMedia.home.autoSyncDescription": "Run on a schedule",
				"detail.selfMedia.home.autoSyncStatus": "Status",
				"detail.selfMedia.home.autoSyncEnabled": "On",
				"detail.selfMedia.home.autoSyncDisabled": "Off",
				"detail.selfMedia.home.autoSyncDaily": "Daily",
				"detail.selfMedia.home.autoSyncWeekly": "Weekly",
				"detail.selfMedia.home.autoSyncMonthly": "Monthly",
				"detail.selfMedia.home.autoSyncSave": "Save auto sync",
				"detail.selfMedia.home.autoSyncTurnOff": "Turn off auto sync",
				"detail.selfMedia.home.loadingAutoSync": "Loading auto sync",
				"detail.selfMedia.home.bindPublishedLink": "Connect published link",
				"detail.selfMedia.home.editPublishedLink": "Change published link",
				"detail.selfMedia.home.publishedLinkInput": "Published content link",
				"detail.selfMedia.home.publishedLinkPlaceholder": "Paste the link",
				"detail.selfMedia.home.loadingPublishedLink": "Loading link...",
				"detail.selfMedia.home.bindPublishedLinkAction": "Save link",
				"detail.selfMedia.home.bindAndFetchPublishedData": "Save and fetch",
				"detail.selfMedia.home.opsArtifacts.sourceReady": "Source ready",
				"detail.selfMedia.home.opsArtifacts.sourceMissing": "Source missing",
				"detail.selfMedia.home.opsArtifacts.metricsReady": "Metrics ready",
				"detail.selfMedia.home.opsArtifacts.metricsMissing": "Metrics missing",
				"detail.selfMedia.home.opsArtifacts.commentsReady": "Comments ready",
				"detail.selfMedia.home.opsArtifacts.commentsMissing": "Comments missing",
				"detail.selfMedia.home.opsArtifacts.reviewReady": "Review ready",
				"detail.selfMedia.home.opsArtifacts.reviewMissing": "Review missing",
			})[key] || key,
	}),
}))

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../components/CardFrame", () => ({
	default: () => <div data-testid="mock-card-frame" />,
}))

vi.mock("../platforms/wechat-official-accounts/useCoverImageUrl", () => ({
	useCoverImageUrl: () => ({ url: "" }),
}))

function createPostItem(): SelfMediaPlatformPostItem {
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
			},
			cards: [],
		},
	}
}

function renderCard(props: Partial<React.ComponentProps<typeof SelfMediaPostCard>> = {}) {
	return render(
		<SelfMediaPostCard
			item={createPostItem()}
			title="Post One"
			subtitle="Post subtitle"
			postId="post-1"
			opsArtifacts={{ source: true, metrics: false, comments: false, review: false }}
			onOpenPost={vi.fn()}
			onPostPublishRefresh={vi.fn()}
			onConfigureAutoSync={vi.fn()}
			{...props}
		/>,
	)
}

describe("SelfMediaPostCard", () => {
	it("uses the data action as immediate sync and opens auto sync settings on hover", async () => {
		const onPostPublishRefresh = vi.fn().mockResolvedValue(undefined)
		renderCard({ onPostPublishRefresh })

		const trigger = screen.getByTestId("self-media-home-post-ops-data-post-1")
		expect(trigger).toHaveTextContent("Sync now")

		fireEvent.click(trigger)
		await waitFor(() => expect(onPostPublishRefresh).toHaveBeenCalledTimes(1))
		expect(
			screen.queryByTestId("self-media-home-post-data-popover-post-1"),
		).not.toBeInTheDocument()

		fireEvent.mouseEnter(trigger)
		expect(
			await screen.findByTestId("self-media-home-post-data-popover-post-1"),
		).toHaveTextContent("Auto sync")
		expect(
			screen.queryByTestId("self-media-home-post-data-sync-now-post-1"),
		).not.toBeInTheDocument()
	})

	it("hides the auto sync form while loading saved configuration", async () => {
		let resolveSource: (value: null) => void = () => undefined
		const onLoadOpsSource = vi.fn(
			() =>
				new Promise<null>((resolve) => {
					resolveSource = resolve
				}),
		)
		renderCard({ onLoadOpsSource })

		fireEvent.mouseEnter(screen.getByTestId("self-media-home-post-ops-data-post-1"))

		expect(
			await screen.findByTestId("self-media-home-post-auto-sync-loading-post-1"),
		).toHaveTextContent("Loading auto sync")
		expect(
			screen.queryByTestId("self-media-home-post-auto-sync-enabled-post-1"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-home-post-auto-sync-save-post-1"),
		).not.toBeInTheDocument()

		resolveSource(null)
		expect(
			await screen.findByTestId("self-media-home-post-auto-sync-enabled-post-1"),
		).toBeInTheDocument()

		fireEvent.mouseEnter(screen.getByTestId("self-media-home-post-data-popover-post-1"))
		expect(
			screen.queryByTestId("self-media-home-post-auto-sync-loading-post-1"),
		).not.toBeInTheDocument()
		expect(
			screen.getByTestId("self-media-home-post-auto-sync-enabled-post-1"),
		).toBeInTheDocument()
	})

	it("opens the bind link form directly when the card is already in the no-link state", async () => {
		const onLoadPublishedUrl = vi.fn().mockResolvedValue("https://example.com/existing")
		renderCard({
			opsArtifacts: { source: false, metrics: false, comments: false, review: false },
			onLoadPublishedUrl,
			onBindPublishedUrl: vi.fn(),
		})

		fireEvent.click(screen.getByTestId("self-media-home-post-bind-link-post-1"))

		expect(
			await screen.findByTestId("self-media-home-post-bind-link-input-post-1"),
		).toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-home-post-bind-link-loading-post-1"),
		).not.toBeInTheDocument()
		expect(onLoadPublishedUrl).not.toHaveBeenCalled()
	})

	it("marks created and updated artifact buttons with their matching animations", () => {
		renderCard({
			opsArtifacts: { source: true, metrics: true, comments: false, review: false },
			opsArtifactAnimations: { source: "created", metrics: "updated" },
			onLoadPublishedUrl: vi.fn(),
			onBindPublishedUrl: vi.fn(),
		})

		const source = screen.getByTestId("self-media-home-post-ops-artifact-post-1-source")
		const metrics = screen.getByTestId("self-media-home-post-ops-artifact-post-1-metrics")

		expect(source).toHaveAttribute("data-animation", "created")
		expect(metrics).toHaveAttribute("data-animation", "updated")
		expect(
			screen.getByTestId("self-media-home-post-ops-artifact-confetti-post-1-source"),
		).toBeInTheDocument()
		expect(metrics).toHaveClass("animate-bounce")
	})
})
