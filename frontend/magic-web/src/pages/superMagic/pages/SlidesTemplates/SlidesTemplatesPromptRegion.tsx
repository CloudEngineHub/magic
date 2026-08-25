import { motion, useReducedMotion } from "framer-motion"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplatePromptDock from "./SlidesTemplatePromptDock"

interface SlidesTemplatesPromptRegionProps {
	selectedTemplate: OptionItem | null
	onClearSelectedTemplate: () => void
	onFindSimilarColors?: (template: OptionItem) => void
	onPreviewSelectedTemplate: () => void
}

export default function SlidesTemplatesPromptRegion({
	selectedTemplate,
	onClearSelectedTemplate,
	onFindSimilarColors,
	onPreviewSelectedTemplate,
}: SlidesTemplatesPromptRegionProps) {
	const reduceMotion = useReducedMotion()

	return (
		<div
			className={
				selectedTemplate
					? "relative grid grid-rows-[1fr]"
					: "relative grid grid-rows-[0fr] transition-none"
			}
			data-testid="slides-templates-page-prompt-region"
		>
			<div className="min-h-0 overflow-hidden">
				{/* 提前挂载编辑器，首次选择模板时只切换可见性，避免初始化导致整页闪动。 */}
				<motion.div
					initial={false}
					animate={{
						opacity: selectedTemplate ? 1 : 0,
						y: selectedTemplate ? 0 : 6,
					}}
					transition={
						reduceMotion
							? { duration: 0 }
							: { duration: 0.14, ease: [0.22, 1, 0.36, 1] }
					}
					className={
						selectedTemplate
							? "flex flex-col"
							: "pointer-events-none invisible flex flex-col"
					}
					aria-hidden={!selectedTemplate}
					data-testid="slides-templates-page-prompt-panel"
				>
					<SlidesTemplatePromptDock
						selectedTemplate={selectedTemplate}
						onFindSimilarColors={onFindSimilarColors}
						onPreviewSelectedTemplate={onPreviewSelectedTemplate}
						onClearSelectedTemplate={onClearSelectedTemplate}
					/>
				</motion.div>
			</div>
		</div>
	)
}
