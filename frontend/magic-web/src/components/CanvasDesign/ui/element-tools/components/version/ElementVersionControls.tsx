import { ChevronLeft, ChevronRight, Crown, Trash2 } from "lucide-react"
import { useCallback, useMemo } from "react"
import { ElementToolTypeEnum } from "../../../../public/props"
import type { ElementToolType } from "../../../../public/props"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import type { AudioElement, ImageElement, VideoElement } from "../../../../runtime/document/types"
import styles from "./ElementVersionControls.module.css"
import type { ElementToolResolution } from "../../../../runtime/element-tools"

type VersionElement = ImageElement | VideoElement | AudioElement

interface ElementVersionControlsProps {
	/** Kept for compatibility with existing direct consumers; Resolver owns the state. */
	element?: VersionElement
	tools: readonly ElementToolResolution[]
}

export default function ElementVersionControls({ tools }: ElementVersionControlsProps) {
	const { t } = useCanvasDesignI18n()
	const toolsById = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools])
	const versionData = toolsById.get(ElementToolTypeEnum.VersionCount)?.data?.version
	const activeIndex = Math.max(0, (versionData?.current ?? 1) - 1)
	const total = versionData?.total ?? 0
	const isMain = versionData?.isMain ?? false
	const getTool = useCallback((toolId: ElementToolType) => toolsById.get(toolId), [toolsById])
	const canDelete = getTool(ElementToolTypeEnum.VersionDelete)?.visibility === "visible"
	const canSetMain = getTool(ElementToolTypeEnum.VersionSetMain)?.visibility === "visible"

	const switchActive = useCallback(
		(
			toolId:
				| typeof ElementToolTypeEnum.VersionPrevious
				| typeof ElementToolTypeEnum.VersionNext,
		) => {
			void Promise.resolve(getTool(toolId)?.execute?.())
		},
		[getTool],
	)

	const handleSetMain = useCallback(() => {
		void Promise.resolve(getTool(ElementToolTypeEnum.VersionSetMain)?.execute?.())
	}, [getTool])

	const handleDelete = useCallback(() => {
		if (!canDelete) return
		void Promise.resolve(getTool(ElementToolTypeEnum.VersionDelete)?.execute?.())
	}, [canDelete, getTool])

	const label = useMemo(
		() =>
			t("elementBottomToolbar.versionCount", {
				defaultValue: "{{current}}/{{total}}",
				current: activeIndex + 1,
				total,
			}),
		[activeIndex, t, total],
	)
	if (total <= 1 || tools.length === 0) return null

	return (
		<div className={styles.root} data-testid="element-version-controls">
			<button
				type="button"
				className={styles.iconButton}
				disabled={
					activeIndex <= 0 ||
					getTool(ElementToolTypeEnum.VersionPrevious)?.visibility !== "visible"
				}
				aria-label={t("elementBottomToolbar.previousVersion", "上一个版本")}
				onClick={() => switchActive(ElementToolTypeEnum.VersionPrevious)}
			>
				<ChevronLeft size={14} />
			</button>
			<span className={styles.count} aria-live="polite">
				{label}
			</span>
			<button
				type="button"
				className={styles.iconButton}
				disabled={
					activeIndex >= total - 1 ||
					getTool(ElementToolTypeEnum.VersionNext)?.visibility !== "visible"
				}
				aria-label={t("elementBottomToolbar.nextVersion", "下一个版本")}
				onClick={() => switchActive(ElementToolTypeEnum.VersionNext)}
			>
				<ChevronRight size={14} />
			</button>
			{getTool(ElementToolTypeEnum.VersionSetMain) && (
				<button
					type="button"
					className={styles.actionButton}
					disabled={!canSetMain || isMain}
					aria-label={
						isMain
							? t("elementBottomToolbar.mainVersion", "主版本")
							: t("elementBottomToolbar.setMainVersion", "设为主版本")
					}
					onClick={handleSetMain}
				>
					<Crown size={14} />
					<span>
						{isMain
							? t("elementBottomToolbar.mainVersion", "主版本")
							: t("elementBottomToolbar.setMainVersion", "设为主版本")}
					</span>
				</button>
			)}
			{getTool(ElementToolTypeEnum.VersionDelete) && (
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
			)}
		</div>
	)
}
