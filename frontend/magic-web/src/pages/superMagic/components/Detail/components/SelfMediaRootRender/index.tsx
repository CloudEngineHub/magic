import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import MagicSpin from "@/components/base/MagicSpin"
import magicToast from "@/components/base/MagicToaster/utils"
import { Flex } from "antd"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { topicModelStore } from "@/stores/superMagic"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"
import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { SelfMediaPlatform } from "../../types"
import UnsupportedPlatform from "./components/UnsupportedPlatform"
import { getPlatformComponent } from "./platforms"
import { SelfMediaStoreProvider, useSelfMediaStore } from "./stores"
import SelfMediaInitPanel from "./components/SelfMediaInitPanel"
import SelfMediaHomePage from "./components/SelfMediaHomePage"
import BrandConfigDialog from "./components/BrandConfigDialog"
import AICardCreateDialog from "./components/AICardCreateDialog"
import PrePublishAnalysisDialog from "./components/PrePublishAnalysisDialog"
import PrePublishAnalysisFloatingButton from "./components/PrePublishAnalysisFloatingButton"
import { SelfMediaFileStorageService } from "./services/SelfMediaFileStorageService"
import {
	resolveSelfMediaPostDirectoryAttachmentItem,
	resolveSelfMediaPostMentionFileId,
} from "./services/selfMediaCardChat"
import { resolveSelfMediaRootPath } from "./services/selfMediaPostPaths"
import {
	SELF_MEDIA_PRE_PUBLISH_TOPIC_PATTERN,
	sendSelfMediaPrePublishAnalysis,
	type SelfMediaPrePublishAnalysisGoal,
} from "./services/selfMediaPrePublishAnalysis"
import type { SelfMediaRootRenderProps } from "./types"

type SelfMediaRootMode = "home" | "create" | "platform"

/**
 * SelfMediaRootRender
 *
 * Hosts a `SelfMediaStoreProvider` that scopes a MobX `SelfMediaStore` to
 * the render tree below. All data + navigation state (slices / posts /
 * loading / active post + card / current view) lives in the store and is
 * driven by the upstream attachment tree via the store's `sync` lifecycle.
 *
 * The inner `observer` renders loading / unsupported. Each platform
 * component consumes the store through `useSelfMediaStore()`.
 */
function SelfMediaRootRender(props: SelfMediaRootRenderProps) {
	const {
		data,
		attachments,
		attachmentList,
		className,
		saveEditContent,
		selectedProject,
		allowEdit = false,
		openFileTab,
	} = props
	const folderFileId = data?.file_id
	const folderPath = resolveSelfMediaRootPath(data)

	// Access array lengths so that this observer component re-renders when items
	// are added to / removed from MobX observable arrays. Without this, mutations
	// to the same array reference would be invisible to the provider's useEffect.
	void attachments?.length
	void attachmentList?.length

	return (
		<SelfMediaStoreProvider
			folderFileId={folderFileId}
			attachments={attachments}
			attachmentList={attachmentList}
			initialNavigation={data?.initialNavigation}
		>
			<SelfMediaRootRenderInner
				attachmentList={attachmentList || attachments}
				className={className}
				allowEdit={allowEdit}
				saveEditContent={saveEditContent}
				selectedProject={selectedProject}
				folderFileId={folderFileId}
				folderPath={folderPath}
				openFileTab={openFileTab}
			/>
		</SelfMediaStoreProvider>
	)
}

interface SelfMediaRootRenderInnerProps {
	attachmentList: SelfMediaRootRenderProps["attachmentList"]
	className?: string
	allowEdit?: boolean
	saveEditContent?: SelfMediaRootRenderProps["saveEditContent"]
	selectedProject?: SelfMediaRootRenderProps["selectedProject"]
	folderFileId?: string
	folderPath?: string
	openFileTab?: (fileItem: any) => void
}

const SelfMediaRootRenderInner = observer(function SelfMediaRootRenderInner({
	attachmentList,
	className,
	allowEdit,
	saveEditContent,
	selectedProject,
	folderFileId,
	folderPath,
	openFileTab,
}: SelfMediaRootRenderInnerProps) {
	const { t } = useTranslation("super")
	const store = useSelfMediaStore()
	const [rootMode, setRootMode] = useState<SelfMediaRootMode | null>(null)
	const [aiCardDialogOpen, setAiCardDialogOpen] = useState(false)
	const [brandConfigOpen, setBrandConfigOpen] = useState(false)
	const [analysisTarget, setAnalysisTarget] = useState<{
		platform: SelfMediaPlatform
		index: number
	} | null>(null)
	const [analysisSubmitting, setAnalysisSubmitting] = useState(false)
	const analysisModelList =
		superMagicModeService.getModelGroupsByMode(
			SELF_MEDIA_PRE_PUBLISH_TOPIC_PATTERN as unknown as TopicMode,
		) ?? []
	const selectedAnalysisModel = topicModelStore.selectedLanguageModel

	const { platforms, resolvedPlatform: platform, rootLoading } = store
	const projectId = selectedProject?.id || ""
	const fileStorageService = useMemo(
		() =>
			projectId ? new SelfMediaFileStorageService(projectId, folderFileId, folderPath) : null,
		[projectId, folderFileId, folderPath],
	)

	// Detect empty project: no platforms configured and not loading
	const isEmptyProject = !rootLoading && platforms.length === 0
	const activeRootMode = rootMode ?? (isEmptyProject ? "create" : "home")

	useEffect(() => {
		if (rootLoading || rootMode !== null) return
		setRootMode(isEmptyProject && allowEdit ? "create" : "home")
	}, [isEmptyProject, rootLoading, rootMode, allowEdit])

	const handleStartCreateArticle = useCallback(() => {
		setRootMode("create")
	}, [])
	const handleOpenBrandConfig = useCallback(() => {
		setBrandConfigOpen(true)
	}, [])
	const handleOpenAICardCreate = useCallback(() => {
		setAiCardDialogOpen(true)
	}, [])
	const handleBackHome = useCallback(() => {
		store.goHomeList()
		setRootMode("home")
	}, [store])
	const handleOpenPost = useCallback(
		({ platform: nextPlatform, index }: { platform: SelfMediaPlatform; index: number }) => {
			store.handleChangePlatform(nextPlatform)
			store.openPostDetail(index)
			setRootMode("platform")
		},
		[store],
	)
	const handleEnsureHomePostLoaded = useCallback(
		({ platform: nextPlatform, index }: { platform: SelfMediaPlatform; index: number }) => {
			void store.ensurePlatformPostLoaded(nextPlatform, index)
		},
		[store],
	)
	const handleShowPlatform = useCallback(() => {
		setRootMode("platform")
	}, [])
	const handleOpenAICardFolder = useCallback(
		(folder: {
			file_id: string
			file_name?: string
			is_directory?: boolean
			children?: any[]
			display_config?: any
		}) => {
			openFileTab?.(folder)
		},
		[openFileTab],
	)
	const handleRequestPrePublishAnalysis = useCallback(
		(target: { platform: SelfMediaPlatform; index: number }) => {
			setAnalysisTarget(target)
		},
		[],
	)
	const handleRequestActivePrePublishAnalysis = useCallback(() => {
		if (!platform) return
		handleRequestPrePublishAnalysis({
			platform: platform as SelfMediaPlatform,
			index: store.activePostIndex,
		})
	}, [handleRequestPrePublishAnalysis, platform, store.activePostIndex])
	const handleConfirmPrePublishAnalysis = useCallback(
		async (
			analysisGoal: SelfMediaPrePublishAnalysisGoal,
			selectedModel: ModelItem | null,
		) => {
			if (!analysisTarget) return
			setAnalysisSubmitting(true)
			try {
				const post =
					(await store.ensurePlatformPostLoaded(
						analysisTarget.platform,
						analysisTarget.index,
					)) ||
					store.allPosts.find(
						(item) =>
							item.platform === analysisTarget.platform &&
							item.index === analysisTarget.index,
					)?.post
				const mentionFileId = resolveSelfMediaPostMentionFileId(post)
				const postDirectoryItem = resolveSelfMediaPostDirectoryAttachmentItem(
					attachmentList,
					mentionFileId,
				)
				if (!post || !postDirectoryItem) {
					magicToast.error(t("detail.selfMedia.analysis.startFailed"))
					return
				}
				await sendSelfMediaPrePublishAnalysis({
					selectedProject,
					platform: analysisTarget.platform,
					analysisGoal,
					selectedModel,
					post,
					postDirectoryItem,
				})
				setAnalysisTarget(null)
			} catch (error) {
				console.error("Self-media pre-publish analysis failed:", error)
				magicToast.error(t("detail.selfMedia.analysis.startFailed"))
			} finally {
				setAnalysisSubmitting(false)
			}
		},
		[analysisTarget, attachmentList, selectedProject, store, t],
	)

	const PlatformComponent = useMemo(() => getPlatformComponent(platform), [platform])

	if (rootLoading) {
		return (
			<Flex
				justify="center"
				align="center"
				className={cn("h-full w-full bg-background", className)}
				data-testid="self-media-root-loading"
			>
				<MagicSpin spinning />
			</Flex>
		)
	}

	if (activeRootMode === "create" && isEmptyProject) {
		if (!allowEdit) {
			return (
				<Flex
					justify="center"
					align="center"
					className={cn("h-full w-full bg-background", className)}
				>
					<p className="text-sm text-muted-foreground">
						{t("detail.selfMedia.home.subtitle")}
					</p>
				</Flex>
			)
		}
		return (
			<div
				className={cn("h-full min-h-0 w-full", className)}
				data-testid="self-media-init-panel"
			>
				<SelfMediaInitPanel
					selectedProject={selectedProject}
					folderFileId={folderFileId}
					folderPath={folderPath}
					attachmentList={attachmentList}
					onBackHome={handleBackHome}
				/>
			</div>
		)
	}

	if (activeRootMode === "home") {
		return (
			<div className={cn("h-full min-h-0 w-full", className)} data-testid="self-media-root">
				<SelfMediaHomePage
					posts={store.allPosts}
					attachmentList={attachmentList}
					onEnsurePostLoaded={handleEnsureHomePostLoaded}
					onCreateArticle={allowEdit ? handleStartCreateArticle : undefined}
					onOpenPost={handleOpenPost}
					onRequestPrePublishAnalysis={
						allowEdit ? handleRequestPrePublishAnalysis : undefined
					}
					onOpenBrandConfig={allowEdit ? handleOpenBrandConfig : undefined}
					onCreateAICard={allowEdit ? handleOpenAICardCreate : undefined}
					onOpenAICardFolder={openFileTab ? handleOpenAICardFolder : undefined}
					folderFileId={folderFileId}
				/>
				<BrandConfigDialog
					open={brandConfigOpen}
					onOpenChange={setBrandConfigOpen}
					fileStorageService={fileStorageService}
					attachmentList={attachmentList}
					projectId={projectId}
					folderPath={folderPath}
				/>
				<AICardCreateDialog
					open={aiCardDialogOpen}
					onOpenChange={setAiCardDialogOpen}
					projectId={projectId}
					folderPath={folderPath}
				/>
				<PrePublishAnalysisDialog
					open={Boolean(analysisTarget)}
					onOpenChange={(open) => {
						if (!open) setAnalysisTarget(null)
					}}
					onConfirm={handleConfirmPrePublishAnalysis}
					loading={analysisSubmitting}
					modelList={analysisModelList}
					selectedModel={selectedAnalysisModel}
				/>
			</div>
		)
	}

	if (activeRootMode === "create") {
		return (
			<div className={cn("h-full min-h-0 w-full", className)} data-testid="self-media-root">
				<div className="h-full min-h-0" data-testid="self-media-init-panel">
					<SelfMediaInitPanel
						selectedProject={selectedProject}
						folderFileId={folderFileId}
						folderPath={folderPath}
						attachmentList={attachmentList}
						onBackHome={handleBackHome}
					/>
				</div>
			</div>
		)
	}

	if (!PlatformComponent) {
		return (
			<div className={cn("h-full w-full", className)}>
				<UnsupportedPlatform platform={platform} />
				<button type="button" className="sr-only" onClick={handleShowPlatform}>
					{t("detail.selfMedia.home.openPlatform")}
				</button>
			</div>
		)
	}

	return (
		<div className={cn("relative h-full w-full", className)} data-testid="self-media-root">
			<Suspense
				fallback={
					<Flex justify="center" align="center" className="h-full w-full">
						<MagicSpin spinning />
					</Flex>
				}
			>
				<PlatformComponent
					platform={platform as SelfMediaPlatform}
					attachmentList={attachmentList}
					allowEdit={allowEdit}
					saveEditContent={saveEditContent}
					selectedProject={selectedProject}
					onBackHome={handleBackHome}
				/>
			</Suspense>
			{allowEdit && platform ? (
				<PrePublishAnalysisFloatingButton onClick={handleRequestActivePrePublishAnalysis} />
			) : null}
			<PrePublishAnalysisDialog
				open={Boolean(analysisTarget)}
				onOpenChange={(open) => {
					if (!open) setAnalysisTarget(null)
				}}
				onConfirm={handleConfirmPrePublishAnalysis}
				loading={analysisSubmitting}
				modelList={analysisModelList}
				selectedModel={selectedAnalysisModel}
			/>
		</div>
	)
})

export default observer(SelfMediaRootRender)
