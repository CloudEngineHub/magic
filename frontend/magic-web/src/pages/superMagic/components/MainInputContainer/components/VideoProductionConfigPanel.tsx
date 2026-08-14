import { BookOpen, ChevronDown } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { userStore } from "@/models/user"
import { useOptionalMessageEditorStore } from "@/pages/superMagic/components/MessageEditor/stores"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import {
	VIDEO_PRODUCTION_AGENT_CODE,
	isVideoProductionContext,
} from "../utils/videoProductionConfig"
import AIAutoSelectVisual from "../scenes/Slides/AIAutoSelectVisual"

interface VideoProductionConfigPanelProps {
	topicMode?: string
	agentCode?: string | null
	selectedTopic?: { agent_code?: string | null } | null
}

function VideoProductionConfigPanel({
	topicMode,
	agentCode,
	selectedTopic,
}: VideoProductionConfigPanelProps) {
	const { t } = useTranslation("super")
	const store = useOptionalMessageEditorStore()
	const isVisible = isVideoProductionContext({ topicMode, agentCode, selectedTopic })
	const expertCode = VIDEO_PRODUCTION_AGENT_CODE
	const userId = userStore.user.userInfo?.magic_id || userStore.user.userInfo?.user_id
	const selectedVideoModel = store?.topicModelStore.selectedVideoModel
	const [isGenerationPopoverOpen, setIsGenerationPopoverOpen] = useState(false)
	const [isDurationPopoverOpen, setIsDurationPopoverOpen] = useState(false)

	useEffect(() => {
		if (!store) return
		if (!isVisible) {
			store.videoProductionConfigStore.deactivate()
			return
		}
		store.videoProductionConfigStore.setContext({
			userId,
			agentCode: expertCode,
			model: selectedVideoModel,
		})
		return () => store.videoProductionConfigStore.deactivate()
	}, [expertCode, isVisible, selectedVideoModel, store, userId])

	if (!isVisible || !store) return null

	const configStore = store.videoProductionConfigStore
	const { capabilities, config } = configStore

	const triggerClass =
		"flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-full border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs outline-none transition-[color,box-shadow] hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 dark:bg-input/30 dark:hover:bg-input/50"
	const selectTriggerClass = `!h-8 min-w-[84px] ${triggerClass}`
	const popoverTriggerClass = `h-8 min-w-[84px] ${triggerClass}`
	const generationTriggerClass =
		"flex h-8 min-w-[112px] items-center justify-between gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground shadow-xs outline-none transition-colors hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
	const fieldClass = "relative flex items-center gap-2 whitespace-nowrap"

	return (
		<div
			className="relative flex min-h-16 w-full min-w-0 items-center justify-between gap-4 overflow-hidden rounded-xl border border-black/[0.08] bg-white/90 px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.06)] backdrop-blur-xl"
			data-testid="video-production-config-panel"
		>
			<AIAutoSelectVisual />
			<div className="relative z-10 flex w-full items-center justify-between gap-4">
				<button
					type="button"
					className="flex h-9 items-center gap-2 rounded-xl border border-border bg-white/75 px-3 text-sm font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-white disabled:cursor-default disabled:opacity-100"
					aria-label={t("messageEditor.videoProductionConfig.skill")}
					data-testid="video-production-skill"
				>
					<BookOpen className="size-4" />
					{t("messageEditor.videoProductionConfig.skill")}
				</button>

				<div className="flex items-center gap-4">
					{capabilities.showAspectRatio && (
						<label className={fieldClass}>
							<span className="text-sm font-normal text-foreground">
								{t("messageEditor.videoProductionConfig.aspectRatio")}
							</span>
							<Select
								value={config.aspectRatio ?? ""}
								onValueChange={(value) =>
									configStore.setConfig({ aspectRatio: value })
								}
							>
								<SelectTrigger
									aria-label={t(
										"messageEditor.videoProductionConfig.aspectRatio",
									)}
									className={selectTriggerClass}
								>
									<SelectValue>{config.aspectRatio ?? ""}</SelectValue>
								</SelectTrigger>
								<SelectContent
									align="start"
									showScrollButtons={false}
									className="min-w-[200px]"
								>
									{capabilities.aspectRatioOptions.map((option) => (
										<SelectItem
											key={option.value}
											value={option.value}
											className="min-h-10 py-2 pl-2.5 pr-8 text-xs font-medium [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1"
										>
											<span className="flex w-full min-w-0 items-center gap-1.5">
												<AspectRatioPreview aspectRatio={option.label} />
												<span className="min-w-0 shrink-0 truncate">
													{option.label}
												</span>
												<span className="ml-auto shrink-0 font-normal text-muted-foreground">
													{option.width}x{option.height}
												</span>
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</label>
					)}

					{capabilities.showDuration && (
						<label className={fieldClass}>
							<span className="text-sm font-normal text-foreground">
								{t("messageEditor.videoProductionConfig.duration")}
							</span>
							{capabilities.duration.type === "range" ? (
								<Popover
									open={isDurationPopoverOpen}
									onOpenChange={setIsDurationPopoverOpen}
								>
									<PopoverTrigger asChild>
										<button
											type="button"
											className={popoverTriggerClass}
											aria-label={t(
												"messageEditor.videoProductionConfig.duration",
											)}
											data-testid="video-production-duration-trigger"
										>
											<span>
												{config.durationSeconds ??
													capabilities.duration.min}
												s
											</span>
											<ChevronDown className="size-4 text-muted-foreground opacity-50" />
										</button>
									</PopoverTrigger>
									<PopoverContent
										align="start"
										sideOffset={8}
										className="w-64 rounded-xl p-4"
									>
										<div className="flex flex-col gap-3">
											<div className="flex items-center justify-between text-sm">
												<span className="text-muted-foreground">
													{t(
														"messageEditor.videoProductionConfig.duration",
													)}
												</span>
												<span className="font-medium text-foreground">
													{config.durationSeconds ??
														capabilities.duration.min}
													s
												</span>
											</div>
											<input
												type="range"
												min={capabilities.duration.min}
												max={capabilities.duration.max}
												step={capabilities.duration.step}
												value={
													config.durationSeconds ??
													capabilities.duration.min
												}
												onChange={(event) =>
													configStore.setConfig({
														durationSeconds: Number(event.target.value),
													})
												}
												className="w-full accent-primary"
												aria-label={t(
													"messageEditor.videoProductionConfig.duration",
												)}
											/>
											<div className="flex justify-between text-xs text-muted-foreground">
												<span>{capabilities.duration.min}s</span>
												<span>{capabilities.duration.max}s</span>
											</div>
										</div>
									</PopoverContent>
								</Popover>
							) : (
								<Select
									value={
										config.durationSeconds == null
											? ""
											: String(config.durationSeconds)
									}
									onValueChange={(value) =>
										configStore.setConfig({ durationSeconds: Number(value) })
									}
								>
									<SelectTrigger
										aria-label={t(
											"messageEditor.videoProductionConfig.duration",
										)}
										className={selectTriggerClass}
									>
										<SelectValue>
											{config.durationSeconds == null
												? ""
												: `${config.durationSeconds}s`}
										</SelectValue>
									</SelectTrigger>
									<SelectContent align="start" showScrollButtons={false}>
										{capabilities.duration.options.map((seconds) => (
											<SelectItem key={seconds} value={String(seconds)}>
												{seconds}s
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</label>
					)}

					{capabilities.showResolution && (
						<label className={fieldClass}>
							<span className="text-sm font-normal text-foreground">
								{t("messageEditor.videoProductionConfig.resolution")}
							</span>
							<Select
								value={config.resolution ?? ""}
								onValueChange={(value) =>
									configStore.setConfig({ resolution: value })
								}
							>
								<SelectTrigger
									aria-label={t("messageEditor.videoProductionConfig.resolution")}
									className={selectTriggerClass}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="start" showScrollButtons={false}>
									{capabilities.resolutionOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</label>
					)}

					<Popover
						open={isGenerationPopoverOpen}
						onOpenChange={setIsGenerationPopoverOpen}
					>
						<PopoverTrigger asChild>
							<button
								type="button"
								className={generationTriggerClass}
								aria-label={t("messageEditor.videoProductionConfig.generation")}
								data-testid="video-production-generation-trigger"
							>
								<span className="text-sm text-muted-foreground">
									{t("messageEditor.videoProductionConfig.generation")}
								</span>
								<span>
									{t(
										`messageEditor.videoProductionConfig.${config.generationMode}`,
									)}
								</span>
								<ChevronDown className="size-4 text-muted-foreground" />
							</button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							sideOffset={8}
							className="w-[360px] rounded-2xl p-3"
						>
							<div
								className="grid grid-cols-2 gap-2"
								data-testid="video-production-generation-options"
							>
								{(["normal", "detailed"] as const).map((mode) => (
									<button
										key={mode}
										type="button"
										className={`rounded-2xl border p-4 text-left transition-colors ${
											config.generationMode === mode
												? "border-foreground bg-foreground text-background"
												: "border-border bg-muted/30 text-foreground hover:bg-muted"
										}`}
										aria-pressed={config.generationMode === mode}
										onClick={() => {
											configStore.setConfig({ generationMode: mode })
											setIsGenerationPopoverOpen(false)
										}}
									>
										<div className="text-base font-semibold">
											{t(`messageEditor.videoProductionConfig.${mode}`)}
										</div>
										<div className="mt-1 text-xs leading-5 opacity-70">
											{t(
												`messageEditor.videoProductionConfig.${mode}Description`,
											)}
										</div>
									</button>
								))}
							</div>
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</div>
	)
}

const ASPECT_RATIO_ICON_BASE_SIZE = 16

function getAspectRatioIconSize(aspectRatio: string) {
	const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number)
	const ratio = rawWidth / rawHeight
	if (!Number.isFinite(ratio) || ratio <= 0) {
		return {
			iconWidth: ASPECT_RATIO_ICON_BASE_SIZE,
			iconHeight: Math.round((ASPECT_RATIO_ICON_BASE_SIZE * 9) / 16),
		}
	}
	return {
		iconWidth:
			ratio >= 1
				? ASPECT_RATIO_ICON_BASE_SIZE
				: Math.max(8, Math.round(ASPECT_RATIO_ICON_BASE_SIZE * ratio)),
		iconHeight:
			ratio >= 1
				? Math.max(8, Math.round(ASPECT_RATIO_ICON_BASE_SIZE / ratio))
				: ASPECT_RATIO_ICON_BASE_SIZE,
	}
}

/** 画幅预览：24px 灰底容器内按 16px 长边绘制比例矩形，四周留出 padding。 */
function AspectRatioPreview({ aspectRatio }: { aspectRatio: string }) {
	const { iconWidth, iconHeight } = getAspectRatioIconSize(aspectRatio)
	return (
		<span
			className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-input"
			aria-hidden="true"
		>
			<span
				className="block shrink-0 box-border rounded-[2px] border border-muted-foreground bg-white/40"
				style={{ width: iconWidth, height: iconHeight }}
			/>
		</span>
	)
}

export default observer(VideoProductionConfigPanel)
