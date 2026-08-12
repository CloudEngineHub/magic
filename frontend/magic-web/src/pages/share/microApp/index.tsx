import { type ComponentProps, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router"
import { useTranslation } from "react-i18next"
import {
	Building2,
	ChevronDown,
	FileCode2,
	Loader2,
	LogIn,
	LogOut,
	ShieldCheck,
} from "lucide-react"
import { ErrorDisplay, PasswordVerification, ShareEmptyState } from "@/pages/share/components"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import { MicroAppPermissionIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { resolveDefaultHtmlEntry } from "@/pages/superMagic/pages/MicroAppPage/utils/microAppFiles"
import {
	ProjectStatus,
	type ProjectListItem,
	TopicMode,
} from "@/pages/superMagic/pages/Workspace/types"
import MagicDropdown from "@/components/base/MagicDropdown"
import UserAvatarRender from "@/components/business/UserAvatarRender"
import OrganizationList from "@/layouts/BaseLayout/components/Sider/components/OrganizationSwitch/OrganizationList"
import { OrganizationSwitchPanel } from "@/layouts/BaseLayoutMobile/components/OrganizationSwitch"
import useLogout from "@/hooks/account/useLogout"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useAuthorization, useOrganization, useUserInfo } from "@/models/user/hooks"
import { RouteName } from "@/routes/constants"
import { history } from "@/routes/history"
import GlobalSidebarStore from "@/stores/display/GlobalSidebarStore"
import { buildLoginRedirectSearchParams } from "@/pages/login/utils/loginRedirect"
import MicroAppSafetyNotice from "./components/MicroAppSafetyNotice"
import useMicroAppSafetyNoticeConfirmation from "./hooks/useMicroAppSafetyNoticeConfirmation"
import useMicroAppShareData from "./hooks/useMicroAppShareData"

type MicroAppPreviewMode = NonNullable<ComponentProps<typeof HtmlPreviewContent>["viewMode"]>

function createShareProject(projectId: string, projectName: string): ProjectListItem {
	return {
		id: projectId,
		project_name: projectName || projectId,
		project_status: ProjectStatus.WAITING,
		project_mode: TopicMode.General,
		workspace_id: "",
		work_dir: "",
		workspace_name: "",
		current_topic_id: "",
		current_topic_status: "",
		created_at: "",
		updated_at: "",
		tag: "",
	}
}

const transparentDropdownOverlayClassName =
	"!rounded-none !border-0 !bg-transparent !p-0 !shadow-none data-[state=open]:!animate-none data-[state=closed]:!animate-none"

function MicroAppShareEmpty() {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/20 px-8 text-center"
			data-testid="micro-app-share-empty"
		>
			<div className="flex size-12 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
				<FileCode2 size={22} />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-foreground">
					{t("microAppShare.noEntryTitle")}
				</p>
				<p className="max-w-[360px] text-sm text-muted-foreground">
					{t("microAppShare.noEntryDescription")}
				</p>
			</div>
		</div>
	)
}

function buildPreviewFile(entryFile: AttachmentItem) {
	return {
		...entryFile,
		file_id: entryFile.file_id,
		file_name: entryFile.file_name || entryFile.filename || entryFile.name,
		file_extension: entryFile.file_extension,
		display_config: entryFile.display_config,
	}
}

function convertToQuery(params: URLSearchParams): Record<string, string> {
	const query: Record<string, string> = {}
	params.forEach((value, key) => {
		query[key] = value
	})
	return query
}

function goLogin() {
	history.replace({
		name: RouteName.Login,
		query: convertToQuery(
			buildLoginRedirectSearchParams({
				currentHref: window.location.href,
				redirectTarget: window.location.href,
			}),
		),
	})
}

interface MicroAppShareHeaderProps {
	appName?: string
	showPermissionManager: boolean
	onOpenPermissionManager: () => void
}

function MicroAppShareHeader({
	appName,
	showPermissionManager,
	onOpenPermissionManager,
}: MicroAppShareHeaderProps) {
	const { t } = useTranslation("super")
	const { t: tInterface } = useTranslation("interface")
	const isMobile = useIsMobile()
	const { userInfo } = useUserInfo()
	const { authorization } = useAuthorization()
	const { organizations, organizationCode, teamshareOrganizationCode, magicOrganizationMap } =
		useOrganization()
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [organizationMenuOpen, setOrganizationMenuOpen] = useState(false)
	const logout = useLogout({ onConfirm: () => setUserMenuOpen(false) })

	const isLoggedIn = Boolean(userInfo?.user_id || authorization?.trim())
	const displayName =
		userInfo?.real_name || userInfo?.nickname || userInfo?.magic_id || t("microAppShare.user")
	const organizationName = useMemo(() => {
		const teamshareOrganization = organizations.find(
			(item) => item.organization_code === teamshareOrganizationCode,
		)
		if (teamshareOrganization?.organization_name) return teamshareOrganization.organization_name

		const magicOrganization = organizationCode ? magicOrganizationMap[organizationCode] : null
		return (
			magicOrganization?.organization_name ||
			teamshareOrganizationCode ||
			organizationCode ||
			""
		)
	}, [magicOrganizationMap, organizationCode, organizations, teamshareOrganizationCode])

	const handleLogout = useCallback(() => {
		void logout()
	}, [logout])
	const handleOpenMobileOrganizationSwitch = useCallback(() => {
		GlobalSidebarStore.openOrganizationSwitch()
	}, [])

	const handleUserMenuOpenChange = useCallback((open: boolean) => {
		setUserMenuOpen(open)
		if (!open) {
			setOrganizationMenuOpen(false)
		}
	}, [])

	const handleOrganizationListClose = useCallback(() => {
		setOrganizationMenuOpen(false)
		setUserMenuOpen(false)
	}, [])

	const renderOrganizationList = () => (
		<Suspense fallback={null}>
			<OrganizationList onClose={handleOrganizationListClose} />
		</Suspense>
	)

	const renderUserMenu = () => (
		<div
			className="w-[264px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground"
			data-testid="micro-app-share-user-menu"
		>
			<MagicDropdown
				placement="leftTop"
				open={organizationMenuOpen}
				onOpenChange={setOrganizationMenuOpen}
				trigger={["click"]}
				popupRender={renderOrganizationList}
				overlayClassName={transparentDropdownOverlayClassName}
			>
				<button
					type="button"
					className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
					data-testid="micro-app-share-organization-trigger"
				>
					<Building2 className="size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1 truncate">
						{organizationName || t("microAppShare.organization")}
					</span>
					<ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground" />
				</button>
			</MagicDropdown>

			<button
				type="button"
				className="mt-1 flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
				onClick={handleLogout}
				data-testid="micro-app-share-logout"
			>
				<LogOut className="size-4" />
				{tInterface("common.logout")}
			</button>
		</div>
	)

	const userTrigger = (
		<button
			type="button"
			className="flex h-10 max-w-[260px] items-center gap-2 rounded-md border border-border/80 bg-background px-2.5 text-left shadow-sm transition-colors hover:bg-muted/60"
			onClick={isMobile ? handleOpenMobileOrganizationSwitch : undefined}
			data-testid="micro-app-share-user-trigger"
		>
			<UserAvatarRender
				userInfo={userInfo}
				size={30}
				shape="circle"
				className="size-[30px] shrink-0"
			/>
			<div className="hidden min-w-0 flex-1 sm:block">
				<div className="truncate text-sm font-medium leading-5 text-foreground">
					{displayName}
				</div>
				{organizationName ? (
					<div className="truncate text-xs leading-4 text-muted-foreground">
						{organizationName}
					</div>
				) : null}
			</div>
			<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
		</button>
	)

	return (
		<>
			<header
				className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-background/95 px-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-5"
				data-testid="micro-app-share-header"
			>
				<div className="flex min-w-0 items-center gap-3">
					<div className="min-w-0">
						<div className="truncate text-[15px] font-semibold leading-5 text-foreground">
							{appName?.trim() || t("microAppShare.title")}
						</div>
					</div>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					{showPermissionManager && isLoggedIn ? (
						<button
							type="button"
							className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted sm:px-3"
							onClick={onOpenPermissionManager}
							title={t("htmlEditor.permissionManager.open")}
							data-testid="micro-app-share-permission-manager"
						>
							<ShieldCheck size={16} />
							<span className="hidden sm:inline">
								{t("htmlEditor.permissionManager.open")}
							</span>
						</button>
					) : null}

					{isLoggedIn ? (
						<div data-testid="micro-app-share-user">
							{isMobile ? (
								userTrigger
							) : (
								<MagicDropdown
									placement="bottomRight"
									open={userMenuOpen}
									onOpenChange={handleUserMenuOpenChange}
									trigger={["click"]}
									popupRender={renderUserMenu}
									overlayClassName={transparentDropdownOverlayClassName}
								>
									{userTrigger}
								</MagicDropdown>
							)}
						</div>
					) : (
						<button
							type="button"
							className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
							onClick={goLogin}
							data-testid="micro-app-share-login"
						>
							<LogIn size={15} />
							{t("microAppShare.login")}
						</button>
					)}
				</div>
			</header>
			{isMobile ? <OrganizationSwitchPanel /> : null}
		</>
	)
}

export default function MicroAppSharePage() {
	const { t } = useTranslation("super")
	const { appId = "" } = useParams<{ appId: string }>()
	const [previewMode, setPreviewMode] = useState<MicroAppPreviewMode>("desktop")
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	// 分享页隐藏了 HTML 文件头，通过管理句柄复用预览内部的同一个授权面板。
	const [permissionManager, setPermissionManager] = useState<{ open: () => void } | null>(null)
	const { hasConfirmedSafetyNotice, confirmSafetyNotice } =
		useMicroAppSafetyNoticeConfirmation(appId)
	const {
		shareData,
		resourceId,
		coverUrl,
		fullScreen,
		displayModeResolved,
		shareMeta,
		attachmentsTree,
		attachmentList,
		loading,
		error,
		isNeedPassword,
		passwordFromUrl,
		emptyStateInfo,
		handleSwitchOrganization,
		isSwitching,
		getShareData,
		setError,
		setVerifiedPassword,
		reload,
	} = useMicroAppShareData({ appId })

	const defaultEntryFile = useMemo(
		() => resolveDefaultHtmlEntry(attachmentList),
		[attachmentList],
	)
	const displayAppName = shareMeta.projectName
	useEffect(() => {
		setPermissionManager(null)
	}, [appId])
	const previewFile = useMemo(
		() => attachmentList.find((item) => item.file_id === activeFileId) || defaultEntryFile,
		[activeFileId, attachmentList, defaultEntryFile],
	)

	const selectedProject = useMemo<ProjectListItem | null>(
		() =>
			shareMeta.projectId
				? createShareProject(shareMeta.projectId, shareMeta.projectName)
				: null,
		[shareMeta.projectId, shareMeta.projectName],
	)

	const handleVerifySuccess = useCallback(
		(_data: unknown, password?: string) => {
			setError(null)
			setVerifiedPassword(password)
		},
		[setError, setVerifiedPassword],
	)
	const handleOpenFileTab = useCallback((fileItem: AttachmentItem) => {
		if (fileItem.file_id) {
			setActiveFileId(fileItem.file_id)
		}
	}, [])
	const handleLeave = useCallback(() => {
		window.location.replace("/")
	}, [])
	const handleOpenPermissionManager = useCallback(() => {
		permissionManager?.open()
	}, [permissionManager])

	if (emptyStateInfo) {
		return (
			<ShareEmptyState
				currentOrgName={emptyStateInfo.currentOrgName}
				targetOrgName={emptyStateInfo.targetOrgName}
				targetOrgLogo={emptyStateInfo.targetOrgLogo || undefined}
				userInfo={emptyStateInfo.userInfo}
				onSwitch={handleSwitchOrganization}
				isLoading={isSwitching}
				isFileShare
			/>
		)
	}

	return (
		<div
			className="flex h-screen w-screen flex-col overflow-hidden bg-background"
			data-testid="micro-app-share-page"
		>
			{displayModeResolved && !fullScreen ? (
				<MicroAppShareHeader
					appName={displayAppName}
					showPermissionManager={hasConfirmedSafetyNotice && Boolean(permissionManager)}
					onOpenPermissionManager={handleOpenPermissionManager}
				/>
			) : null}
			<main className="min-h-0 flex-1 overflow-hidden">
				{loading ? (
					<div
						className="flex h-full items-center justify-center"
						data-testid="micro-app-share-loading"
					>
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : null}

				{isNeedPassword && !shareData && !previewFile && !error && !loading ? (
					<PasswordVerification
						resourceId={resourceId}
						initialPassword={passwordFromUrl}
						onVerifySuccess={handleVerifySuccess}
						onVerifyFail={() => setError(null)}
						getShareData={getShareData}
						isFileShare
						maxLength={32}
						uppercase={false}
						title={t("microAppShare.passwordTitle")}
						description={t("microAppShare.passwordDescription")}
					/>
				) : null}

				{error && !loading ? (
					<ErrorDisplay
						errorMessage={t("microAppShare.errorTitle")}
						onRetry={reload}
						isFileShare
						illustration={
							<MicroAppPermissionIllustration
								size="md"
								className="w-[180px]"
								testId="micro-app-share-error-illustration"
							/>
						}
					/>
				) : null}

				{!loading && !error && shareData && !previewFile ? <MicroAppShareEmpty /> : null}

				{!loading && !error && previewFile && !hasConfirmedSafetyNotice ? (
					<MicroAppSafetyNotice
						key={appId}
						appName={displayAppName}
						coverUrl={coverUrl}
						onConfirm={confirmSafetyNotice}
						onLeave={handleLeave}
					/>
				) : null}

				{!loading && !error && previewFile && hasConfirmedSafetyNotice ? (
					<div
						className="h-full w-full overflow-hidden bg-background"
						data-testid="micro-app-share-preview"
					>
						<HtmlPreviewContent
							key={previewFile.file_id || previewFile.relative_file_path}
							data={buildPreviewFile(previewFile)}
							attachments={attachmentsTree}
							attachmentList={attachmentList}
							allowEdit={false}
							selectedProject={selectedProject}
							selectedTopic={null}
							showFileHeader={false}
							showFooter={false}
							viewMode={previewMode}
							onViewModeChange={setPreviewMode}
							activeFileId={previewFile.file_id}
							virtualStorageMarkerId={defaultEntryFile?.file_id}
							projectId={shareMeta.projectId}
							openFileTab={handleOpenFileTab}
							onHtmlPermissionManagerChange={setPermissionManager}
							className="h-full"
						/>
					</div>
				) : null}
			</main>
		</div>
	)
}
