import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { message } from "antd"
import { useTranslation } from "react-i18next"
import { SelfMediaFileStorageService } from "../../../services/SelfMediaFileStorageService"
import type { TemplateMeta } from "../../../services/SelfMediaFileStorageService"
import { hasMeaningfulSelfMediaDraftData, type SelfMediaInitData } from "../types"
import type { AttachmentNode } from "../../../services"
import { createEmptyInitData } from "../constants"

interface UseDraftManagerOptions {
	fileStorageService: SelfMediaFileStorageService | null
	attachmentList?: AttachmentNode[]
}

interface DraftState {
	data: SelfMediaInitData
	currentStep: number
}

export function useDraftManager({ fileStorageService, attachmentList }: UseDraftManagerOptions) {
	const { t } = useTranslation("super")
	const [data, setData] = useState<SelfMediaInitData>(createEmptyInitData)
	const [currentStep, setCurrentStep] = useState(0)
	const [showTemplateSelector, setShowTemplateSelector] = useState(false)
	const [templates, setTemplates] = useState<TemplateMeta[]>([])
	const [draftLoaded, setDraftLoaded] = useState(false)
	const [pendingDraft, setPendingDraft] = useState<DraftState | null>(null)
	const [brandImagesUploading, setBrandImagesUploading] = useState(false)

	// 标记自身保存操作，用于区分 updated_at 变化是自己写入还是外部写入
	const selfSaveTimestamp = useRef<number>(0)
	const pendingSelfSaveCount = useRef(0)
	const skipDraftPersistenceRef = useRef(false)
	const dataRef = useRef(data)
	const currentStepRef = useRef(currentStep)
	dataRef.current = data
	currentStepRef.current = currentStep

	// Debounce timer for blur-triggered saves
	const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const draftSavingRef = useRef(false)

	// ─── Init: load draft & template list ───────────────────────────────
	useEffect(() => {
		if (!fileStorageService || draftLoaded) return
		let cancelled = false

		;(async () => {
			const [draft, templateList] = await Promise.all([
				fileStorageService.loadDraft(),
				fileStorageService.listTemplates(),
			])
			if (cancelled) return

			setTemplates(templateList)

			if (draft && hasMeaningfulSelfMediaDraftData(draft.data)) {
				setPendingDraft({
					data: draft.data,
					currentStep: draft.currentStep ?? 0,
				})
			} else if (templateList.length > 0) {
				setShowTemplateSelector(true)
			}
			setDraftLoaded(true)
		})()

		return () => {
			cancelled = true
		}
	}, [fileStorageService, draftLoaded])

	// ─── Template actions ───────────────────────────────────────────────
	const handleLoadTemplate = useCallback(
		async (templateId: string) => {
			if (!fileStorageService) return
			const tplData = await fileStorageService.loadTemplate(templateId)
			if (tplData) {
				setData(tplData)
				setCurrentStep(0)
			}
			setShowTemplateSelector(false)
		},
		[fileStorageService],
	)

	const handleStartBlank = useCallback(() => {
		setShowTemplateSelector(false)
	}, [])

	const handleRestoreDraft = useCallback(() => {
		if (!pendingDraft) return
		setData(pendingDraft.data)
		setCurrentStep(pendingDraft.currentStep)
		setPendingDraft(null)
		setShowTemplateSelector(false)
	}, [pendingDraft])

	const handleDiscardDraft = useCallback(async () => {
		try {
			await fileStorageService?.clearDraft()
			const emptyData = createEmptyInitData()
			pendingSelfSaveCount.current = 0
			selfSaveTimestamp.current = 0
			lastDraftUpdatedAt.current = undefined
			skipDraftPersistenceRef.current = false
			dataRef.current = emptyData
			currentStepRef.current = 0
			setData(emptyData)
			setCurrentStep(0)
			setPendingDraft(null)
			setShowTemplateSelector(false)
			setBrandImagesUploading(false)
		} catch (error) {
			console.error("Failed to discard self-media draft:", error)
			message.error(t("detail.selfMedia.initPanel.draft.clearError"))
		}
	}, [fileStorageService, t])

	// ─── External draft change detection ────────────────────────────────
	const draftUpdatedAt = useMemo(() => {
		if (!attachmentList) return undefined
		const draftPath = "__drafts/draft.json"
		const findNode = (nodes: AttachmentNode[]): string | undefined => {
			for (const node of nodes) {
				if (!node.is_directory && node.relative_file_path?.endsWith(draftPath)) {
					return node.updated_at
				}
				if (node.children) {
					const found = findNode(node.children)
					if (found) return found
				}
			}
			return undefined
		}
		return findNode(attachmentList)
	}, [attachmentList])

	const lastDraftUpdatedAt = useRef<string | undefined>(undefined)

	useEffect(() => {
		if (!draftUpdatedAt || !fileStorageService || !draftLoaded) return
		if (!lastDraftUpdatedAt.current) {
			lastDraftUpdatedAt.current = draftUpdatedAt
			return
		}
		if (lastDraftUpdatedAt.current === draftUpdatedAt) return

		const timeSinceLastSave = Date.now() - selfSaveTimestamp.current
		lastDraftUpdatedAt.current = draftUpdatedAt

		if (pendingSelfSaveCount.current > 0) return
		if (timeSinceLastSave < 15000) return
		;(async () => {
			try {
				const draft = await fileStorageService.loadDraft()
				if (draft) {
					setData(draft.data)
					if (draft.currentStep !== undefined) setCurrentStep(draft.currentStep)
				}
			} catch {
				// ignore
			}
		})()
	}, [draftUpdatedAt, fileStorageService, draftLoaded])

	// ─── Unmount: save draft & cleanup ──────────────────────────────────
	useEffect(() => {
		return () => {
			// Cancel any pending debounced save
			if (draftSaveTimerRef.current) {
				clearTimeout(draftSaveTimerRef.current)
				draftSaveTimerRef.current = null
			}

			const latestData = dataRef.current
			const latestStep = currentStepRef.current
			const hasContent = hasMeaningfulSelfMediaDraftData(latestData)
			if (fileStorageService && hasContent && !skipDraftPersistenceRef.current) {
				selfSaveTimestamp.current = Date.now()
				pendingSelfSaveCount.current += 1
				void fileStorageService.saveDraft(latestData, latestStep).finally(() => {
					window.setTimeout(() => {
						pendingSelfSaveCount.current = Math.max(0, pendingSelfSaveCount.current - 1)
					}, 3000)
				})
			}
			fileStorageService?.dispose()
		}
	}, [fileStorageService])

	// ─── Draft persistence helpers ──────────────────────────────────────
	const hasDraftContent = hasMeaningfulSelfMediaDraftData(data)

	const saveDraftIfNeeded = useCallback(
		async (step = currentStep) => {
			if (!fileStorageService || !draftLoaded || !hasDraftContent || showTemplateSelector) {
				return
			}

			// If a save is already in progress, skip to avoid concurrent saves
			if (draftSavingRef.current) {
				return
			}

			draftSavingRef.current = true
			pendingSelfSaveCount.current += 1
			selfSaveTimestamp.current = Date.now()
			try {
				await fileStorageService.saveDraft(dataRef.current, step)
			} finally {
				draftSavingRef.current = false
				window.setTimeout(() => {
					pendingSelfSaveCount.current = Math.max(0, pendingSelfSaveCount.current - 1)
				}, 3000)
			}
		},
		[fileStorageService, draftLoaded, hasDraftContent, showTemplateSelector, currentStep],
	)

	/**
	 * Debounced version of saveDraftIfNeeded for blur-triggered saves.
	 * Multiple rapid blur events (e.g., focus moving between fields) will
	 * only trigger a single save after a short delay.
	 */
	const debouncedSaveDraft = useCallback(() => {
		if (draftSaveTimerRef.current) {
			clearTimeout(draftSaveTimerRef.current)
		}
		draftSaveTimerRef.current = setTimeout(() => {
			draftSaveTimerRef.current = null
			void saveDraftIfNeeded().catch((error) => {
				console.error("Failed to save draft on blur:", error)
			})
		}, 600)
	}, [saveDraftIfNeeded])

	const saveDraftInBackground = useCallback(
		(step = currentStep) => {
			void saveDraftIfNeeded(step).catch((error) => {
				console.error("Failed to save draft in background:", error)
				message.error(t("detail.selfMedia.initPanel.draft.saveError"))
			})
		},
		[currentStep, saveDraftIfNeeded, t],
	)

	// ─── Clear ──────────────────────────────────────────────────────────
	const handleClearData = useCallback(async () => {
		try {
			await fileStorageService?.clearDraft()
			const emptyData = createEmptyInitData()
			pendingSelfSaveCount.current = 0
			selfSaveTimestamp.current = 0
			lastDraftUpdatedAt.current = undefined
			skipDraftPersistenceRef.current = false
			dataRef.current = emptyData
			currentStepRef.current = 0
			setData(emptyData)
			setCurrentStep(0)
			setShowTemplateSelector(false)
			setBrandImagesUploading(false)
		} catch (error) {
			console.error("Failed to clear self-media draft:", error)
			message.error(t("detail.selfMedia.initPanel.draft.clearError"))
		}
	}, [fileStorageService, t])

	return {
		data,
		setData,
		currentStep,
		setCurrentStep,
		showTemplateSelector,
		pendingDraft,
		templates,
		draftLoaded,
		isDraftLoading: Boolean(fileStorageService) && !draftLoaded,
		brandImagesUploading,
		setBrandImagesUploading,
		handleLoadTemplate,
		handleStartBlank,
		handleRestoreDraft,
		handleDiscardDraft,
		hasDraftContent,
		saveDraftIfNeeded,
		debouncedSaveDraft,
		saveDraftInBackground,
		handleClearData,
		skipDraftPersistenceRef,
		dataRef,
		currentStepRef,
	}
}
