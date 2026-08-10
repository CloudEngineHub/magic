import { Fragment, type ReactNode } from "react"
import { useCallback, useMemo } from "react"
import { cn } from "../../../runtime/shared/lib/utils"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import styles from "./ElementBottomToolbar.module.css"

export interface ElementBottomToolbarItem {
	id: string
	/** Same-group items are rendered without a divider; a group change creates one. */
	group?: string
	icon?: ReactNode
	label: ReactNode
	shortcut?: ReactNode
	disabled?: boolean
	loading?: boolean
	onClick: () => void
}

export interface ElementBottomToolbarSection {
	id: string
	order?: number
	group?: string
	items?: Array<ElementBottomToolbarItem | null | false | undefined>
	content?: ReactNode
}

export interface ElementBottomToolbarProps {
	items?: Array<ElementBottomToolbarItem | null | false | undefined>
	sections?: ElementBottomToolbarSection[]
	/** Floating component identifier; it must be unique within the canvas. */
	floatingId: string
	/** Whether the toolbar should be visible for the current selection/bounds. */
	shouldShow?: Parameters<typeof useElementPositionEffect>[0]["shouldShow"]
	offset?: number
	ariaLabel?: string
	className?: string
}

/**
 * 通用元素底部工具栏：负责画布定位、浮层事件转发、外壳与动作按钮呈现。
 * 图片/视频/音频的编辑和生成语义由调用方提供，不在这里判断媒体类型。
 */
export function ElementBottomToolbar(props: ElementBottomToolbarProps) {
	const {
		items,
		sections,
		floatingId,
		shouldShow,
		offset = 12,
		ariaLabel = "元素底部工具栏",
		className,
	} = props
	const visibleSections = useMemo(() => {
		if (sections) {
			return sections.filter(
				(section) => Boolean(section.content) || Boolean(section.items?.some(Boolean)),
			)
		}
		return items?.some(Boolean) ? [{ id: "items", items }] : []
	}, [items, sections])
	const isEmpty = visibleSections.length === 0

	const { containerRef: positionRef } = useElementPositionEffect({
		position: "bottom",
		offset,
		shouldShow,
	})
	const { containerRef: floatingRef } = useFloatingComponent({
		id: floatingId,
		enableWheelForwarding: true,
	})

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			positionRef.current = node
			floatingRef.current = node
		},
		[floatingRef, positionRef],
	)

	return (
		<div
			ref={setRefs}
			className={cn(styles.root, className)}
			data-canvas-ui-component
			data-empty={isEmpty || undefined}
			role="toolbar"
			aria-label={ariaLabel}
			aria-hidden={isEmpty || undefined}
		>
			{visibleSections.map((section, sectionIndex) => {
				const previousSection = visibleSections[sectionIndex - 1]
				const shouldShowSectionDivider =
					sectionIndex > 0 && section.group !== previousSection?.group
				const visibleItems = section.items?.filter(Boolean) as
					ElementBottomToolbarItem[] | undefined

				return (
					<Fragment key={section.id}>
						{shouldShowSectionDivider ? (
							<div className={styles.divider} aria-hidden />
						) : null}
						{section.content ? (
							<div className={styles.content}>{section.content}</div>
						) : null}
						{visibleItems?.map((item, itemIndex) => {
							const previousItem = visibleItems[itemIndex - 1]
							const shouldShowItemDivider =
								itemIndex > 0 &&
								(item.group !== undefined || previousItem?.group !== undefined) &&
								item.group !== previousItem?.group

							return (
								<Fragment key={item.id}>
									{shouldShowItemDivider ? (
										<div className={styles.divider} aria-hidden />
									) : null}
									<div className={styles.item}>
										<button
											type="button"
											className={styles.button}
											disabled={item.disabled || item.loading}
											aria-busy={item.loading || undefined}
											onClick={item.onClick}
										>
											{item.icon}
											<span>{item.label}</span>
											{item.shortcut ? (
												<span className={styles.shortcut}>
													{item.shortcut}
												</span>
											) : null}
										</button>
									</div>
								</Fragment>
							)
						})}
					</Fragment>
				)
			})}
		</div>
	)
}
