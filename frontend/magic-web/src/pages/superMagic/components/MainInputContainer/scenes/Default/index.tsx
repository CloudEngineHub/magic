import usePortalTarget from "@/hooks/usePortalTarget"
import { SCENE_INPUT_IDS, SCENE_ANIMATION_CONFIG } from "../../constants"
import { createPortal } from "react-dom"
import { useCallback, useEffect, useRef, useState } from "react"
import type { OptionItem, FieldItem } from "../../panels/types"
import { AnimatePresence, motion } from "framer-motion"
import ScenePanelContainer from "../../components/ScenePanelContainer"
import { observer } from "mobx-react-lite"
import DefaultMessageEditorContainer from "../../components/editors/DefaultMessageEditorContainer"
import { ScenePanelComponentBaseProps } from "../../types"
import { useCurrentSceneConfig } from "../../hooks"
import { useIsMobile } from "@/hooks/useIsMobile"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import SlidesTemplateHomeSelectionPreview from "../Slides/SlidesTemplateHomeSelectionPreview"
import { ScenePanelVariant } from "../../components/LazyScenePanel/types"
import { useOptionalScenePanelVariant } from "../../stores"

interface DefaultInputContainerProps extends ScenePanelComponentBaseProps {}

function DefaultInputContainer({ editorContext, editorNodes }: DefaultInputContainerProps) {
	const { placeholder, panels, isLoading } = useCurrentSceneConfig({
		topicMode: editorContext?.topicMode,
	})
	const isMobile = useIsMobile()
	const [selectedSlidesTemplate, setSelectedSlidesTemplate] = useState<OptionItem | null>(null)
	const [selectedSlidesFilters, setSelectedSlidesFilters] = useState<FieldItem[]>([])
	const slidesFilterChangeRef = useRef<((filterId: string, value: string) => void) | null>(null)
	const [slidesTemplatePickerContainer, setSlidesTemplatePickerContainer] =
		useState<HTMLDivElement | null>(null)
	const isSlidesMode = editorContext?.topicMode === TopicMode.PPT
	const variant = useOptionalScenePanelVariant()
	const isProjectScene = variant === ScenePanelVariant.TopicPage

	useEffect(() => {
		if (!isSlidesMode) {
			setSelectedSlidesTemplate(null)
			setSelectedSlidesFilters([])
		}
	}, [isSlidesMode])

	const editorPortalTarget = usePortalTarget({
		portalId: SCENE_INPUT_IDS.INPUT_CONTAINER,
	})

	const handleTemplateSelect = (template: OptionItem | null) => {
		if (isSlidesMode) setSelectedSlidesTemplate(template)
		if (!template) return

		console.log("Template selected:", template)
		// 项目页的纵向滚动归 MessageList 管理；选择模板不应改变它的位置。
		// 首页才需要回到工作区顶部，以展示已选择模板的编辑器。
		if (!isProjectScene) {
			requestAnimationFrame(() => {
				const workspaceViewport = document.querySelector<HTMLElement>(
					'[data-testid="main-workspace-container"] [data-slot="scroll-area-viewport"]',
				)
				workspaceViewport?.scrollTo({ top: 0, behavior: "smooth" })
			})
		}

		let attemptCount = 0
		const tryFocus = () => {
			const editor = editorContext?.editorRef?.current?.editor
			if (editor && !editor.isDestroyed) {
				editorContext?.editorRef?.current?.focus?.({
					enableWhenIsMobile: false,
					preventScroll: true,
				})
				return
			}
			attemptCount++
			if (attemptCount >= 20) return
			window.setTimeout(tryFocus, 100)
		}
		window.setTimeout(tryFocus, 300)
	}

	const handleFilterChange = (filters: FieldItem[]) => {
		if (isSlidesMode) setSelectedSlidesFilters(filters)
		console.log("Filters changed:", filters)
	}

	const handleSlidesFilterChange = (filterId: string, value: string) => {
		slidesFilterChangeRef.current?.(filterId, value)
	}

	const handleSlidesTemplatePickerContainerChange = useCallback(
		(container: HTMLDivElement | null) => {
			setSlidesTemplatePickerContainer(container)
		},
		[],
	)

	const editorNode =
		editorPortalTarget &&
		editorContext &&
		createPortal(
			<AnimatePresence mode="wait">
				<motion.div
					key="slides-editor"
					initial={SCENE_ANIMATION_CONFIG.initial}
					animate={SCENE_ANIMATION_CONFIG.animate}
					exit={SCENE_ANIMATION_CONFIG.exit}
					transition={SCENE_ANIMATION_CONFIG.transition}
				>
					<div className="flex flex-col gap-2">
						<DefaultMessageEditorContainer
							editorContext={{
								...editorContext,
								placeholder,
							}}
							editorNodes={editorNodes}
						/>
						{isSlidesMode ? (
							<SlidesTemplateHomeSelectionPreview
								template={selectedSlidesTemplate}
								filters={selectedSlidesFilters}
								onClear={
									selectedSlidesTemplate
										? () => setSelectedSlidesTemplate(null)
										: undefined
								}
								onFilterChange={handleSlidesFilterChange}
								onTemplatePickerContainerChange={
									isProjectScene
										? handleSlidesTemplatePickerContainerChange
										: undefined
								}
							/>
						) : null}
					</div>
				</motion.div>
			</AnimatePresence>,
			editorPortalTarget,
		)

	return (
		<>
			{!isMobile && editorNode}
			<ScenePanelContainer
				panels={panels}
				loading={isLoading}
				selectedTemplate={isSlidesMode ? selectedSlidesTemplate : undefined}
				onSlidesFilterChangeRequestChange={(handler) => {
					slidesFilterChangeRef.current = handler
				}}
				slidesTemplatePickerContainer={slidesTemplatePickerContainer}
				onTemplateSelect={handleTemplateSelect}
				onFilterChange={handleFilterChange}
			/>
			{isMobile && editorNode}
		</>
	)
}

export default observer(DefaultInputContainer)
