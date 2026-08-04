import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import Logo from "@/layouts/BaseLayout/components/Header/components/Logo"
import { Button } from "@/components/shadcn-ui/button"
import WorkspaceButton from "../WorkspaceButton"
// @ts-ignore
import FolderIcon from "../../assets/icon/folder_empty.svg"
// @ts-ignore
import ReplayIcon from "../../assets/icon/replay_icon.svg"
import { history } from "@/routes/history"
import { RouteName } from "@/routes/constants"
import { useUserInfo } from "@/models/user/hooks"
import UserAvatarRender from "@/components/business/UserAvatarRender"

interface ShareEmptyStateProps {
	currentOrgName: string
	targetOrgName: string
	targetOrgLogo?: string
	userInfo: any
	onSwitch: () => void
	isLoading?: boolean
	isFileShare?: boolean
}

export default function ShareEmptyState({
	targetOrgName,
	userInfo: userInfoProp,
	onSwitch,
	isLoading = false,
	isFileShare = false,
}: ShareEmptyStateProps) {
	const { t } = useTranslation("super")
	const { userInfo } = useUserInfo()
	const isLogined = !!userInfo?.user_id

	// 根据分享类型选择图标
	const icon = isFileShare ? FolderIcon : ReplayIcon

	return (
		<div
			className="flex h-screen w-screen flex-col overflow-hidden bg-[#F9F9F9]"
			data-testid="share-empty-state"
		>
			{/* Keep the share header below the mobile safe area in standalone browsers. */}
			<div
				className="z-[99] flex h-12 items-center justify-between border-b border-border bg-white px-5 py-2.5 backdrop-blur-[50px] max-md:h-[calc(52px+var(--safe-area-inset-top,0px))] max-md:px-3 max-md:pb-0 max-md:pt-[var(--safe-area-inset-top,0px)]"
				data-testid="share-empty-state-header"
			>
				<Logo className="h-[42px] shrink-0 max-md:h-9" />
				<div className="flex gap-2">
					{isLogined ? (
						<WorkspaceButton
							onClick={() => {
								history.push({ name: RouteName.Super })
							}}
						/>
					) : (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								history.replace({ name: RouteName.Login })
							}}
							data-testid="share-empty-login-button"
						>
							{t("share.login")}
						</Button>
					)}
				</div>
			</div>

			<div
				className="flex flex-1 items-center justify-center p-5"
				data-testid="share-empty-state-content"
			>
				<div className="flex w-full max-w-[400px] flex-col items-center gap-5">
					<img
						src={icon}
						alt=""
						className="h-[60px] w-[60px] shrink-0"
						data-testid="share-empty-state-icon"
					/>

					<div
						className="text-center text-lg font-semibold leading-6 text-foreground/80"
						data-testid="share-empty-state-title"
					>
						{t("share.emptyState.title")}
					</div>

					<div
						className="flex flex-col gap-5 self-stretch rounded-xl border border-[#1C1D23]/[0.08] bg-white p-5"
						data-testid="share-empty-state-card"
					>
						<div className="flex flex-col items-center gap-2 self-stretch">
							<div
								className="self-stretch text-center text-xs font-normal leading-4 text-foreground/60"
								data-testid="share-empty-state-tip"
							>
								{t("share.emptyState.switchTip", { orgName: targetOrgName })}
							</div>

							<div
								className="flex items-center gap-1"
								data-testid="share-empty-state-user"
							>
								<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#DDE7FF] p-[1.5px]">
									<UserAvatarRender
										userInfo={userInfoProp}
										size={24}
										className="h-6 w-6 rounded-md"
									/>
								</div>
								<span className="text-sm font-semibold leading-5 text-foreground">
									{userInfoProp?.nickname || ""}
								</span>
							</div>
						</div>

						<Button
							type="button"
							onClick={onSwitch}
							disabled={isLoading}
							className="h-auto self-stretch rounded-lg border-0 px-6 py-1.5 text-sm font-normal leading-5"
							data-testid="share-empty-switch-button"
						>
							{isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
							{isLoading
								? t("share.emptyState.switching")
								: t("share.emptyState.switchButton")}
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
