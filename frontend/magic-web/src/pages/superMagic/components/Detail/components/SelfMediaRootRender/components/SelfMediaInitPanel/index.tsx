import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { observer } from "mobx-react-lite"
import { message } from "antd"
import { cn } from "@/lib/utils"
import { userStore } from "@/models/user"
import { SelfMediaBrandRecordService } from "@/services/selfMedia"
import { SelfMediaFileStorageService } from "../../services/SelfMediaFileStorageService"
import type { TemplateMeta } from "../../services/SelfMediaFileStorageService"
import StepBrandInfo from "./StepBrandInfo"
import type { StepBrandInfoRef } from "./StepBrandInfo"
import StepTopicList from "./StepTopicList"
import StepArticleDetail from "./StepArticleDetail"
import StepConfirm from "./StepConfirm"
import type { SelfMediaInitData, ArticleDetail, BrandImageItem } from "./types"
import type { AttachmentNode } from "../../services"

interface SelfMediaInitPanelProps {
	selectedProject?: any
	folderFileId?: string
	folderPath?: string
	attachmentList?: AttachmentNode[]
}

const STEPS = [
	{ key: "brand", titleKey: "detail.selfMedia.initPanel.steps.brand" },
	{ key: "topics", titleKey: "detail.selfMedia.initPanel.steps.topics" },
	{ key: "detail", titleKey: "detail.selfMedia.initPanel.steps.detail" },
	{ key: "confirm", titleKey: "detail.selfMedia.initPanel.steps.confirm" },
]

const PLATFORM_FETCH_TIMEOUT_MS = 3 * 60 * 1000

function SelfMediaInitPanel({
	selectedProject,
	folderFileId,
	folderPath,
	attachmentList,
}: SelfMediaInitPanelProps) {
	const { t } = useTranslation("super")
	const [currentStep, setCurrentStep] = useState(0)
	const [data, setData] = useState<SelfMediaInitData>({
		global: {
			author: "",
			brandPosition: "",
			targetAudience: "",
			brandImages: [],
		},
		articles: [],
	})

	// ─── Draft & Template ──────────────────────────────────────────────────
	const [showTemplateSelector, setShowTemplateSelector] = useState(false)
	const [templates, setTemplates] = useState<TemplateMeta[]>([])
	const [draftLoaded, setDraftLoaded] = useState(false)
	const [showDraftPrompt, setShowDraftPrompt] = useState(false)
	const [platformFetchInProgress, setPlatformFetchInProgress] = useState(false)
	const [brandImagesUploading, setBrandImagesUploading] = useState(false)

	const handlePlatformFetchStart = useCallback(() => {
		setPlatformFetchInProgress(true)
	}, [])

	const handlePlatformFetchEnd = useCallback(() => {
		setPlatformFetchInProgress(false)
	}, [])

	useEffect(() => {
		if (!platformFetchInProgress) return
		const timer = window.setTimeout(() => {
			setPlatformFetchInProgress(false)
			message.warning(t("detail.selfMedia.initPanel.stepBrand.platformFetchTimeout"))
		}, PLATFORM_FETCH_TIMEOUT_MS)
		return () => window.clearTimeout(timer)
	}, [platformFetchInProgress, t])

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

	// 初始化：检查草稿 & 加载模板列表
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

			if (draft) {
				setShowDraftPrompt(true)
				draftRef.current = draft
			} else if (templateList.length > 0) {
				setShowTemplateSelector(true)
			}
			setDraftLoaded(true)
		})()

		return () => {
			cancelled = true
		}
	}, [fileStorageService, draftLoaded])

	const draftRef = useRef<any>(null)

	const handleRestoreDraft = useCallback(() => {
		if (draftRef.current) {
			setData(draftRef.current.data)
			setCurrentStep(draftRef.current.currentStep)
		}
		setShowDraftPrompt(false)
		draftRef.current = null
	}, [])

	const handleDiscardDraft = useCallback(() => {
		setShowDraftPrompt(false)
		draftRef.current = null
		fileStorageService?.clearDraft()
		if (templates.length > 0) {
			setShowTemplateSelector(true)
		}
	}, [fileStorageService, templates.length])

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

	// 标记自身保存操作，用于区分 updated_at 变化是自己写入还是外部写入
	const selfSaveTimestamp = useRef<number>(0)
	const pendingSelfSaveCount = useRef(0)
	const skipDraftPersistenceRef = useRef(false)
	const dataRef = useRef(data)
	const currentStepRef = useRef(currentStep)
	dataRef.current = data
	currentStepRef.current = currentStep

	// 监听 attachmentList 中 draft.json 的 updated_at 变化来检测 ip-manager 写入
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

	// 当 draft.json 的 updated_at 变化时，判断是自己写入还是外部写入
	useEffect(() => {
		if (!draftUpdatedAt || !fileStorageService || !draftLoaded) return
		// 初次设置基准值
		if (!lastDraftUpdatedAt.current) {
			lastDraftUpdatedAt.current = draftUpdatedAt
			return
		}
		// updated_at 未变化，跳过
		if (lastDraftUpdatedAt.current === draftUpdatedAt) return

		const timeSinceLastSave = Date.now() - selfSaveTimestamp.current
		lastDraftUpdatedAt.current = draftUpdatedAt

		// Skip reload triggered by our own draft writes
		if (pendingSelfSaveCount.current > 0) return
		if (!platformFetchInProgress && timeSinceLastSave < 15000)
			return // 外部写入，重新加载 draft
		;(async () => {
			try {
				const draft = await fileStorageService.loadDraft()
				if (draft) {
					setData(draft.data)
					if (draft.currentStep !== undefined) setCurrentStep(draft.currentStep)
					setPlatformFetchInProgress(false)
				}
			} catch {
				setPlatformFetchInProgress(false)
			}
		})()
	}, [draftUpdatedAt, fileStorageService, draftLoaded, platformFetchInProgress])

	// 卸载时保存草稿并清理
	useEffect(() => {
		return () => {
			const latestData = dataRef.current
			const latestStep = currentStepRef.current
			const hasContent =
				latestData.global.author.trim() !== "" || latestData.articles.length > 0
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

	const brandInfoRef = useRef<StepBrandInfoRef>(null)

	const handleBrandChange = useCallback(
		(field: "author" | "brandPosition" | "targetAudience", value: string) => {
			setData((prev) => ({
				...prev,
				global: { ...prev.global, [field]: value },
			}))
		},
		[],
	)

	const handleBrandImagesChange = useCallback((brandImages: BrandImageItem[]) => {
		setData((prev) => ({
			...prev,
			global: { ...prev.global, brandImages },
		}))
	}, [])

	const handleArticlesChange = useCallback((articles: ArticleDetail[]) => {
		setData((prev) => ({ ...prev, articles }))
	}, [])

	const handleArticleUpdate = useCallback((index: number, article: ArticleDetail) => {
		setData((prev) => {
			const newArticles = [...prev.articles]
			newArticles[index] = article
			return { ...prev, articles: newArticles }
		})
	}, [])

	const hasDraftContent = data.global.author.trim() !== "" || data.articles.length > 0

	const saveDraftIfNeeded = useCallback(
		async (step = currentStep) => {
			if (
				!fileStorageService ||
				!draftLoaded ||
				!hasDraftContent ||
				platformFetchInProgress ||
				showDraftPrompt ||
				showTemplateSelector
			) {
				return
			}

			pendingSelfSaveCount.current += 1
			selfSaveTimestamp.current = Date.now()
			try {
				await fileStorageService.saveDraft(data, step)
			} finally {
				window.setTimeout(() => {
					pendingSelfSaveCount.current = Math.max(0, pendingSelfSaveCount.current - 1)
				}, 3000)
			}
		},
		[
			fileStorageService,
			draftLoaded,
			hasDraftContent,
			platformFetchInProgress,
			showDraftPrompt,
			showTemplateSelector,
			data,
			currentStep,
		],
	)

	const saveDraftInBackground = useCallback(
		(step = currentStep) => {
			void saveDraftIfNeeded(step).catch((error) => {
				console.error("Failed to save draft in background:", error)
				message.error(t("detail.selfMedia.initPanel.draft.saveError"))
			})
		},
		[currentStep, saveDraftIfNeeded, t],
	)

	const navigateToStep = useCallback(
		async (step: number) => {
			await saveDraftIfNeeded(currentStep)
			setCurrentStep(step)
		},
		[saveDraftIfNeeded, currentStep],
	)

	const handleNext = useCallback(() => {
		if (currentStep === 0 && brandInfoRef.current) {
			const canProceedNow = brandInfoRef.current.checkBeforeNext()
			if (!canProceedNow) return
		}

		const nextStep = Math.min(currentStep + 1, STEPS.length - 1)
		setCurrentStep(nextStep)
		saveDraftInBackground(nextStep)
	}, [currentStep, saveDraftInBackground])

	const handlePrev = useCallback(async () => {
		const prevStep = Math.max(currentStep - 1, 0)
		await saveDraftIfNeeded(currentStep)
		setCurrentStep(prevStep)
	}, [currentStep, saveDraftIfNeeded])

	const hasPendingBrandImageUploads = data.global.brandImages.some(
		(img) => img.file.size > 0 && !img.uploadedPath,
	)

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
				return data.articles.length > 0 && data.articles.every((a) => a.title.trim() !== "")
			case 2:
				return data.articles.every((a) => !!a.platform)
			default:
				return true
		}
	}

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-gradient-to-br from-background via-background to-primary/[0.02]">
			{/* Header with step indicator */}
			<div className="relative border-b border-border/50 bg-background/80 backdrop-blur-sm">
				{/* Progress bar */}
				<div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary/10">
					<div
						className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500 ease-out"
						style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
					/>
				</div>

				<div className="flex items-center justify-center gap-1 px-6 py-5">
					{STEPS.map((step, index) => (
						<div key={step.key} className="flex items-center">
							<button
								type="button"
								className={cn(
									"flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 cursor-pointer",
									index === currentStep
										? "bg-primary/10 shadow-sm"
										: "opacity-70 hover:opacity-100 hover:bg-muted/50",
								)}
								onClick={() => navigateToStep(index)}
							>
								<div
									className={cn(
										"flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
										index === currentStep
											? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
											: index < currentStep
												? "bg-primary/20 text-primary"
												: "bg-muted text-muted-foreground",
									)}
								>
									{index < currentStep ? (
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2.5"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<polyline points="20 6 9 17 4 12" />
										</svg>
									) : (
										index + 1
									)}
								</div>
								<span
									className={cn(
										"text-sm font-medium transition-all duration-300 hidden sm:inline",
										index === currentStep
											? "text-foreground"
											: "text-muted-foreground",
									)}
								>
									{t(step.titleKey)}
								</span>
							</button>
							{index < STEPS.length - 1 && (
								<div
									className={cn(
										"mx-1 h-px w-6 transition-colors duration-300",
										index < currentStep ? "bg-primary/40" : "bg-border",
									)}
								/>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Step content */}
			<div className="flex-1 overflow-y-auto px-6 py-8">
				{/* Draft recovery prompt */}
				{showDraftPrompt && (
					<div className="mx-auto mb-6 max-w-lg rounded-xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
						<div className="mb-3 flex items-center gap-2">
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-primary"
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line x1="16" y1="13" x2="8" y2="13" />
								<line x1="16" y1="17" x2="8" y2="17" />
							</svg>
							<h3 className="text-sm font-semibold">
								{t("detail.selfMedia.initPanel.draft.detected")}
							</h3>
						</div>
						<p className="mb-4 text-xs text-muted-foreground">
							{t("detail.selfMedia.initPanel.draft.resumeHint", {
								step: (draftRef.current?.currentStep ?? 0) + 1,
							})}
						</p>
						<div className="flex items-center gap-3">
							<button
								type="button"
								className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
								onClick={handleRestoreDraft}
							>
								恢复草稿
							</button>
							<button
								type="button"
								className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
								onClick={handleDiscardDraft}
							>
								丢弃
							</button>
						</div>
					</div>
				)}

				{/* Template selector (shown before Step 1 when templates exist) */}
				{showTemplateSelector && (
					<div className="mx-auto mb-6 max-w-lg">
						<div className="mb-4 text-center">
							<h2 className="mb-1 text-lg font-bold">
								{t("detail.selfMedia.initPanel.template.selectTitle")}
							</h2>
							<p className="text-xs text-muted-foreground">
								{t("detail.selfMedia.initPanel.template.selectSubtitle")}
							</p>
						</div>
						<div className="flex flex-col gap-3">
							<button
								type="button"
								className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-4 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
								onClick={handleStartBlank}
							>
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
									<svg
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
										className="text-muted-foreground"
									>
										<line x1="12" y1="5" x2="12" y2="19" />
										<line x1="5" y1="12" x2="19" y2="12" />
									</svg>
								</div>
								<div>
									<div className="text-sm font-medium">空白开始</div>
									<div className="text-xs text-muted-foreground">
										从零开始创建新的内容方案
									</div>
								</div>
							</button>
							{templates.map((tpl) => (
								<button
									key={tpl.id}
									type="button"
									className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-4 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
									onClick={() => handleLoadTemplate(tpl.id)}
								>
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
										<svg
											width="20"
											height="20"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.5"
											strokeLinecap="round"
											strokeLinejoin="round"
											className="text-primary"
										>
											<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
											<polyline points="14 2 14 8 20 8" />
										</svg>
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium truncate">
											{tpl.name}
										</div>
										<div className="text-xs text-muted-foreground">
											{t("detail.selfMedia.initPanel.template.articleCount", {
												count: tpl.articleCount,
											})}
										</div>
									</div>
									<span className="text-[10px] text-muted-foreground/60 shrink-0">
										{new Date(tpl.createdAt).toLocaleDateString()}
									</span>
								</button>
							))}
						</div>
					</div>
				)}

				{!showDraftPrompt && !showTemplateSelector && (
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
							<StepTopicList
								articles={data.articles}
								onChange={handleArticlesChange}
								globalSettings={data.global}
							/>
						)}
						{currentStep === 2 && (
							<StepArticleDetail
								articles={data.articles}
								globalSettings={data.global}
								onArticleUpdate={handleArticleUpdate}
								onPersistDraft={() => void saveDraftIfNeeded()}
							/>
						)}
						{currentStep === 3 && (
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

			{/* Navigation buttons */}
			<div className="flex items-center justify-between border-t border-border/50 bg-background/80 backdrop-blur-sm px-6 py-4">
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
						currentStep === 0
							? "invisible"
							: "text-foreground hover:bg-muted active:scale-[0.98]",
					)}
					onClick={handlePrev}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="15 18 9 12 15 6" />
					</svg>
					{t("detail.selfMedia.initPanel.nav.prev")}
				</button>

				<div className="flex items-center gap-1.5">
					{STEPS.map((_, index) => (
						<button
							key={index}
							type="button"
							className={cn(
								"h-1.5 rounded-full transition-all duration-300 cursor-pointer hover:opacity-80",
								index === currentStep
									? "w-6 bg-primary"
									: index < currentStep
										? "w-1.5 bg-primary/40"
										: "w-1.5 bg-border",
							)}
							onClick={() => navigateToStep(index)}
							aria-label={t("detail.selfMedia.initPanel.nav.jumpTo", {
								title: t(STEPS[index].titleKey),
							})}
						/>
					))}
				</div>

				{currentStep < STEPS.length - 1 ? (
					<button
						type="button"
						className={cn(
							"flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium transition-all duration-200",
							canProceed()
								? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
								: "cursor-not-allowed bg-muted text-muted-foreground",
						)}
						onClick={handleNext}
						disabled={!canProceed()}
					>
						{t("detail.selfMedia.initPanel.nav.next")}
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
				) : (
					<div className="w-20" />
				)}
			</div>
		</div>
	)
}

export default observer(SelfMediaInitPanel)
