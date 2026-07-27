import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { useParams } from "react-router"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"

import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { useFileOpen } from "@/pages/superMagic/components/TopicFilesButton/hooks/useFileOpen"
import { useMobileFilePreviewPubSub } from "@/pages/superMagic/hooks/useMobileFilePreviewPubSub"
import { FileActionVisibilityProvider } from "@/pages/superMagic/providers/file-action-visibility-provider"
import PreviewDetailPopup, {
	type PreviewDetail,
	type PreviewDetailPopupRef,
} from "@/pages/superMagicMobile/components/PreviewDetailPopup"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import { cn } from "@/lib/utils"

import MicroAppConversationFloatingButton from "./components/MicroAppMobileConversation/MicroAppConversationFloatingButton"
import MicroAppMobileHeader from "./components/MicroAppMobileHeader"
import MicroAppPageOverlays from "./components/MicroAppPageOverlays"
import MicroAppPageLoadingState from "./components/MicroAppPageLoadingState"
import { AppStoreProvider } from "./context"
import { useMicroAppPageController } from "./hooks/useMicroAppPageController"
import { useMicroAppProjectResolver } from "./hooks/useMicroAppProjectResolver"

const MicroAppDatabasePanelMobile = lazy(() => import("./components/MicroAppDatabasePanelMobile"))
const MicroAppMobileConversation = lazy(() => import("./components/MicroAppMobileConversation"))
const MicroAppMobileEntryPreview = lazy(() => import("./components/MicroAppMobileEntryPreview"))

type MobileMicroAppPanel = "preview" | "files"

function MobilePanelTab({
	active,
	label,
	onClick,
	testId,
}: {
	active: boolean
	label: string
	onClick: () => void
	testId: string
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onClick}
			className={cn(
				"relative flex h-9 items-center justify-center text-sm transition-colors [-webkit-tap-highlight-color:transparent]",
				active ? "font-medium text-primary" : "text-muted-foreground",
			)}
			data-testid={testId}
		>
			{label}
			<span
				className={cn(
					"absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-opacity",
					active ? "opacity-100" : "opacity-0",
				)}
				aria-hidden
			/>
		</button>
	)
}

function MicroAppPageMobileInner({
	appId,
	projectId,
	isPublished,
	onPublishStatusChange,
}: {
	appId: string
	projectId: string
	isPublished: boolean
	onPublishStatusChange: (published: boolean) => void
}) {
	const { t } = useTranslation("super")
	const [activePanel, setActivePanel] = useState<MobileMicroAppPanel>("preview")
	const [conversationOpen, setConversationOpen] = useState(false)
	const [previewFileId, setPreviewFileId] = useState<string | null>(null)
	const previewDetailPopupRef = useRef<PreviewDetailPopupRef>(null)
	const linkPreviewPopupRef = useRef<PreviewDetailPopupRef>(null)
	const controller = useMicroAppPageController(appId, projectId)
	const {
		store,
		conversation,
		selectedProject,
		selectedTopic,
		hasRunningTopic,
		isReadOnly,
		canEdit,
		attachments,
		attachmentList,
		defaultEntryFile,
		topicFilesProps,
		handleBackToMicroApps,
		handleOpenPublishDialog,
		handleToggleDatabasePanel,
		checkAttachmentsNowDebounced,
		publishDialogOpen,
		setPublishDialogOpen,
		editDialogOpen,
		setEditDialogOpen,
		editSubmitting,
		isDatabasePanelOpen,
		setIsDatabasePanelOpen,
		CollaboratorUpdatePanel,
		canManageCollaborators,
		handleManageCollaborators,
		handleProjectNameChange,
		captureCoverReady,
		handleCaptureCover,
		handleEditMicroApp,
	} = controller

	const setPreviewDetail = useMemoizedFn((detail: PreviewDetail | null) => {
		if (!detail) return
		previewDetailPopupRef.current?.open(detail, attachments, attachmentList)
	})
	const setLinkPreviewDetail = useMemoizedFn((detail: PreviewDetail | null) => {
		if (!detail) return
		linkPreviewPopupRef.current?.open(detail, attachments, attachmentList)
	})
	const { handleOpenFile: openFilePreview } = useFileOpen({
		attachments,
		setUserSelectDetail: setPreviewDetail,
	})
	const handlePreviewFile = useMemoizedFn((value?: unknown) => {
		const fileItem = value as AttachmentItem | undefined
		const fileId = fileItem?.file_id
		if (!fileId || fileItem.is_directory) return

		const targetFile = attachmentList.find((item) => item.file_id === fileId) || fileItem
		setPreviewFileId(fileId)
		openFilePreview(targetFile)
	})

	useMobileFilePreviewPubSub({
		attachmentList,
		setUserSelectDetail: setPreviewDetail,
		onFileClick: handlePreviewFile,
	})

	useEffect(() => {
		setActivePanel("preview")
		setConversationOpen(false)
		setPreviewFileId(null)
	}, [projectId])

	if (store.initLoading) {
		return <MicroAppPageLoadingState mobile testId="micro-app-mobile-project-loading" />
	}

	if (store.initError) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-mobile-background px-6 text-center">
				<p className="text-sm text-destructive">{store.initError}</p>
				<button
					type="button"
					className="text-sm font-medium text-primary"
					onClick={handleBackToMicroApps}
				>
					{t("microAppPage.header.backToApps")}
				</button>
			</div>
		)
	}

	return (
		<FileActionVisibilityProvider>
			<div
				className="absolute inset-0 flex h-full min-h-0 w-full flex-col overflow-hidden bg-mobile-background"
				data-testid="micro-app-page-mobile"
			>
				<MicroAppMobileHeader
					selectedProject={selectedProject}
					hasEntries={Boolean(defaultEntryFile)}
					isPublished={isPublished}
					isDatabasePanelOpen={isDatabasePanelOpen}
					onBack={handleBackToMicroApps}
					onToggleDatabasePanel={handleToggleDatabasePanel}
					onPublish={handleOpenPublishDialog}
					canEdit={canEdit}
					onEdit={() => setEditDialogOpen(true)}
					canManageCollaborators={canManageCollaborators}
					onManageCollaborators={handleManageCollaborators}
				/>

				<div
					className="grid shrink-0 grid-cols-2 border-b border-border bg-background px-3"
					role="tablist"
					aria-label={t("microAppPage.mobileTabs.ariaLabel")}
				>
					<MobilePanelTab
						active={activePanel === "preview"}
						label={t("microAppPage.mobileTabs.preview")}
						onClick={() => setActivePanel("preview")}
						testId="micro-app-mobile-tab-preview"
					/>
					<MobilePanelTab
						active={activePanel === "files"}
						label={t("microAppPage.mobileTabs.files")}
						onClick={() => setActivePanel("files")}
						testId="micro-app-mobile-tab-files"
					/>
				</div>

				<div className="relative min-h-0 flex-1 overflow-hidden bg-background">
					<div
						className={cn("absolute inset-0", activePanel !== "preview" && "hidden")}
						data-testid="micro-app-mobile-preview-panel"
					>
						<Suspense fallback={null}>
							<MicroAppMobileEntryPreview
								entryFile={defaultEntryFile}
								attachments={attachments}
								attachmentList={attachmentList}
								selectedProject={selectedProject}
								allowEdit={!isReadOnly}
								onOpenFile={handlePreviewFile}
								isBuilding={hasRunningTopic}
							/>
						</Suspense>
					</div>

					{activePanel === "files" ? (
						<div
							className="absolute inset-0 overflow-hidden py-1"
							data-testid="micro-app-mobile-files-panel"
						>
							<TopicFilesButton
								{...topicFilesProps}
								title={t("microAppPage.header.codeFiles")}
								activeFileId={previewFileId}
								onFileClick={handlePreviewFile}
							/>
						</div>
					) : null}
				</div>

				<MicroAppConversationFloatingButton onClick={() => setConversationOpen(true)} />
			</div>

			<MicroAppPageOverlays
				appId={appId}
				projectName={selectedProject?.project_name}
				publishDialogOpen={publishDialogOpen}
				onPublishDialogOpenChange={setPublishDialogOpen}
				onPublishStatusChange={onPublishStatusChange}
				onProjectNameChange={handleProjectNameChange}
				editDialogOpen={editDialogOpen}
				editSubmitting={editSubmitting}
				onEditDialogOpenChange={setEditDialogOpen}
				onEditMicroApp={handleEditMicroApp}
				onCaptureCover={captureCoverReady ? handleCaptureCover : undefined}
				collaboratorPanel={CollaboratorUpdatePanel}
			/>
			{isDatabasePanelOpen ? (
				<Suspense fallback={null}>
					<MicroAppDatabasePanelMobile
						open={isDatabasePanelOpen}
						projectId={selectedProject?.id}
						projectName={selectedProject?.project_name}
						onOpenChange={setIsDatabasePanelOpen}
					/>
				</Suspense>
			) : null}
			{conversationOpen ? (
				<Suspense fallback={null}>
					<MicroAppMobileConversation
						open={conversationOpen}
						selectedProject={selectedProject}
						topicStore={conversation.topicStore}
						mentionPanelStore={store.mentionPanelStore}
						projectFilesStore={store.projectFilesStore}
						attachments={attachments}
						onTerminalTopicStatusChange={checkAttachmentsNowDebounced}
						onOpenFile={handlePreviewFile}
						onOpenChange={setConversationOpen}
					/>
				</Suspense>
			) : null}
			<PreviewDetailPopup
				ref={previewDetailPopupRef}
				setUserSelectDetail={setPreviewDetail}
				selectedTopic={selectedTopic}
				selectedProject={selectedProject}
				allowEdit={!isReadOnly}
				onOpenNewPopup={(detail, attachmentTree, nextAttachmentList) => {
					linkPreviewPopupRef.current?.open(detail, attachmentTree, nextAttachmentList)
				}}
			/>
			<PreviewDetailPopup
				ref={linkPreviewPopupRef}
				setUserSelectDetail={setLinkPreviewDetail}
				selectedTopic={selectedTopic}
				selectedProject={selectedProject}
				allowEdit={!isReadOnly}
			/>
		</FileActionVisibilityProvider>
	)
}

const MicroAppPageMobileInnerObserver = observer(MicroAppPageMobileInner)

export default function MicroAppPageMobile() {
	const { appId = "" } = useParams<{ appId: string }>()
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const { projectId, isPublished, setIsPublished, loading, error } =
		useMicroAppProjectResolver(appId)

	useEffect(() => {
		if (!appId) {
			navigate({ name: RouteName.MicroApps, replace: true })
		}
	}, [appId, navigate])

	if (!appId || loading) {
		return <MicroAppPageLoadingState mobile testId="micro-app-mobile-resolver-loading" />
	}

	if (error || !projectId) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-mobile-background px-6 text-center">
				<p className="text-sm text-destructive">
					{error?.message || t("microAppPage.errors.loadFailed")}
				</p>
				<button
					type="button"
					className="text-sm font-medium text-primary"
					onClick={() => navigate({ name: RouteName.MicroApps })}
				>
					{t("microAppPage.header.backToApps")}
				</button>
			</div>
		)
	}

	return (
		<AppStoreProvider>
			<MicroAppPageMobileInnerObserver
				appId={appId}
				projectId={projectId}
				isPublished={isPublished}
				onPublishStatusChange={setIsPublished}
			/>
		</AppStoreProvider>
	)
}
