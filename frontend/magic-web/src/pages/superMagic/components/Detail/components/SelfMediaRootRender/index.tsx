import { Suspense, useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { observer } from "mobx-react-lite"
import MagicSpin from "@/components/base/MagicSpin"
import { Flex } from "antd"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { SelfMediaPlatform } from "../../types"
import {
	SelfMediaPlatformChromeProvider,
	useSelfMediaPlatformChrome,
} from "./context/PlatformChromeContext"
import PlatformSwitcher from "./components/PlatformSwitcher"
import UnsupportedPlatform from "./components/UnsupportedPlatform"
import { getPlatformComponent } from "./platforms"
import { SelfMediaStoreProvider, useSelfMediaStore } from "./stores"
import SelfMediaInitPanel from "./components/SelfMediaInitPanel"
import type { SelfMediaRootRenderProps } from "./types"

/**
 * SelfMediaRootRender
 *
 * Hosts a `SelfMediaStoreProvider` that scopes a MobX `SelfMediaStore` to
 * the render tree below. All data + navigation state (slices / posts /
 * loading / active post + card / current view) lives in the store and is
 * driven by the upstream attachment tree via the store's `sync` lifecycle.
 *
 * The inner `observer` renders loading / unsupported; when a platform
 * shell mounts, the multi-platform switcher is portaled into the shell
 * header host via `SelfMediaPlatformChromeProvider`. Each platform
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
	} = props
	const folderFileId = data?.file_id
	const folderPath = data?.file_name || ""

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
			<SelfMediaPlatformChromeProvider>
				<SelfMediaRootRenderInner
					attachmentList={attachmentList || attachments}
					className={className}
					allowEdit={allowEdit}
					saveEditContent={saveEditContent}
					selectedProject={selectedProject}
					folderFileId={folderFileId}
					folderPath={folderPath}
				/>
			</SelfMediaPlatformChromeProvider>
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
}

const SelfMediaRootRenderInner = observer(function SelfMediaRootRenderInner({
	attachmentList,
	className,
	allowEdit,
	saveEditContent,
	selectedProject,
	folderFileId,
	folderPath,
}: SelfMediaRootRenderInnerProps) {
	const { t } = useTranslation("super")
	const store = useSelfMediaStore()
	const { hostElement } = useSelfMediaPlatformChrome()
	const [isCreatingArticle, setIsCreatingArticle] = useState(false)

	const { platforms, resolvedPlatform: platform, rootLoading } = store

	// Detect empty project: no platforms configured and not loading
	const isEmptyProject = !rootLoading && platforms.length === 0

	const handleChangePlatform = useCallback(
		(next: SelfMediaPlatform) => {
			store.handleChangePlatform(next)
		},
		[store],
	)
	const handleStartCreateArticle = useCallback(() => {
		setIsCreatingArticle(true)
	}, [])
	const handleBackToContent = useCallback(() => {
		setIsCreatingArticle(false)
	}, [])

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

	if (isEmptyProject) {
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
				/>
			</div>
		)
	}

	const platformSwitcherNode =
		hostElement &&
		createPortal(
			<div className="flex items-center gap-2">
				{isCreatingArticle ? (
					<button
						type="button"
						className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
						onClick={handleBackToContent}
						data-testid="self-media-back-to-content"
					>
						{t("detail.selfMedia.platform.actions.back")}
					</button>
				) : (
					<>
						{platforms.length > 1 && (
							<span className="text-xs text-muted-foreground">
								{t("detail.selfMedia.platform.switcher.label")}
							</span>
						)}
						<PlatformSwitcher
							platforms={platforms}
							activePlatform={platform}
							onChange={handleChangePlatform}
						/>
						<button
							type="button"
							className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							onClick={handleStartCreateArticle}
							data-testid="self-media-create-article"
						>
							{t("detail.selfMedia.platform.actions.create")}
						</button>
					</>
				)}
			</div>,
			hostElement,
		)

	if (isCreatingArticle) {
		return (
			<div className={cn("h-full min-h-0 w-full", className)} data-testid="self-media-root">
				{platformSwitcherNode}
				<div className="min-h-0 h-full" data-testid="self-media-init-panel">
					<SelfMediaInitPanel
						selectedProject={selectedProject}
						folderFileId={folderFileId}
						folderPath={folderPath}
						attachmentList={attachmentList}
					/>
				</div>
			</div>
		)
	}

	if (!PlatformComponent) {
		return (
			<div className={cn("h-full w-full", className)}>
				<UnsupportedPlatform platform={platform} />
			</div>
		)
	}

	return (
		<div className={cn("h-full w-full", className)} data-testid="self-media-root">
			{platformSwitcherNode}
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
				/>
			</Suspense>
		</div>
	)
})

export default observer(SelfMediaRootRender)
