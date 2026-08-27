import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TFunction } from "i18next"
import MagicModal from "@/components/base/MagicModal"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import {
	buildHtmlMultiSelectionRequest,
	createHtmlSelectionTarget,
	upsertHtmlSelectionTarget,
	buildAgentPromptContent,
	type HtmlMultiSelectionSubmitState,
	type HtmlSelectionTarget,
	type InspectedElementRect,
	type useElementInspector,
} from "@/components/business/ElementInspector"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { roleStore } from "@/pages/superMagic/stores"
import { resolveDefaultAgentSelection } from "@/services/superMagic/DefaultAgentSelectionService"

type ElementInspector = ReturnType<typeof useElementInspector>

/** Minimal file info needed to identify the HTML file in a structured request. */
export interface InspectorFileInfo {
	fileId: string
	fileName: string
	filePath: string
}

type InspectorMode = "devConsole" | "toolbar" | "multiSelection"
type SelectionMode = "element" | "screenshot"

/**
 * Coordinates toolbar inspection and the multi-target HTML editing flow.
 * Selecting an element only opens a local draft; the Agent is notified on submit.
 */
export function useInspectorToolbarMode(
	elementInspector: ElementInspector,
	t: TFunction<"super">,
	fileInfo?: InspectorFileInfo,
) {
	const [mode, setMode] = useState<InspectorMode>("devConsole")
	const [activeTarget, setActiveTarget] = useState<HtmlSelectionTarget | null>(null)
	const [draftInstruction, setDraftInstruction] = useState("")
	const [pendingTargets, setPendingTargets] = useState<HtmlSelectionTarget[]>([])
	const [submitState, setSubmitState] = useState<HtmlMultiSelectionSubmitState>("idle")
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [selectionMode, setSelectionMode] = useState<SelectionMode>("element")
	const modeRef = useRef<InspectorMode>("devConsole")
	const exitRequestRef = useRef<Promise<boolean> | null>(null)
	const previousFileIdRef = useRef(fileInfo?.fileId)
	const fileId = fileInfo?.fileId
	const fileName = fileInfo?.fileName
	const filePath = fileInfo?.filePath
	const stableFileInfo = useMemo(
		() =>
			fileId && fileName && filePath !== undefined
				? { fileId, fileName, filePath }
				: undefined,
		[fileId, fileName, filePath],
	)
	const {
		selectedElement,
		start: startInspector,
		stop: stopInspector,
		clearSelection,
	} = elementInspector

	const updateMode = useCallback((nextMode: InspectorMode) => {
		modeRef.current = nextMode
		setMode(nextMode)
	}, [])

	useEffect(() => {
		if (modeRef.current === "devConsole" || !selectedElement) return

		const info = selectedElement
		if (modeRef.current === "multiSelection") {
			const existing = pendingTargets.find(
				(target) => target.kind === "element" && target.info?.selector === info.selector,
			)
			setActiveTarget(existing ?? createHtmlSelectionTarget(info))
			setDraftInstruction(existing?.instruction ?? "")
			setSubmitError(null)
			stopInspector()
			return
		}

		// Toolbar mode keeps its historical behavior: one selection creates a topic.
		clearSelection()
		stopInspector()
		updateMode("devConsole")
		const content = buildAgentPromptContent(
			info,
			t("stylePanel.inspector.agentPromptTitle"),
			stableFileInfo,
		)

		if (!pubsub.hasListeners(PubSubEvents.Create_New_Topic)) {
			pubsub.publish(PubSubEvents.Set_Input_Message, content)
			return
		}

		const defaultSelection = resolveDefaultAgentSelection()
		const topicMode = superMagicModeService.isModeValid(
			defaultSelection.modeIdentifier,
			defaultSelection.agentCode,
		)
			? (defaultSelection.modeIdentifier as TopicMode)
			: undefined

		if (topicMode) roleStore.applyResolvedRole(topicMode)
		pubsub.publish(PubSubEvents.Create_New_Topic, {
			topicMode,
			afterCreate: { content, extraData: { hasInput: true } },
		})
	}, [
		selectedElement,
		stableFileInfo,
		pendingTargets,
		t,
		stopInspector,
		clearSelection,
		updateMode,
	])

	const startInToolbarMode = useCallback(() => {
		updateMode("toolbar")
		startInspector()
	}, [startInspector, updateMode])

	const startInAppendMode = useCallback(() => {
		setSubmitError(null)
		setSubmitState("idle")
		updateMode("multiSelection")
		setSelectionMode("element")
		startInspector()
	}, [startInspector, updateMode])

	const updateSelectionMode = useCallback(
		(nextMode: SelectionMode) => {
			setSelectionMode(nextMode)
			setSubmitError(null)
			setActiveTarget(null)
			setDraftInstruction("")
			if (modeRef.current !== "multiSelection") updateMode("multiSelection")
			startInspector()
		},
		[startInspector, updateMode],
	)

	const captureScreenshotTarget = useCallback(
		(
			dataUrl: string,
			rect: InspectedElementRect,
			displaySize?: { width: number; height: number },
		) => {
			setActiveTarget({
				id: `screenshot:${Date.now()}`,
				kind: "screenshot",
				screenshot: { dataUrl, rect, displaySize },
				instruction: "",
			})
			setDraftInstruction("")
			setSubmitError(null)
			stopInspector()
		},
		[stopInspector],
	)

	const confirmTarget = useCallback(() => {
		if (!activeTarget || !draftInstruction.trim()) return
		const confirmedTarget = {
			...activeTarget,
			instruction: draftInstruction.trim(),
		}
		setPendingTargets((targets) => upsertHtmlSelectionTarget(targets, confirmedTarget))
		if (
			confirmedTarget.kind === "screenshot" &&
			pubsub.hasListeners(PubSubEvents.Prepare_Html_Screenshot)
		) {
			pubsub.publish(PubSubEvents.Prepare_Html_Screenshot, {
				targetId: confirmedTarget.id,
				dataUrl: confirmedTarget.screenshot.dataUrl,
				fileName: `html-screenshot-${confirmedTarget.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.png`,
				onSuccess: (mention) => {
					setPendingTargets((targets) =>
						targets.map((target) =>
							target.kind === "screenshot" && target.id === confirmedTarget.id
								? { ...target, screenshot: { ...target.screenshot, mention } }
								: target,
						),
					)
				},
			})
		}
		setActiveTarget(null)
		setDraftInstruction("")
		setSubmitState("idle")
		// Keep the picker open so users can collect another target without reopening the toolbar.
		clearSelection()
		setSelectionMode("element")
		startInspector()
	}, [activeTarget, draftInstruction, clearSelection, startInspector])

	const cancelTarget = useCallback(() => {
		setActiveTarget(null)
		setDraftInstruction("")
		clearSelection()
		updateMode("devConsole")
		stopInspector()
	}, [clearSelection, stopInspector, updateMode])

	const editPendingTarget = useCallback(
		(target: HtmlSelectionTarget) => {
			setActiveTarget(target)
			setDraftInstruction(target.instruction)
			setSubmitError(null)
			updateMode("multiSelection")
			stopInspector()
		},
		[stopInspector, updateMode],
	)

	const removePendingTarget = useCallback((targetId: string) => {
		setPendingTargets((targets) => targets.filter((target) => target.id !== targetId))
		setSubmitState("idle")
		setSelectionMode("element")
	}, [])

	const resetSelection = useCallback(() => {
		setActiveTarget(null)
		setDraftInstruction("")
		setPendingTargets([])
		setSubmitError(null)
		setSubmitState("idle")
		setSelectionMode("element")
		clearSelection()
		updateMode("devConsole")
		stopInspector()
	}, [clearSelection, stopInspector, updateMode])

	// AI 选取模式在元素确认后仍会保留提交列表，因此不能只依赖
	// useElementInspector 的 active 状态来处理 Escape。
	const requestExit = useCallback((): Promise<boolean> => {
		if (modeRef.current !== "multiSelection") return Promise.resolve(true)
		if (pendingTargets.length === 0) {
			resetSelection()
			return Promise.resolve(true)
		}
		if (exitRequestRef.current) return exitRequestRef.current

		const request = new Promise<boolean>((resolve) => {
			const modal = MagicModal.confirm({
				title: t("stylePanel.inspector.exitConfirmTitle"),
				content: t("stylePanel.inspector.exitConfirmContent", {
					count: pendingTargets.length,
				}),
				okText: t("common.confirm"),
				cancelText: t("common.cancel"),
				closable: false,
				maskClosable: false,
				centered: true,
				onOk: () => {
					resetSelection()
					modal.destroy()
					resolve(true)
				},
				onCancel: () => {
					modal.destroy()
					resolve(false)
				},
			})
		})
		exitRequestRef.current = request
		void request.finally(() => {
			if (exitRequestRef.current === request) exitRequestRef.current = null
		})
		return request
	}, [pendingTargets.length, resetSelection, t])

	const consumeEscape = useCallback(() => {
		if (modeRef.current !== "multiSelection") return false
		void requestExit()
		return true
	}, [requestExit])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || modeRef.current !== "multiSelection") return
			consumeEscape()
			event.preventDefault()
			event.stopImmediatePropagation()
		}

		window.addEventListener("keydown", handleKeyDown, true)
		return () => window.removeEventListener("keydown", handleKeyDown, true)
	}, [consumeEscape])

	useEffect(() => {
		if (previousFileIdRef.current === fileInfo?.fileId) return
		previousFileIdRef.current = fileInfo?.fileId
		resetSelection()
	}, [fileInfo?.fileId, resetSelection])

	const submitPendingTargets = useCallback(async () => {
		if (!fileInfo?.fileId) {
			setSubmitError(t("stylePanel.inspector.fileRequired"))
			setSubmitState("failed")
			return
		}
		if (
			pendingTargets.length === 0 ||
			pendingTargets.some((target) => !target.instruction.trim())
		) {
			setSubmitError(t("stylePanel.inspector.descriptionRequired"))
			setSubmitState("failed")
			return
		}
		if (!pubsub.hasListeners(PubSubEvents.Submit_Html_Multi_Selection)) {
			setSubmitError(t("stylePanel.inspector.submitUnavailable"))
			setSubmitState("failed")
			return
		}

		setSubmitError(null)
		setSubmitState("submitting")
		stopInspector()
		setActiveTarget(null)
		setDraftInstruction("")
		setSelectionMode("element")
		updateMode("devConsole")
		try {
			const request = buildHtmlMultiSelectionRequest(
				fileInfo.fileId,
				pendingTargets,
				"",
				fileInfo.fileName,
				fileInfo.filePath,
			)
			request.onSuccess = resetSelection
			request.onError = (error) => {
				setSubmitError(error instanceof Error ? error.message : String(error))
				setSubmitState("failed")
			}
			pubsub.publish(PubSubEvents.Submit_Html_Multi_Selection, request)
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : String(error))
			setSubmitState("failed")
		}
	}, [fileInfo, pendingTargets, resetSelection, stopInspector, t, updateMode])

	return {
		hideInfoCard: mode !== "devConsole",
		isAppendPicking: mode === "multiSelection",
		selectionMode,
		updateSelectionMode,
		captureScreenshotTarget,
		activeTarget,
		draftInstruction,
		setDraftInstruction,
		confirmTarget,
		cancelTarget,
		pendingTargets,
		submitState,
		submitError,
		editPendingTarget,
		removePendingTarget,
		resetSelection,
		requestExit,
		consumeEscape,
		submitPendingTargets,
		startInToolbarMode,
		startInAppendMode,
		inspectorModeRef: modeRef,
	}
}
