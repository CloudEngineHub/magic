import { useCallback, useEffect, useRef, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { observer } from "mobx-react-lite"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { userStore } from "@/models/user"
import { SelfMediaBrandRecordService } from "@/services/selfMedia"
import { SelfMediaFileStorageService } from "../../services/SelfMediaFileStorageService"
import StepBrandInfo from "./steps/StepBrandInfo"
import type { StepBrandInfoRef } from "./steps/StepBrandInfo"
import StepTopicAndDetail from "./steps/StepTopicAndDetail"
import StepConfirm from "./steps/StepConfirm"
import StepIndicator from "./steps/StepIndicator"
import StepNavigation from "./steps/StepNavigation"
import TemplateSelector from "./steps/TemplateSelector"
import { useDraftManager } from "./hooks/useDraftManager"
import { useSelfMediaBrandConfig } from "../../hooks/useSelfMediaBrandConfig"
import { STEPS } from "./constants"
import type { ArticleDetail, BrandImageItem } from "./types"
import type { AttachmentNode } from "../../services"
import DraftRestoreDialog from "./components/ui/DraftRestoreDialog"

interface SelfMediaInitPanelProps {
	selectedProject?: { id: string } | null
	folderFileId?: string
	folderPath?: string
	attachmentList?: AttachmentNode[]
	onBackHome?: () => void
}

function SelfMediaInitPanel({
	selectedProject,
	folderFileId,
	folderPath,
	attachmentList,
	onBackHome,
}: SelfMediaInitPanelProps) {
	const { t } = useTranslation("super")
	const userId = userStore.user.userInfo?.user_id || ""
	const organizationCode = userStore.user.organizationCode || ""
	const projectId = selectedProject?.id || ""

	const fileStorageService = useMemo(
		() =>
			projectId ? new SelfMediaFileStorageService(projectId, folderFileId, folderPath) : null,
		[projectId, folderFileId, folderPath],
	)

	const brandService = useMemo(
		() =>
			userId && organizationCode
				? new SelfMediaBrandRecordService(userId, organizationCode)
				: null,
		[userId, organizationCode],
	)

	const {
		settings: brandSettings,
		setSettings: setBrandSettings,
		saveSettings: saveBrandSettings,
		isLoading: isBrandConfigLoading,
	} = useSelfMediaBrandConfig({ fileStorageService })

	const brandDirtyRef = useRef(false)
	const brandIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const latestBrandRef = useRef(brandSettings)

	const flushBrandSave = useCallback(() => {
		if (brandIdleTimerRef.current) {
			clearTimeout(brandIdleTimerRef.current)
			brandIdleTimerRef.current = null
		}
		if (!brandDirtyRef.current) return
		brandDirtyRef.current = false
		void saveBrandSettings(latestBrandRef.current)
	}, [saveBrandSettings])

	const markBrandDirty = useCallback(() => {
		brandDirtyRef.current = true
		if (brandIdleTimerRef.current) {
			clearTimeout(brandIdleTimerRef.current)
		}
		brandIdleTimerRef.current = setTimeout(() => {
			brandIdleTimerRef.current = null
			flushBrandSave()
		}, 5000)
	}, [flushBrandSave])

	useEffect(() => {
		return () => {
			if (brandIdleTimerRef.current) {
				clearTimeout(brandIdleTimerRef.current)
			}
			// Flush on unmount if dirty
			if (brandDirtyRef.current) {
				brandDirtyRef.current = false
				void saveBrandSettings(latestBrandRef.current)
			}
		}
	}, [saveBrandSettings])

	const {
		data,
		setData,
		currentStep,
		setCurrentStep,
		showTemplateSelector,
		pendingDraft,
		templates,
		isDraftLoading,
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
	} = useDraftManager({ fileStorageService, attachmentList })

	const brandInfoRef = useRef<StepBrandInfoRef>(null)

	useEffect(() => {
		setData((prev) => ({
			...prev,
			global: brandSettings,
		}))
	}, [brandSettings, setData])

	const handleBrandChange = useCallback(
		(field: "author" | "brandPosition" | "targetAudience", value: string) => {
			const nextGlobal = { ...dataRef.current.global, [field]: value }
			dataRef.current = { ...dataRef.current, global: nextGlobal }
			latestBrandRef.current = nextGlobal
			setData((prev) => ({
				...prev,
				global: nextGlobal,
			}))
			setBrandSettings(nextGlobal)
			markBrandDirty()
		},
		[dataRef, markBrandDirty, setBrandSettings, setData],
	)

	const handleBrandImagesChange = useCallback(
		(brandImages: BrandImageItem[]) => {
			const nextGlobal = { ...dataRef.current.global, brandImages }
			dataRef.current = { ...dataRef.current, global: nextGlobal }
			latestBrandRef.current = nextGlobal
			setData((prev) => ({
				...prev,
				global: nextGlobal,
			}))
			setBrandSettings(nextGlobal)
			markBrandDirty()
		},
		[dataRef, markBrandDirty, setBrandSettings, setData],
	)

	const handleArticlesChange = useCallback(
		(articles: ArticleDetail[]) => {
			setData((prev) => ({ ...prev, articles }))
		},
		[setData],
	)

	const handleArticleUpdate = useCallback(
		(index: number, article: ArticleDetail) => {
			setData((prev) => {
				const newArticles = [...prev.articles]
				newArticles[index] = article
				return { ...prev, articles: newArticles }
			})
		},
		[setData],
	)

	const navigateToStep = useCallback(
		(step: number) => {
			flushBrandSave()
			setCurrentStep(step)
			saveDraftInBackground(step)
		},
		[flushBrandSave, saveDraftInBackground, setCurrentStep],
	)

	const handleNext = useCallback(() => {
		if (currentStep === 0 && brandInfoRef.current) {
			const canProceedNow = brandInfoRef.current.checkBeforeNext()
			if (!canProceedNow) return
		}

		flushBrandSave()
		const nextStep = Math.min(currentStep + 1, STEPS.length - 1)
		setCurrentStep(nextStep)
		saveDraftInBackground(nextStep)
	}, [currentStep, flushBrandSave, saveDraftInBackground, setCurrentStep])

	const handlePrev = useCallback(() => {
		flushBrandSave()
		const prevStep = Math.max(currentStep - 1, 0)
		setCurrentStep(prevStep)
		saveDraftInBackground(prevStep)
	}, [currentStep, flushBrandSave, saveDraftInBackground, setCurrentStep])

	const hasPendingBrandImageUploads = data.global.brandImages.some(
		(img) => img.file.size > 0 && !img.uploadedPath,
	)
	const hasAnyInitData = showTemplateSelector || currentStep > 0 || hasDraftContent

	const handleBackHome = useCallback(() => {
		flushBrandSave()
		onBackHome?.()
	}, [flushBrandSave, onBackHome])

	const canProceed = (): boolean => {
		switch (currentStep) {
			case 0:
				return !brandImagesUploading && !hasPendingBrandImageUploads
			case 1:
				return (
					data.articles.length > 0 &&
					data.articles.every((a) => a.title.trim() !== "" && !!a.platform)
				)
			default:
				return true
		}
	}

	return (
		<div
			className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-mobile-background"
			data-testid="self-media-init-panel-root"
		>
			<DraftRestoreDialog
				open={Boolean(pendingDraft)}
				onRestore={handleRestoreDraft}
				onDiscard={() => void handleDiscardDraft()}
				onBackHome={handleBackHome}
			/>
			{isDraftLoading || isBrandConfigLoading ? (
				<div
					className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background"
					data-testid="self-media-init-panel-draft-loading"
				>
					<Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
					<p className="text-sm font-medium text-muted-foreground">
						{t("detail.selfMedia.initPanel.draft.loading")}
					</p>
				</div>
			) : (
				<>
					<StepIndicator currentStep={currentStep} onNavigate={navigateToStep} />

					{/* Step content */}
					<ScrollArea
						className="relative min-h-0 flex-1 overflow-y-auto bg-background"
						data-testid="self-media-init-panel-content"
					>
						<div className="px-6">
							{showTemplateSelector && (
								<TemplateSelector
									templates={templates}
									onLoadTemplate={handleLoadTemplate}
									onStartBlank={handleStartBlank}
								/>
							)}

							{!showTemplateSelector && (
								<>
									{currentStep === 0 && (
										<StepBrandInfo
											ref={brandInfoRef}
											author={data.global.author}
											brandPosition={data.global.brandPosition}
											targetAudience={data.global.targetAudience}
											brandImages={data.global.brandImages}
											onChange={handleBrandChange}
											onBrandImagesChange={handleBrandImagesChange}
											fileStorageService={fileStorageService}
											brandService={brandService}
											attachmentList={attachmentList}
											projectId={projectId}
											folderPath={folderPath}
											onBrandImagesUploadingChange={setBrandImagesUploading}
											onConfirmNext={handleNext}
											brandImageUploadTarget="brand"
										/>
									)}
									{currentStep === 1 && (
										<StepTopicAndDetail
											articles={data.articles}
											onChange={handleArticlesChange}
											onArticleUpdate={handleArticleUpdate}
											globalSettings={data.global}
											onPersistDraft={debouncedSaveDraft}
											fileStorageService={fileStorageService}
										/>
									)}
									{currentStep === 2 && (
										<StepConfirm
											data={data}
											selectedProject={selectedProject}
											folderFileId={folderFileId}
											folderPath={folderPath}
											attachmentList={attachmentList}
											onSaveTemplate={
												fileStorageService
													? async (name: string) => {
															await fileStorageService.saveTemplate(
																data,
																name,
															)
														}
													: undefined
											}
											onArchiveDraft={
												fileStorageService
													? async () => {
															skipDraftPersistenceRef.current = true
															try {
																const archiveId =
																	await fileStorageService.archiveDraft(
																		dataRef.current,
																		currentStepRef.current,
																	)
																if (!archiveId) {
																	throw new Error(
																		"Failed to archive draft before generation",
																	)
																}
															} catch (error) {
																skipDraftPersistenceRef.current = false
																throw error
															}
														}
													: undefined
											}
											onGenerateFailed={() => {
												skipDraftPersistenceRef.current = false
											}}
											onBackHome={handleBackHome}
										/>
									)}
								</>
							)}
						</div>
					</ScrollArea>

					<StepNavigation
						currentStep={currentStep}
						canProceed={canProceed()}
						hasAnyInitData={hasAnyInitData}
						onNext={handleNext}
						onPrev={handlePrev}
						onClear={() => void handleClearData()}
						onNavigate={navigateToStep}
						onBackHome={handleBackHome}
					/>
				</>
			)}
		</div>
	)
}

export default observer(SelfMediaInitPanel)
