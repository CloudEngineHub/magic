import { Button, Flex } from "antd"
import { useTranslation } from "react-i18next"
import Logo from "@/layouts/BaseLayout/components/Header/components/Logo"
import WorkspaceButton from "../WorkspaceButton"
// @ts-ignore
import { useStyles } from "./style"
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
	const { styles } = useStyles()
	const { t } = useTranslation("super")
	const { userInfo } = useUserInfo()
	const isLogined = !!userInfo?.user_id

	// 根据分享类型选择图标
	const icon = isFileShare ? FolderIcon : ReplayIcon

	return (
		<div className={styles.container} data-testid="share-empty-state">
			{/* 头部 */}
			<Flex className={styles.header} data-testid="share-empty-state-header">
				<Logo className={styles.logo} />
				<Flex gap={8}>
					{isLogined ? (
						<WorkspaceButton
							onClick={() => {
								history.push({ name: RouteName.Super })
							}}
						/>
					) : (
						<Button
							onClick={() => {
								history.replace({ name: RouteName.Login })
							}}
							data-testid="share-empty-login-button"
						>
							{t("share.login")}
						</Button>
					)}
				</Flex>
			</Flex>

			{/* 主体内容 */}
			<div className={styles.content} data-testid="share-empty-state-content">
				<div className={styles.main}>
					{/* 图标 */}
					<img
						src={icon}
						alt=""
						className={styles.icon}
						data-testid="share-empty-state-icon"
					/>

					{/* 标题 */}
					<div className={styles.title} data-testid="share-empty-state-title">
						{t("share.emptyState.title")}
					</div>

					{/* 提示卡片 */}
					<div className={styles.card} data-testid="share-empty-state-card">
						<div className={styles.cardContent}>
							{/* 提示文本 */}
							<div className={styles.tip} data-testid="share-empty-state-tip">
								{t("share.emptyState.switchTip", { orgName: targetOrgName })}
							</div>

							{/* 用户信息 */}
							<div className={styles.userInfo} data-testid="share-empty-state-user">
								<div className={styles.avatarContainer}>
									<UserAvatarRender
										userInfo={userInfoProp}
										size={24}
										className={styles.avatar}
									/>
								</div>
								<span className={styles.userName}>
									{userInfoProp?.nickname || ""}
								</span>
							</div>
						</div>

						{/* 切换按钮 */}
						<Button
							type="primary"
							onClick={onSwitch}
							disabled={isLoading}
							className={styles.button}
							loading={isLoading}
							data-testid="share-empty-switch-button"
						>
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
