import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { ElementInspectorOverlay } from "@/components/business/ElementInspector"
import { flattenAttachments } from "../../../../contents/HTML/utils"
import SelfMediaShellHeader from "../../components/SelfMediaShellHeader"
import { useSelfMediaInspector } from "../../hooks/useSelfMediaInspector"
import { useShellFileHandlers } from "../../hooks/useShellFileHandlers"
import { SelfMediaStoreProvider, useOptionalSelfMediaStore, useSelfMediaStore } from "../../stores"
import type { PlatformComponentProps, SelfMediaView } from "../../types"
import WechatArticleView, { type WechatArticleViewRef } from "./article"
import WechatCodeView from "./code"
import { WechatCoverPhonePanel } from "./WechatCoverPhonePanel"
import WechatEditView from "./edit"
import { WechatOfficialContentGate } from "./WechatOfficialContentGate"
import { wechatOfficialTokens } from "./tokens"

const TAB_ORDER: SelfMediaView[] = ["feed", "detail", "edit", "code"]

function WechatOfficialShell(props: PlatformComponentProps) {
	const store = useOptionalSelfMediaStore()
	if (store) return <WechatOfficialShellContent {...props} />

	return (
		<SelfMediaStoreProvider attachments={props.attachmentList}>
			<WechatOfficialShellContent {...props} />
		</SelfMediaStoreProvider>
	)
}

const WechatOfficialShellContent = observer(function WechatOfficialShellContent(
	props: PlatformComponentProps,
) {
	const { t } = useTranslation("super")
	const { platform, attachmentList, allowEdit, saveEditContent, selectedProject, onBackHome } =
		props
	const store = useSelfMediaStore()
	const { posts, loading, error, activePostIndex, view, rootLoading } = store

	const activePost = store.activePost ?? undefined
	const onChangeView = useCallback((nextView: SelfMediaView) => store.setView(nextView), [store])
	const onChangePost = useCallback(
		(nextIndex: number) => store.setActivePostIndex(nextIndex),
		[store],
	)
	const onEnsurePostLoaded = useCallback((idx: number) => store.ensurePostLoaded(idx), [store])

	const { handleAddFileToCurrentChat } = useShellFileHandlers({ attachmentList, activePost })

	const handleAddArticleToCurrentChat = useCallback(() => {
		handleAddFileToCurrentChat(activePost?.article?.fileId)
	}, [activePost, handleAddFileToCurrentChat])

	const handleGoToEdit = useCallback(() => {
		onChangeView("edit")
	}, [onChangeView])

	// Hide edit/code tabs when editing is not allowed (read-only / share mode)
	const visibleTabs = useMemo(
		() =>
			allowEdit === false ? TAB_ORDER.filter((v) => v !== "edit" && v !== "code") : TAB_ORDER,
		[allowEdit],
	)

	// Promote default "detail" to "feed" on first mount so users land on the cover list
	const promotedDefaultRef = useRef(false)
	useEffect(() => {
		if (promotedDefaultRef.current) return
		promotedDefaultRef.current = true
		if (view === "detail") {
			onChangeView("feed")
		}
	}, [view, onChangeView])

	// Normalize unsupported views (scroll) to the detail slot so switching from
	// another platform never leaves the shell with no visible tab.
	useEffect(() => {
		if (!TAB_ORDER.includes(view)) {
			onChangeView("detail")
		}
	}, [view, onChangeView])

	// Redirect away from edit/code views when editing is not allowed
	useEffect(() => {
		if (allowEdit === false && (view === "edit" || view === "code")) {
			onChangeView("detail")
		}
	}, [allowEdit, view, onChangeView])

	const [isArticleEditing, setIsArticleEditing] = useState(false)
	const editViewChangeHandlerRef = useRef<((nextView: SelfMediaView) => void) | null>(null)

	const [isCodeEditing, setIsCodeEditing] = useState(false)
	const codeViewChangeHandlerRef = useRef<((nextView: SelfMediaView) => void) | null>(null)

	const [mountedViews, setMountedViews] = useState(() => ({
		feed: view === "feed",
		detail: view === "detail",
		edit: view === "edit",
		code: view === "code",
	}))

	useEffect(() => {
		if (view === "scroll") return
		setMountedViews((prev) => (prev[view] ? prev : { ...prev, [view]: true }))
	}, [view])

	useEffect(() => {
		if (view !== "edit") setIsArticleEditing(false)
	}, [view])

	useEffect(() => {
		if (view !== "code") setIsCodeEditing(false)
	}, [view])

	const shouldRenderFeed = mountedViews.feed || view === "feed"
	const shouldRenderDetail = mountedViews.detail || view === "detail"
	const shouldRenderEdit = mountedViews.edit || view === "edit"
	const shouldRenderCode = mountedViews.code || view === "code"

	const articleViewRef = useRef<WechatArticleViewRef>(null)

	const inspectorGetIframes = useCallback(() => {
		const el = articleViewRef.current?.getIframeElement()
		return el ? [el] : []
	}, [])

	const inspectorGetFileInfo = useCallback(
		(_iframe: HTMLIFrameElement) => {
			// Wechat has a single article iframe per post
			const post = store.activePost
			const card = post?.article
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
		},
		[store, attachmentList],
	)

	const inspector = useSelfMediaInspector({
		getIframeElements: inspectorGetIframes,
		skipInjection: true,
		getFileInfoForIframe: inspectorGetFileInfo,
	})

	const inspectorDisabled = view !== "detail" || rootLoading

	// Auto-stop inspector when view changes
	useEffect(() => {
		if (inspector.active) inspector.stop()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [view])

	const tabLabels = useMemo(
		() => ({
			feed: t("detail.selfMedia.platform.wechat-official-accounts.tabs.cover"),
			detail: t("detail.selfMedia.platform.wechat-official-accounts.tabs.article"),
			edit: t("detail.selfMedia.platform.wechat-official-accounts.tabs.edit"),
			code: t("detail.selfMedia.platform.wechat-official-accounts.tabs.code"),
		}),
		[t],
	)

	const handleEditingStateChange = useCallback((editing: boolean) => {
		setIsArticleEditing(editing)
	}, [])

	const handleCodeEditingStateChange = useCallback((editing: boolean) => {
		setIsCodeEditing(editing)
	}, [])

	const handleRequestViewChangeReady = useCallback(
		(handler: ((nextView: SelfMediaView) => void) | null) => {
			editViewChangeHandlerRef.current = handler
		},
		[],
	)

	const handleCodeRequestViewChangeReady = useCallback(
		(handler: ((nextView: SelfMediaView) => void) | null) => {
			codeViewChangeHandlerRef.current = handler
		},
		[],
	)

	const handleGuardedViewChange = useCallback(
		(nextView: SelfMediaView) => {
			if (view === "edit" && isArticleEditing && nextView !== "edit") {
				editViewChangeHandlerRef.current?.(nextView)
				return
			}
			if (view === "code" && isCodeEditing && nextView !== "code") {
				codeViewChangeHandlerRef.current?.(nextView)
				return
			}
			onChangeView(nextView)
		},
		[view, isArticleEditing, isCodeEditing, onChangeView],
	)

	const handleFeedSelectPost = useCallback(
		(idx: number) => {
			onChangePost(idx)
			onChangeView("detail")
		},
		[onChangePost, onChangeView],
	)

	const handleRefresh = useCallback(() => {
		void store.init({ preserveNavigation: true })
	}, [store])

	return (
		<div
			className="flex h-full w-full flex-col"
			style={{ background: wechatOfficialTokens.background }}
			data-testid="wechat-official-shell"
		>
			<SelfMediaShellHeader
				platform={platform}
				posts={posts}
				activePostIndex={activePostIndex}
				view={view}
				tabLabels={tabLabels}
				visibleTabs={visibleTabs}
				onChangeView={handleGuardedViewChange}
				onRefresh={handleRefresh}
				onBackHome={onBackHome}
				refreshLabel={t("detail.selfMedia.refreshAllData")}
				refreshDisabled={rootLoading}
				refreshTestId="wechat-shell-refresh-post-button"
				onStartInspector={inspector.start}
				onStopInspector={inspector.stop}
				inspectorActive={inspector.active}
				inspectorDisabled={inspectorDisabled}
			/>

			<div className="relative flex-1 overflow-hidden">
				{shouldRenderFeed ? (
					<WechatCoverPhonePanel
						visible={view === "feed"}
						loading={loading}
						error={error}
						posts={posts}
						attachmentList={attachmentList}
						onSelectPost={handleFeedSelectPost}
						onEnsurePostLoaded={onEnsurePostLoaded}
					/>
				) : null}

				{shouldRenderDetail ? (
					<div
						className={
							view === "detail" ? "absolute inset-0 block" : "absolute inset-0 hidden"
						}
						aria-hidden={view !== "detail"}
					>
						<WechatOfficialContentGate
							loading={loading}
							error={error}
							hasPost={Boolean(activePost)}
						>
							{activePost ? (
								<WechatArticleView
									ref={articleViewRef}
									post={activePost}
									attachmentList={attachmentList}
									selectedProject={selectedProject}
									onAddToCurrentChat={handleAddArticleToCurrentChat}
									onGoToEdit={handleGoToEdit}
									onRefresh={handleRefresh}
									allowEdit={allowEdit}
								/>
							) : null}
						</WechatOfficialContentGate>
					</div>
				) : null}

				{shouldRenderEdit ? (
					<div
						className={
							view === "edit" ? "absolute inset-0 block" : "absolute inset-0 hidden"
						}
						aria-hidden={view !== "edit"}
					>
						<WechatOfficialContentGate
							loading={loading}
							error={error}
							hasPost={Boolean(activePost)}
						>
							{activePost ? (
								<WechatEditView
									post={activePost}
									attachmentList={attachmentList}
									saveEditContent={saveEditContent}
									selectedProject={selectedProject}
									onChangePost={onChangePost}
									onChangeView={onChangeView}
									onEditingStateChange={handleEditingStateChange}
									onRequestViewChangeReady={handleRequestViewChangeReady}
								/>
							) : null}
						</WechatOfficialContentGate>
					</div>
				) : null}

				{shouldRenderCode ? (
					<div
						className={
							view === "code" ? "absolute inset-0 block" : "absolute inset-0 hidden"
						}
						aria-hidden={view !== "code"}
					>
						<WechatOfficialContentGate
							loading={loading}
							error={error}
							hasPost={Boolean(activePost)}
						>
							{activePost ? (
								<WechatCodeView
									post={activePost}
									attachmentList={attachmentList}
									saveEditContent={saveEditContent}
									onChangePost={onChangePost}
									onChangeView={onChangeView}
									onEditingStateChange={handleCodeEditingStateChange}
									onRequestViewChangeReady={handleCodeRequestViewChangeReady}
								/>
							) : null}
						</WechatOfficialContentGate>
					</div>
				) : null}
				<ElementInspectorOverlay
					active={inspector.active}
					iframeRef={inspector.activeIframeRef}
					hoveredElement={inspector.hoveredElement}
					selectedElement={inspector.selectedElement}
					onClearSelection={() => {}}
					hideInfoCard
				/>
			</div>
		</div>
	)
})

export default WechatOfficialShell
