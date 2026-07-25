import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { ElementInspectorOverlay } from "@/components/business/ElementInspector"
import { flattenAttachments } from "../../../../contents/HTML/utils"
import type { CardFrameRef } from "../../components/CardFrame"
import ExportPreviewDialog from "../../components/ExportPreviewDialog"
import type { ExportPreviewConfirmArgs } from "../../components/ExportPreviewDialog"
import SelfMediaShellHeader, { SelfMediaShellViewBar } from "../../components/SelfMediaShellHeader"
import { SELF_MEDIA_WORKSPACE_BACKGROUND_STYLE } from "../../components/SelfMediaWorkspaceBackground"
import { useExportZip } from "../../hooks/useExportZip"
import { useExportProgressToast } from "../../hooks/useExportProgressToast"
import { usePhoneScaling } from "../../hooks/usePhoneScaling"
import { useSelfMediaInspector } from "../../hooks/useSelfMediaInspector"
import { useShellFileHandlers } from "../../hooks/useShellFileHandlers"
import { useShellMountedViews } from "../../hooks/useShellMountedViews"
import { useSelfMediaStore } from "../../stores"
import type { PlatformComponentProps, SelfMediaPost, SelfMediaView } from "../../types"
import { INSTAGRAM_PHONE_HEIGHT, INSTAGRAM_PHONE_WIDTH } from "./instagramShellConstants"
import { InstagramShellEditViewPanel } from "./InstagramShellEditViewPanel"
import { InstagramShellPhoneViewPanel } from "./InstagramShellPhoneViewPanel"
import { InstagramShellScrollViewPanel } from "./InstagramShellScrollViewPanel"

const noop = () => undefined

function InstagramShell(props: PlatformComponentProps) {
	const { t } = useTranslation("super")
	const {
		platform,
		attachmentList,
		allowEdit,
		saveEditContent,
		selectedProject,
		onBackHome,
		onUpdatePostTitle,
		onRequestPrePublishAnalysis,
		onSharePost,
		shareLoading,
	} = props
	const store = useSelfMediaStore()
	const { posts, activePostIndex, activeCardIndex, view, rootLoading } = store
	const activePost = store.activePost ?? undefined
	const activePostEntry = store.activePostEntry

	const cardRefs = useRef<Array<Array<CardFrameRef | null>>>([])
	const { containerRef, scale } = usePhoneScaling<HTMLDivElement>({
		designWidth: INSTAGRAM_PHONE_WIDTH + 28,
		designHeight: INSTAGRAM_PHONE_HEIGHT + 28,
	})
	const { progress, exportZip, exportLongImage } = useExportZip()
	const [exportDialogOpen, setExportDialogOpen] = useState(false)
	const [isExporting, setIsExporting] = useState(false)
	const editViewChangeHandlerRef = useRef<((nextView: SelfMediaView) => void) | null>(null)
	const editPostChangeHandlerRef = useRef<((nextPostIndex: number) => void) | null>(null)
	const shellDataReloadWithGuardRef = useRef<(() => void) | null>(null)

	const isScrollView = view === "scroll"
	const isEditView = view === "edit"
	const shouldShowFooter = view !== "detail" && view !== "edit"
	const [isCardEditing, setIsCardEditing] = useState(false)
	const [phoneFocused, setPhoneFocused] = useState(false)

	const { shouldRenderFeed, shouldRenderDetail, shouldRenderScroll, shouldRenderEdit } =
		useShellMountedViews(view)

	const { handleAddFileToCurrentChat, handleAddActivePostDirectoryToCurrentChat } =
		useShellFileHandlers({ attachmentList, activePost })

	useExportProgressToast(progress, "instagram-shell-export")

	const inspectorGetIframes = useCallback(() => {
		const iframes: HTMLIFrameElement[] = []
		const postIndex = store.activePostIndex
		const refs = cardRefs.current[postIndex]
		if (!refs) return iframes
		if (view === "detail") {
			const activeCard = refs[store.activeCardIndex]
			const el = activeCard?.getIframeElement()
			if (el) iframes.push(el)
		} else {
			for (const ref of refs) {
				const el = ref?.getIframeElement()
				if (el) iframes.push(el)
			}
		}
		return iframes
	}, [view, store])

	const inspectorGetFileInfo = useCallback(
		(iframe: HTMLIFrameElement) => {
			for (let pIdx = 0; pIdx < cardRefs.current.length; pIdx++) {
				const postRefs = cardRefs.current[pIdx]
				if (!postRefs) continue
				for (let cIdx = 0; cIdx < postRefs.length; cIdx++) {
					if (postRefs[cIdx]?.getIframeElement() === iframe) {
						const card = posts[pIdx]?.cards[cIdx]
						if (!card?.fileId) return undefined
						const file = flattenAttachments(attachmentList ?? []).find(
							(f) => f?.file_id === card.fileId,
						)
						if (!file) return undefined
						return {
							fileId: file.file_id,
							fileName: file.file_name,
							filePath: file.relative_file_path,
						}
					}
				}
			}
			return undefined
		},
		[posts, attachmentList],
	)

	const inspector = useSelfMediaInspector({
		getIframeElements: inspectorGetIframes,
		getFileInfoForIframe: inspectorGetFileInfo,
	})

	const inspectorDisabled = allowEdit === false || view === "edit" || rootLoading

	// Auto-stop inspector when view changes
	useEffect(() => {
		if (inspector.active) inspector.stop()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [view])

	useEffect(() => {
		if (view !== "edit") setIsCardEditing(false)
	}, [view])

	// Redirect away from edit view when editing is not allowed
	useEffect(() => {
		if (allowEdit === false && view === "edit") {
			store.setView("detail")
		}
	}, [allowEdit, view, store])

	const headerLabels = {
		feed: t("detail.selfMedia.platform.instagram.tabs.feed"),
		detail: t("detail.selfMedia.platform.instagram.tabs.detail"),
		scroll: t("detail.selfMedia.platform.instagram.tabs.scroll"),
		edit: t("detail.selfMedia.platform.instagram.tabs.edit"),
	}

	// Hide edit tab when editing is not allowed (read-only / share mode)
	const visibleTabs = useMemo<SelfMediaView[]>(
		() =>
			allowEdit === false
				? ["feed", "detail", "scroll"]
				: ["feed", "detail", "scroll", "edit"],
		[allowEdit],
	)
	const footerLabels = {
		home: t("detail.selfMedia.platform.instagram.footer.home"),
		search: t("detail.selfMedia.platform.instagram.footer.search"),
		create: t("detail.selfMedia.platform.instagram.footer.create"),
		reels: t("detail.selfMedia.platform.instagram.footer.reels"),
		profile: t("detail.selfMedia.platform.instagram.footer.profile"),
	}

	const handleOpenExportDialog = () => {
		setExportDialogOpen(true)
	}

	const handleBackHome = useCallback(() => {
		store.setView("feed")
	}, [store])

	const handleGuardedViewChange = useCallback(
		(nextView: SelfMediaView) => {
			if (view === "edit" && isCardEditing && nextView !== "edit") {
				editViewChangeHandlerRef.current?.(nextView)
				return
			}
			store.setView(nextView)
		},
		[view, isCardEditing, store],
	)

	const handleEditingStateChange = useCallback((editing: boolean) => {
		setIsCardEditing(editing)
	}, [])

	const handleRequestViewChangeReady = useCallback(
		(handler: ((nextView: SelfMediaView) => void) | null) => {
			editViewChangeHandlerRef.current = handler
		},
		[],
	)

	const handleRequestPostChangeReady = useCallback(
		(handler: ((nextPostIndex: number) => void) | null) => {
			editPostChangeHandlerRef.current = handler
		},
		[],
	)

	const handleDetailCardChange = useCallback(
		(nextCardIndex: number) => {
			if (view !== "detail") return
			store.setActiveCardIndex(nextCardIndex)
		},
		[store, view],
	)

	const handleGoToDetailEdit = useCallback(() => {
		store.setActiveCardIndex(activeCardIndex)
		store.setView("edit")
	}, [store, activeCardIndex])

	const handleSelectPostKeepingView = useCallback(
		(nextPostIndex: number) => {
			if (view === "edit" && isCardEditing) {
				editPostChangeHandlerRef.current?.(nextPostIndex)
				return
			}
			store.setActivePostIndex(nextPostIndex)
			store.setView(view)
			void store.ensurePostLoaded(nextPostIndex)
		},
		[view, isCardEditing, store],
	)

	const handleFeedSelectPost = useCallback(
		(idx: number) => {
			store.setActivePostIndex(idx)
			store.setView("detail")
		},
		[store],
	)

	const handleEnsurePostLoaded = useCallback(
		(idx: number) => store.ensurePostLoaded(idx),
		[store],
	)

	const handleAddDetailCardToCurrentChat = useCallback(
		(cardIndex: number) => {
			handleAddFileToCurrentChat(activePost?.cards[cardIndex]?.fileId)
		},
		[activePost, handleAddFileToCurrentChat],
	)

	const handleAddScrollCardToCurrentChat = useCallback(
		(cardIndex: number) => {
			handleAddFileToCurrentChat(activePost?.cards[cardIndex]?.fileId)
		},
		[activePost, handleAddFileToCurrentChat],
	)

	const handleAddFeedCardToCurrentChat = useCallback(
		(postIndex: number) => {
			handleAddFileToCurrentChat(posts[postIndex]?.cards[0]?.fileId)
		},
		[handleAddFileToCurrentChat, posts],
	)

	const handleShellDataReload = useCallback(() => {
		void store.init({ preserveNavigation: true })
	}, [store])

	const handleClickToolbarRefresh = useCallback(() => {
		const run = shellDataReloadWithGuardRef.current
		if (run) {
			run()
			return
		}
		handleShellDataReload()
	}, [handleShellDataReload])

	const handleRequestShellDataReloadReady = useCallback((handler: (() => void) | null) => {
		shellDataReloadWithGuardRef.current = handler
	}, [])

	const handleShellPointerDown = useCallback(() => {
		setPhoneFocused(false)
	}, [])

	const handlePhoneFocus = useCallback(() => {
		setPhoneFocused(true)
	}, [])

	const handleSaveTitle = useCallback(
		async (nextTitle: string) => {
			if (!activePostEntry || !onUpdatePostTitle) return false
			const saved = await onUpdatePostTitle(
				{ platform, index: activePostIndex, entry: activePostEntry },
				nextTitle,
			)
			if (saved === false) return false
			store.updatePostTitle(activePostIndex, nextTitle)
			return true
		},
		[activePostEntry, activePostIndex, onUpdatePostTitle, platform, store],
	)

	const handleConfirmExport = async ({
		postIndex,
		cardIndexes,
		pixelRatio,
		format,
		exportType,
		getCardRef,
	}: ExportPreviewConfirmArgs) => {
		if (!cardIndexes.length) return
		setIsExporting(true)
		try {
			const target = await store.ensurePostLoaded(postIndex)
			if (!target) return
			const subsetCards = cardIndexes
				.map((cardIndex) => target.cards[cardIndex])
				.filter((card): card is (typeof target.cards)[number] => Boolean(card))
			if (!subsetCards.length) return
			const subset: SelfMediaPost = {
				meta: target.meta,
				cards: subsetCards,
			}
			const getSubsetCardRef = (subsetCardIndex: number) => {
				const originalCardIndex = cardIndexes[subsetCardIndex]
				return (
					getCardRef(originalCardIndex) ||
					cardRefs.current[postIndex]?.[originalCardIndex] ||
					null
				)
			}
			if (exportType === "longImage") {
				await exportLongImage({
					post: subset,
					fileName: target.meta.title || target.meta.id,
					pixelRatio,
					format,
					getCardRef: getSubsetCardRef,
				})
			} else {
				await exportZip({
					posts: [subset],
					zipName: target.meta.title || target.meta.id,
					pixelRatio,
					format,
					getCardRef: (_p, c) => getSubsetCardRef(c),
				})
			}
			setExportDialogOpen(false)
		} finally {
			setIsExporting(false)
		}
	}

	const phoneShellVisible = !isScrollView && !isEditView

	useEffect(() => {
		if (!phoneShellVisible || view !== "detail") {
			setPhoneFocused(false)
		}
	}, [phoneShellVisible, view])

	return (
		<div
			className="relative flex h-full w-full flex-col"
			style={SELF_MEDIA_WORKSPACE_BACKGROUND_STYLE}
			onPointerDown={handleShellPointerDown}
			data-testid="instagram-shell-workspace"
		>
			<SelfMediaShellHeader
				platform={platform}
				posts={posts}
				activePostIndex={activePostIndex}
				view={view}
				tabLabels={headerLabels}
				visibleTabs={visibleTabs}
				onChangeView={handleGuardedViewChange}
				onRefresh={handleClickToolbarRefresh}
				onBackHome={onBackHome}
				refreshLabel={t("detail.selfMedia.refreshAllData")}
				refreshDisabled={rootLoading}
				refreshTestId="instagram-shell-refresh-post-button"
				onShare={onSharePost}
				shareLoading={shareLoading}
				onOpenExport={handleOpenExportDialog}
				exportLabel={t("detail.selfMedia.export.action")}
				exportDisabled={isExporting || posts.length === 0}
				onStartInspector={inspector.start}
				onStopInspector={inspector.stop}
				inspectorActive={inspector.active}
				inspectorDisabled={inspectorDisabled}
				onSaveTitle={allowEdit === false ? undefined : handleSaveTitle}
			/>
			<ExportPreviewDialog
				open={exportDialogOpen}
				onOpenChange={setExportDialogOpen}
				posts={posts}
				initialPostIndex={activePostIndex}
				attachmentList={attachmentList}
				onSyncActivePost={handleSelectPostKeepingView}
				onConfirm={handleConfirmExport}
				isExporting={isExporting}
			/>
			<div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
				<InstagramShellEditViewPanel
					shouldRender={shouldRenderEdit}
					isActive={isEditView}
					attachmentList={attachmentList}
					saveEditContent={saveEditContent}
					selectedProject={selectedProject}
					onEditingStateChange={handleEditingStateChange}
					onRequestViewChangeReady={handleRequestViewChangeReady}
					onRequestPostChangeReady={handleRequestPostChangeReady}
					onAddCardToCurrentChat={handleAddDetailCardToCurrentChat}
					onShellDataReload={handleShellDataReload}
					onRequestShellDataReloadReady={handleRequestShellDataReloadReady}
				/>
				<InstagramShellScrollViewPanel
					shouldRender={shouldRenderScroll}
					isActive={isScrollView}
					attachmentList={attachmentList}
					allowEdit={allowEdit}
					cardRefs={cardRefs}
					onAddCardToCurrentChat={handleAddScrollCardToCurrentChat}
					onAddActivePostDirectoryToCurrentChat={
						handleAddActivePostDirectoryToCurrentChat
					}
				/>
				<InstagramShellPhoneViewPanel
					visible={phoneShellVisible}
					scale={scale}
					posts={posts}
					activePostIndex={activePostIndex}
					shouldRenderFeed={shouldRenderFeed}
					shouldRenderDetail={shouldRenderDetail}
					shouldShowFooter={shouldShowFooter}
					attachmentList={attachmentList}
					allowEdit={allowEdit}
					cardRefs={cardRefs}
					footerLabels={footerLabels}
					onBackHome={handleBackHome}
					onSelectFeedPost={handleFeedSelectPost}
					onEnsurePostLoaded={handleEnsurePostLoaded}
					onChangeDetailCard={handleDetailCardChange}
					onAddFeedCardToCurrentChat={handleAddFeedCardToCurrentChat}
					onAddDetailCardToCurrentChat={handleAddDetailCardToCurrentChat}
					onAddActivePostDirectoryToCurrentChat={
						handleAddActivePostDirectoryToCurrentChat
					}
					onGoToEdit={handleGoToDetailEdit}
					phoneFocused={phoneFocused}
					onPhoneFocus={handlePhoneFocus}
				/>
				<ElementInspectorOverlay
					active={inspector.active}
					iframeRef={inspector.activeIframeRef}
					hoveredElement={inspector.hoveredElement}
					selectedElement={inspector.selectedElement}
					onClearSelection={noop}
					hideInfoCard
				/>
			</div>
			<SelfMediaShellViewBar
				view={view}
				tabLabels={headerLabels}
				visibleTabs={visibleTabs}
				onChangeView={handleGuardedViewChange}
				onRequestPrePublishAnalysis={allowEdit ? onRequestPrePublishAnalysis : undefined}
			/>
		</div>
	)
}

export default observer(InstagramShell)
