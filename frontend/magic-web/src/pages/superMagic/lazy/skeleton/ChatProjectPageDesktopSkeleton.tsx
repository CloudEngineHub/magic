import TopicPageDesktopSkeleton from "./TopicPageDesktopSkeleton"
import { Skeleton } from "@/components/shadcn-ui/skeleton"

/** Desktop chat detail skeleton reuses topic layout with a compact header placeholder. */
function ChatProjectPageDesktopSkeleton() {
	return (
		<div
			className="flex h-full min-h-0 w-full flex-col"
			data-testid="chat-project-page-desktop-skeleton"
		>
			<div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<Skeleton className="h-4 w-40 rounded-sm" />
					<Skeleton className="h-3 w-24 rounded-sm" />
				</div>
				<Skeleton className="size-7 rounded-md" />
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				<TopicPageDesktopSkeleton />
			</div>
		</div>
	)
}

export default ChatProjectPageDesktopSkeleton
