import { useRef } from "react"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import SkillsLibrary from "./components/SkillsLibrary"

function SkillMarketDesktopPage() {
	const scrollViewportRef = useRef<HTMLDivElement | null>(null)

	return (
		<div
			className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs"
			data-testid="skill-market-page"
		>
			<ScrollArea
				className="min-h-0 flex-1 [&_[data-slot='scroll-area-viewport']>div]:!block"
				viewportRef={scrollViewportRef}
			>
				<div className="mx-auto flex w-full min-w-0 max-w-[1440px] flex-col px-4 py-5 sm:px-7 sm:py-6">
					<div className="w-full min-w-0" data-testid="skill-market-content">
						<SkillsLibrary scrollViewportRef={scrollViewportRef} />
					</div>
				</div>
			</ScrollArea>
		</div>
	)
}

export default SkillMarketDesktopPage
