import { useCallback, useRef, useMemo } from "react"
import { observer } from "mobx-react-lite"
import { userStore } from "@/models/user"
import { SelfMediaBrandRecordService } from "@/services/selfMedia"
import { SelfMediaFileStorageService } from "../../services/SelfMediaFileStorageService"
import StepBrandInfo from "./StepBrandInfo"
import type { StepBrandInfoRef } from "./StepBrandInfo"
import StepTopicAndDetail from "./StepTopicAndDetail"
import StepConfirm from "./StepConfirm"
import StepIndicator from "./StepIndicator"
import StepNavigation from "./StepNavigation"
import TemplateSelector from "./TemplateSelector"
import { useDraftManager } from "./hooks/useDraftManager"
import { STEPS } from "./constants"
import type { ArticleDetail, BrandImageItem } from "./types"
import type { AttachmentNode } from "../../services"

interface SelfMediaInitPanelProps {
	selectedProject?: any
	folderFileId?: string
	folderPath?: string
	attachmentList?: AttachmentNode[]
}

function SelfMediaInitPanel({
	selectedProject,
	folderFileId,
	folderPath,
	attachmentList,
}: SelfMediaInitPanelProps) {
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
		data,
		setData,
		currentStep,
		setCurrentStep,
		showTemplateSelector,
		templates,
		platformFetchInProgress,
		brandImagesUploading,
		setBrandImagesUploading,
		handlePlatformFetchStart,
		handlePlatformFetchEnd,
		handleLoadTemplate,
		handleStartBlank,
		hasDraftContent,
		saveDraftIfNeeded,
		saveDraftInBackground,
		handleClearData,
		skipDraftPersistenceRef,
		dataRef,
		currentStepRef,
	} = useDraftManager({ fileStorageService, attachmentList })

	const brandInfoRef = useRef<StepBrandInfoRef>(null)

	const handleBrandChange = useCallback(
		(field: "author" | "brandPosition" | "targetAudience", value: string) => {
			setData((prev) => ({
				...prev,
				global: { ...prev.global, [field]: value },
			}))
		},
		[setData],
	)

	const handleBrandImagesChange = useCallback(
		(brandImages: BrandImageItem[]) => {
			setData((prev) => ({
				...prev,
				global: { ...prev.global, brandImages },
			}))
		},
		[setData],
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
		async (step: number) => {
			await saveDraftIfNeeded(currentStep)
			setCurrentStep(step)
		},
		[saveDraftIfNeeded, currentStep, setCurrentStep],
	)

	const handleNext = useCallback(() => {
		if (currentStep === 0 && brandInfoRef.current) {
			const canProceedNow = brandInfoRef.current.checkBeforeNext()
			if (!canProceedNow) return
		}

		const nextStep = Math.min(currentStep + 1, STEPS.length - 1)
		setCurrentStep(nextStep)
		saveDraftInBackground(nextStep)
	}, [currentStep, saveDraftInBackground, setCurrentStep])

	const handlePrev = useCallback(async () => {
		const prevStep = Math.max(currentStep - 1, 0)
		await saveDraftIfNeeded(currentStep)
		setCurrentStep(prevStep)
	}, [currentStep, saveDraftIfNeeded, setCurrentStep])

	const hasPendingBrandImageUploads = data.global.brandImages.some(
		(img) => img.file.size > 0 && !img.uploadedPath,
	)
	const hasAnyInitData = showTemplateSelector || currentStep > 0 || hasDraftContent

	const canProceed = (): boolean => {
		switch (currentStep) {
			case 0:
				return (
					data.global.author.trim() !== "" &&
					data.global.brandPosition.trim() !== "" &&
					!brandImagesUploading &&
					!hasPendingBrandImageUploads
				)
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
			className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-gradient-to-br from-background via-background to-primary/[0.02]"
			data-testid="self-media-init-panel-root"
		>
			<StepIndicator currentStep={currentStep} onNavigate={navigateToStep} />

			{/* Step content */}
			<div
				className="min-h-0 flex-1 overflow-y-auto px-6 py-8"
				data-testid="self-media-init-panel-content"
			>
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
								isPlatformFetching={platformFetchInProgress}
								onPlatformFetchStart={handlePlatformFetchStart}
								onPlatformFetchEnd={handlePlatformFetchEnd}
								onBrandImagesUploadingChange={setBrandImagesUploading}
								onConfirmNext={handleNext}
							/>
						)}
						{currentStep === 1 && (
							<StepTopicAndDetail
								articles={data.articles}
								onChange={handleArticlesChange}
								onArticleUpdate={handleArticleUpdate}
								globalSettings={data.global}
								onPersistDraft={() => void saveDraftIfNeeded()}
								fileStorageService={fileStorageService}
							/>
						)}
						{currentStep === 2 && (
							<StepConfirm
								data={data}
								selectedProject={selectedProject}
								folderFileId={folderFileId}
								folderPath={folderPath}
								onSaveTemplate={
									fileStorageService
										? async (name: string) => {
												await fileStorageService.saveTemplate(data, name)
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
							/>
						)}
					</>
				)}
			</div>

			<StepNavigation
				currentStep={currentStep}
				canProceed={canProceed()}
				hasAnyInitData={hasAnyInitData}
				onNext={handleNext}
				onPrev={handlePrev}
				onClear={() => void handleClearData()}
				onNavigate={navigateToStep}
			/>
		</div>
	)
}

export default observer(SelfMediaInitPanel)
