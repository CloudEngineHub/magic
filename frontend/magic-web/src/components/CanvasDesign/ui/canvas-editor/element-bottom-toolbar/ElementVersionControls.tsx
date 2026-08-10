import { ChevronLeft, ChevronRight, Crown, Trash2 } from "lucide-react"
import { useCallback, useMemo } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import {
	getActiveContent,
	getContents,
	getMainContent,
} from "../../../runtime/document/elementContent"
import { GenerationStatus } from "../../../public/magic-types"
import { isContentVersionOperations } from "../../../runtime/elements/core/ContentVersionOperations"
import type { AudioElement, ImageElement, VideoElement } from "../../../runtime/document/types"
import styles from "./ElementVersionControls.module.css"
import { useIsMediaReplacing } from "../../../app/hooks/canvas"

type VersionElement = ImageElement | VideoElement | AudioElement

interface ElementVersionControlsProps {
	element: VersionElement
}

function canUseAsMain(
	element: VersionElement,
	content: VersionElement["contents"][number] | undefined,
) {
	if (!content?.src) return false
	if (element.type === "audio") return true
	return "status" in content && content.status === GenerationStatus.Completed
}

export default function ElementVersionControls({ element }: ElementVersionControlsProps) {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const contents = getContents(element)
	const activeContent = getActiveContent(element)
	const activeIndex = Math.max(
		0,
		contents.findIndex((content) => content.contentId === activeContent?.contentId),
	)
	const mainContent = getMainContent(element)
	const instance = canvas?.elementManager.getElementInstance(element.id)
	const operations = isContentVersionOperations(instance) ? instance : null
	const isReplacing = useIsMediaReplacing(element.id)

	const isActivePending =
		element.type !== "audio" &&
		"status" in (activeContent ?? {}) &&
		(activeContent.status === GenerationStatus.Pending ||
			activeContent.status === GenerationStatus.Processing)
	const canDelete = contents.length > 1 && !isActivePending && !isReplacing && Boolean(operations)
	const canSetMain =
		Boolean(operations) &&
		!isReplacing &&
		Boolean(activeContent) &&
		canUseAsMain(element, activeContent) &&
		activeContent?.contentId !== mainContent?.contentId

	const switchActive = useCallback(
		(contentId: string) => {
			if (isReplacing) return
			operations?.switchActiveContent(contentId)
		},
		[isReplacing, operations],
	)

	const handleSetMain = useCallback(() => {
		if (isReplacing || !activeContent) return
		operations?.setMainContent(activeContent.contentId)
	}, [activeContent, isReplacing, operations])

	const handleDelete = useCallback(() => {
		if (isReplacing || !canDelete || !operations) return
		void Promise.resolve(operations.deleteActiveContent())
	}, [canDelete, isReplacing, operations])

	const label = useMemo(
		() =>
			t("elementBottomToolbar.versionCount", {
				defaultValue: "{{current}}/{{total}}",
				current: activeIndex + 1,
				total: contents.length,
			}),
		[activeIndex, contents.length, t],
	)

	if (contents.length <= 1 || !operations) return null

	return (
		<div className={styles.root} data-testid="element-version-controls">
			<button
				type="button"
				className={styles.iconButton}
				disabled={isReplacing || activeIndex <= 0}
				aria-label={t("elementBottomToolbar.previousVersion", "上一个版本")}
				onClick={() => switchActive(contents[activeIndex - 1].contentId)}
			>
				<ChevronLeft size={14} />
			</button>
			<span className={styles.count} aria-live="polite">
				{label}
			</span>
			<button
				type="button"
				className={styles.iconButton}
				disabled={isReplacing || activeIndex >= contents.length - 1}
				aria-label={t("elementBottomToolbar.nextVersion", "下一个版本")}
				onClick={() => switchActive(contents[activeIndex + 1].contentId)}
			>
				<ChevronRight size={14} />
			</button>
			<button
				type="button"
				className={styles.actionButton}
				disabled={!canSetMain}
				aria-label={
					mainContent?.contentId === activeContent?.contentId
						? t("elementBottomToolbar.mainVersion", "主版本")
						: t("elementBottomToolbar.setMainVersion", "设为主版本")
				}
				onClick={handleSetMain}
			>
				<Crown size={14} />
				<span>
					{mainContent?.contentId === activeContent?.contentId
						? t("elementBottomToolbar.mainVersion", "主版本")
						: t("elementBottomToolbar.setMainVersion", "设为主版本")}
				</span>
			</button>
			<button
				type="button"
				className={styles.actionButton}
				disabled={!canDelete}
				aria-label={t("elementBottomToolbar.deleteVersion", "删除版本")}
				onClick={handleDelete}
			>
				<Trash2 size={14} />
				<span>{t("elementBottomToolbar.deleteVersion", "删除版本")}</span>
			</button>
		</div>
	)
}
