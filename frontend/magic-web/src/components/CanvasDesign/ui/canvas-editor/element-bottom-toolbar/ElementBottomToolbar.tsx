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

export interface ElementBottomToolbarProps {
	items: Array<ElementBottomToolbarItem | null | false | undefined>
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
		floatingId,
		shouldShow,
		offset = 12,
		ariaLabel = "元素底部工具栏",
		className,
	} = props
	const visibleItems = useMemo(() => items.filter(Boolean) as ElementBottomToolbarItem[], [items])
	const isEmpty = visibleItems.length === 0

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
			{visibleItems.map((item, index) => {
				const previousItem = visibleItems[index - 1]
				const shouldShowDivider =
					index > 0 &&
					(item.group !== undefined || previousItem?.group !== undefined) &&
					item.group !== previousItem?.group

				return (
					<Fragment key={item.id}>
						{shouldShowDivider ? <div className={styles.divider} aria-hidden /> : null}
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
									<span className={styles.shortcut}>{item.shortcut}</span>
								) : null}
							</button>
						</div>
					</Fragment>
				)
			})}
		</div>
	)
}
