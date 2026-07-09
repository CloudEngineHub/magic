import { useCallback } from "react"
import { AlertCircle, AlertTriangle, Info } from "lucide-react"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import useConnectionPositionEffect from "../../../app/hooks/layout/useConnectionPositionEffect"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import type {
	CanvasDesignConnectionActionHint,
	CanvasDesignElementActionHint,
} from "../../../public/props"
import styles from "./index.module.css"

interface ElementActionHintsProps {
	hints?: CanvasDesignElementActionHint[]
	onAction?: (elementId: string, actionKey: string) => void
	connectionHints?: CanvasDesignConnectionActionHint[]
	onConnectionAction?: (connectionId: string, actionKey: string) => void
}

interface ElementActionHintAction {
	key: string
	label: string
	variant?: "default" | "primary"
}

type ActionHintTone = CanvasDesignElementActionHint["tone"]

function HintIcon({ tone }: { tone: ActionHintTone }) {
	if (tone === "info") return <Info size={13} />
	if (tone === "error") return <AlertCircle size={13} />
	return <AlertTriangle size={13} />
}

function getHintTitle(
	t: (key: string, options?: string | Record<string, unknown>) => string,
): string {
	return t("elementConflict.title", "请选择保留的版本")
}

function getHintDescription(
	t: (key: string, options?: string | Record<string, unknown>) => string,
): string {
	return t("elementConflict.description", "这个元素有新的同步内容，也有你当前的修改。")
}

function getConnectionHintTitle(
	t: (key: string, options?: string | Record<string, unknown>) => string,
): string {
	return t("connectionConflict.title", "请选择保留的连接")
}

function getConnectionHintDescription(
	t: (key: string, options?: string | Record<string, unknown>) => string,
): string {
	return t("connectionConflict.description", "这条连接线有新的同步内容，也有你当前的修改。")
}

function getHintActions(
	t: (key: string, options?: string | Record<string, unknown>) => string,
	hint: CanvasDesignElementActionHint,
): ElementActionHintAction[] {
	if (hint.remoteExists === false) {
		return [
			{
				key: "use-local",
				label: t("elementConflict.keepElement", "保留这个元素"),
			},
			{
				key: "use-remote",
				label: t("elementConflict.deleteElement", "删除这个元素"),
				variant: "primary",
			},
		]
	}

	if (hint.localExists === false) {
		return [
			{
				key: "use-local",
				label: t("elementConflict.keepDeleted", "保持删除"),
			},
			{
				key: "use-remote",
				label: t("elementConflict.restoreNew", "恢复新版"),
				variant: "primary",
			},
		]
	}

	return [
		{
			key: "use-local",
			label: t("elementConflict.useLocal", "保留我的"),
		},
		{
			key: "use-remote",
			label: t("elementConflict.useRemote", "使用新的"),
			variant: "primary",
		},
	]
}

function getConnectionHintActions(
	t: (key: string, options?: string | Record<string, unknown>) => string,
	hint: CanvasDesignConnectionActionHint,
): ElementActionHintAction[] {
	if (hint.remoteExists === false) {
		return [
			{
				key: "use-local",
				label: t("connectionConflict.keepConnection", "保留这条连接"),
			},
			{
				key: "use-remote",
				label: t("connectionConflict.deleteConnection", "删除这条连接"),
				variant: "primary",
			},
		]
	}

	if (hint.localExists === false) {
		return [
			{
				key: "use-local",
				label: t("connectionConflict.keepDeleted", "保持删除"),
			},
			{
				key: "use-remote",
				label: t("connectionConflict.restoreNew", "恢复新版"),
				variant: "primary",
			},
		]
	}

	return [
		{
			key: "use-local",
			label: t("connectionConflict.useLocal", "保留我的"),
		},
		{
			key: "use-remote",
			label: t("connectionConflict.useRemote", "使用新的"),
			variant: "primary",
		},
	]
}

function ElementActionHintItem({
	hint,
	onAction,
}: {
	hint: CanvasDesignElementActionHint
	onAction?: (elementId: string, actionKey: string) => void
}) {
	const { t } = useCanvasDesignI18n()
	const { containerRef } = useElementPositionEffect({
		position: "left",
		offset: 12,
		verticalAlign: "top",
		trackedElementId: hint.elementId,
	})
	const { containerRef: floatingRef } = useFloatingComponent({
		id: `element-action-hint:${hint.id ?? hint.elementId}`,
		enableWheelForwarding: true,
		enablePointerPanForwarding: true,
	})
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node
			floatingRef.current = node
		},
		[containerRef, floatingRef],
	)

	const tone = hint.tone ?? "warning"
	const title = getHintTitle(t)
	const description = getHintDescription(t)
	const actions = getHintActions(t, hint)

	return (
		<div
			ref={setRefs}
			className={styles.elementActionHint}
			data-tone={tone}
			data-canvas-ui-component
		>
			<div className={styles.elementActionHintHeader}>
				<HintIcon tone={tone} />
				<span>{title}</span>
			</div>
			<div className={styles.elementActionHintDescription}>{description}</div>
			{actions.length > 0 ? (
				<div
					className={styles.elementActionHintActions}
					style={{
						gridTemplateColumns: `repeat(${actions.length}, 1fr)`,
					}}
				>
					{actions.map((action) => (
						<button
							key={action.key}
							type="button"
							className={styles.elementActionHintButton}
							data-variant={action.variant ?? "default"}
							onClick={(event) => {
								event.stopPropagation()
								onAction?.(hint.elementId, action.key)
							}}
						>
							{action.label}
						</button>
					))}
				</div>
			) : null}
		</div>
	)
}

function ConnectionActionHintItem({
	hint,
	onAction,
}: {
	hint: CanvasDesignConnectionActionHint
	onAction?: (connectionId: string, actionKey: string) => void
}) {
	const { t } = useCanvasDesignI18n()
	const { containerRef } = useConnectionPositionEffect({
		connectionId: hint.connectionId,
		sourceElementId: hint.sourceElementId,
		targetElementId: hint.targetElementId,
		offset: 12,
	})
	const { containerRef: floatingRef } = useFloatingComponent({
		id: `connection-action-hint:${hint.id ?? hint.connectionId}`,
		enableWheelForwarding: true,
		enablePointerPanForwarding: true,
	})
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node
			floatingRef.current = node
		},
		[containerRef, floatingRef],
	)

	const tone = hint.tone ?? "warning"
	const title = getConnectionHintTitle(t)
	const description = getConnectionHintDescription(t)
	const actions = getConnectionHintActions(t, hint)

	return (
		<div
			ref={setRefs}
			className={styles.elementActionHint}
			data-tone={tone}
			data-canvas-ui-component
		>
			<div className={styles.elementActionHintHeader}>
				<HintIcon tone={tone} />
				<span>{title}</span>
			</div>
			<div className={styles.elementActionHintDescription}>{description}</div>
			{actions.length > 0 ? (
				<div
					className={styles.elementActionHintActions}
					style={{
						gridTemplateColumns: `repeat(${actions.length}, 1fr)`,
					}}
				>
					{actions.map((action) => (
						<button
							key={action.key}
							type="button"
							className={styles.elementActionHintButton}
							data-variant={action.variant ?? "default"}
							onClick={(event) => {
								event.stopPropagation()
								onAction?.(hint.connectionId, action.key)
							}}
						>
							{action.label}
						</button>
					))}
				</div>
			) : null}
		</div>
	)
}

export default function ElementActionHints({
	hints,
	onAction,
	connectionHints,
	onConnectionAction,
}: ElementActionHintsProps) {
	if (!hints?.length && !connectionHints?.length) return null

	return (
		<div className={styles.elementActionHints} aria-live="polite">
			{hints?.map((hint) => (
				<ElementActionHintItem
					key={hint.id ?? hint.elementId}
					hint={hint}
					onAction={onAction}
				/>
			))}
			{connectionHints?.map((hint) => (
				<ConnectionActionHintItem
					key={hint.id ?? hint.connectionId}
					hint={hint}
					onAction={onConnectionAction}
				/>
			))}
		</div>
	)
}
