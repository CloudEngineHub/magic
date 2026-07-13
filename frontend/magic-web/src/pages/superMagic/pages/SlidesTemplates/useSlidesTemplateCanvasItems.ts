import { useLayoutEffect, useRef, useState } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { SlidesTemplateCanvasLayoutService } from "./SlidesTemplateCanvasLayoutService"

interface UseSlidesTemplateCanvasItemsInput {
	templates: OptionItem[]
}

export function useSlidesTemplateCanvasItems({ templates }: UseSlidesTemplateCanvasItemsInput) {
	const layoutServiceRef = useRef<SlidesTemplateCanvasLayoutService | null>(null)
	if (!layoutServiceRef.current) {
		layoutServiceRef.current = new SlidesTemplateCanvasLayoutService()
	}
	const layoutService = layoutServiceRef.current
	const [snapshot, setSnapshot] = useState(() => layoutService.getSnapshot())

	useLayoutEffect(() => {
		const nextSnapshot = layoutService.synchronize(templates)
		setSnapshot((currentSnapshot) =>
			currentSnapshot.canvasItems === nextSnapshot.canvasItems
				? currentSnapshot
				: nextSnapshot,
		)
	}, [layoutService, templates])

	return snapshot
}
