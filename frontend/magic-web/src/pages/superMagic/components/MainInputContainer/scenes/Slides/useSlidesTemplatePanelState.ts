import { useSlidesTemplateCatalogState } from "./useSlidesTemplateCatalogState"

export function useSlidesTemplatePanelState() {
	return useSlidesTemplateCatalogState()
}

export type SlidesTemplatePanelState = ReturnType<typeof useSlidesTemplatePanelState>
