import { observer } from "mobx-react-lite"
import { useCurrentSceneConfig } from "@/pages/superMagic/components/MainInputContainer/hooks/useCurrentSceneConfig"
import ScenePanelContainer from "@/pages/superMagic/components/MainInputContainer/components/ScenePanelContainer"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import VideoProductionConfigPanel from "@/pages/superMagic/components/MainInputContainer/components/VideoProductionConfigPanel"
import { isVideoProductionContext } from "@/pages/superMagic/components/MainInputContainer/utils/videoProductionConfig"
import { cn } from "@/utils/cn"

interface MobileScenePanelsProps {
	editorContext: SceneEditorContext
	compact?: boolean
	renderScenePanels?: boolean
	includeVideoProductionConfig?: boolean
}

function MobileScenePanelsComponent({
	editorContext,
	compact = false,
	renderScenePanels = true,
	includeVideoProductionConfig = false,
}: MobileScenePanelsProps) {
	const { panels, isLoading } = useCurrentSceneConfig({
		topicMode: editorContext.topicMode,
	})
	const shouldShowVideoProductionConfig =
		includeVideoProductionConfig &&
		(editorContext.messagesLength ?? 0) === 0 &&
		isVideoProductionContext({
			topicMode: editorContext.topicMode,
			agentCode: editorContext.agentCode,
			selectedTopic: editorContext.selectedTopic,
		})

	const handleTemplateSelect = () => undefined
	const handleFilterChange = () => undefined

	const shouldRenderScenePanels = renderScenePanels && (isLoading || panels.length > 0)
	if (!shouldRenderScenePanels && !shouldShowVideoProductionConfig) return null

	return (
		<div
			className={cn("min-w-0 flex-1", compact && "flex items-center overflow-hidden")}
			data-testid={compact ? "mobile-scene-panels-compact" : "mobile-scene-panels"}
		>
			{shouldRenderScenePanels ? (
				<ScenePanelContainer
					panels={panels}
					loading={isLoading}
					onTemplateSelect={handleTemplateSelect}
					onFilterChange={handleFilterChange}
					compact={compact}
				/>
			) : null}
			{shouldShowVideoProductionConfig ? (
				<VideoProductionConfigPanel
					topicMode={editorContext.topicMode}
					agentCode={editorContext.agentCode}
					selectedTopic={editorContext.selectedTopic}
					messagesLength={editorContext.messagesLength}
				/>
			) : null}
		</div>
	)
}

const MobileScenePanels = observer(MobileScenePanelsComponent)

export default MobileScenePanels
