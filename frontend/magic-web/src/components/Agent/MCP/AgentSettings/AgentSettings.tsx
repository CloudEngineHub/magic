import { useStyles } from "./styles"
import {
	useMemo,
	useState,
	useRef,
	createElement,
	isValidElement,
	cloneElement,
	ReactElement,
} from "react"
import { MCPPanel } from "./AgentPanel"
import {
	/** IconClockPlay, IconMailShare, IconHeart, */ IconX,
	IconPlug,
} from "@tabler/icons-react"
import type { AgentCommonModalChildrenProps } from "../../AgentCommonModal"
import { useTranslation } from "react-i18next"
import { Tabs } from "antd-mobile"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useSize } from "ahooks"

// Switch to the single-column settings shell before the desktop split view becomes cramped.
const COMPACT_LAYOUT_BREAKPOINT = 760

export const enum PanelType {
	MCP = "MCP",
	// ScheduledTasks = "ScheduledTasks",
}

export interface AgentCommonProps extends AgentCommonModalChildrenProps {
	defaultPanel?: PanelType
	/** Storage value (affected by the business scope of MCP, currently it needs to be associated with the Super Maggie project when using MCP configuration in Super Maggie) */
	storageKey?: string
	onSuccessCallback?: () => void
	/** 是否使用临时存储模式 */
	useTempStorage?: boolean
}

export default function AgentSettings(props: AgentCommonProps) {
	const { onClose, defaultPanel, storageKey, onSuccessCallback, useTempStorage } = props

	const { styles, cx } = useStyles()
	const { t } = useTranslation("agent")
	const isMobile = useIsMobile()
	const containerRef = useRef<HTMLDivElement>(null)
	const containerSize = useSize(containerRef)
	// Measure the actual embedded container so narrow desktop iframes get a usable layout.
	const isCompactLayout =
		!isMobile &&
		containerSize?.width !== undefined &&
		containerSize.width < COMPACT_LAYOUT_BREAKPOINT

	const [panelType, setPanelType] = useState(defaultPanel || PanelType.MCP)

	const menu = useMemo(() => {
		return {
			[PanelType.MCP]: {
				key: PanelType.MCP,
				label: t("common.settings.mcp"),
				icon: IconPlug,
				component: (
					<MCPPanel
						onSuccessCallback={onSuccessCallback}
						storageKey={storageKey}
						useTempStorage={useTempStorage}
						compact={isCompactLayout}
					/>
				),
			},
			// [PanelType.ScheduledTasks]: {
			// 	key: PanelType.ScheduledTasks,
			// 	icon: IconClockPlay,
			// 	label: t("common.settings.tasks"),
			// 	component: ScheduledTasksPanel,
			// },
		}
	}, [isCompactLayout, onSuccessCallback, storageKey, t, useTempStorage])

	const panel = useMemo(() => {
		const child: ReactElement<AgentCommonModalChildrenProps> = menu[panelType]?.component
		return (
			<div className={styles.wrapper}>
				{child && isValidElement(child) && cloneElement(child, { onClose })}
			</div>
		)
	}, [menu, onClose, panelType, styles.wrapper])

	if (isMobile || isCompactLayout) {
		return (
			<div
				ref={containerRef}
				className={cx(styles.mobileLayout, isCompactLayout && styles.compactLayout)}
			>
				<div className={styles.mobileHeader}>
					<Tabs onChange={(e) => setPanelType(e as PanelType)}>
						{(Object.keys(menu) as Array<keyof typeof menu>).map((key) => {
							const o = menu[key]
							return (
								<Tabs.Tab
									title={
										<div
											className={cx(styles.panelItem, {
												[styles.mobileActive]: key === panelType,
											})}
										>
											{o?.icon && createElement(o.icon, { size: 16 })}
											<span>{o?.label}</span>
										</div>
									}
									key={o.key}
								/>
							)
						})}
					</Tabs>
					<div className={styles.headerClose} onClick={onClose}>
						<IconX size={24} />
					</div>
				</div>
				{panel}
			</div>
		)
	}

	return (
		<div ref={containerRef} className={styles.layout}>
			<div className={styles.panel}>
				{/*<div className={styles.panelGroup}>*/}
				{/*	<div className={styles.panelHeader}>{t("common.settings.title")}</div>*/}
				{/*	<div className={styles.panelItem}>*/}
				{/*		<IconHeart size={16} />*/}
				{/*		{t("common.settings.usage")}*/}
				{/*	</div>*/}
				{/*</div>*/}
				<div className={styles.panelGroup}>
					<div className={styles.panelHeader}>{t("common.settings.func")}</div>
					{(Object.keys(menu) as Array<keyof typeof menu>).map((key) => {
						const item = menu[key]
						return (
							<div
								key={key}
								onClick={() => setPanelType(key)}
								className={cx(styles.panelItem, {
									[styles.active]: key === panelType,
								})}
							>
								{item?.icon && createElement(item.icon, { size: 16 })}
								{item.label}
							</div>
						)
					})}
				</div>
				{/*<div className={cx(styles.panelItem, styles.paneFooter)}>*/}
				{/*	<IconMailShare size={16} />*/}
				{/*	{t("common.settings.contact")}*/}
				{/*</div>*/}
			</div>
			{panel}
		</div>
	)
}
