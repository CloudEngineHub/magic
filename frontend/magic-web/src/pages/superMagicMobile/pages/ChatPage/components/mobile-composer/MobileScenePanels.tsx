import { observer } from "mobx-react-lite"
import { useCurrentSceneConfig } from "@/pages/superMagic/components/MainInputContainer/hooks/useCurrentSceneConfig"
import ScenePanelContainer from "@/pages/superMagic/components/MainInputContainer/components/ScenePanelContainer"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { isMobileScenePanelRenderable } from "@/pages/superMagic/components/MainInputContainer/panels/utils"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { cn } from "@/utils/cn"

interface MobileScenePanelsProps {
	editorContext: SceneEditorContext
	compact?: boolean
}

function MobileScenePanelsComponent({ editorContext, compact = false }: MobileScenePanelsProps) {
	const { panels, isLoading } = useCurrentSceneConfig({
		topicMode: editorContext.topicMode,
	})

	const handleTemplateSelect = () => undefined
	const handleFilterChange = () => undefined
	// Mirror each mobile renderer's visibility rules so empty child panels do not leave
	// the mobile composer padding and separator visible.
	const hasRenderablePanels = panels.some(
		(panel) => panel.type === SkillPanelType.FIELD && isMobileScenePanelRenderable(panel),
	)

	if (!isLoading && !hasRenderablePanels) return null

	return (
		<div
			className={cn("min-w-0 flex-1", compact && "flex items-center overflow-hidden")}
			data-testid={compact ? "mobile-scene-panels-compact" : "mobile-scene-panels"}
		>
			<ScenePanelContainer
				panels={panels}
				loading={isLoading}
				onTemplateSelect={handleTemplateSelect}
				onFilterChange={handleFilterChange}
				compact={compact}
			/>
		</div>
	)
}

const MobileScenePanels = observer(MobileScenePanelsComponent)

export default MobileScenePanels
