import { useState, useCallback } from "react"
import { createStyles } from "antd-style"
import { ArrowUpCircle, X } from "lucide-react"
import { useTranslation } from "react-i18next"

const useStyles = createStyles(({ token }) => ({
	banner: {
		position: "absolute",
		top: "12px",
		left: "50%",
		transform: "translateX(-50%)",
		zIndex: 50,
		display: "flex",
		alignItems: "center",
		gap: "12px",
		padding: "10px 16px",
		borderRadius: "12px",
		border: `1px solid ${token.colorInfoBorder}`,
		backgroundColor: token.colorInfoBg,
		boxShadow: token.boxShadowSecondary,
		color: token.colorText,
		maxWidth: "calc(100% - 32px)",
		transition: "all 0.3s ease",
		pointerEvents: "auto",
	},
	icon: {
		flex: "none",
		color: token.colorPrimary,
	},
	content: {
		display: "flex",
		flexDirection: "column" as const,
		gap: "2px",
		minWidth: 0,
	},
	title: {
		fontSize: "13px",
		fontWeight: 600,
		lineHeight: "18px",
		whiteSpace: "nowrap" as const,
	},
	description: {
		fontSize: "12px",
		lineHeight: "16px",
		color: token.colorTextSecondary,
	},
	actions: {
		display: "flex",
		alignItems: "center",
		gap: "8px",
		marginLeft: "auto",
		flexShrink: 0,
	},
	upgradeButton: {
		padding: "4px 12px",
		borderRadius: "6px",
		border: "none",
		backgroundColor: token.colorPrimary,
		color: "#fff",
		fontSize: "12px",
		fontWeight: 500,
		cursor: "pointer",
		whiteSpace: "nowrap" as const,
		transition: "opacity 0.2s",
		"&:hover": {
			opacity: 0.85,
		},
		"&:disabled": {
			opacity: 0.5,
			cursor: "not-allowed",
		},
	},
	closeButton: {
		flex: "none",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: "20px",
		height: "20px",
		borderRadius: "4px",
		border: "none",
		backgroundColor: "transparent",
		cursor: "pointer",
		color: token.colorTextTertiary,
		transition: "color 0.2s, background-color 0.2s",
		"&:hover": {
			backgroundColor: token.colorFillSecondary,
			color: token.colorText,
		},
	},
	// 升级中的进度遮罩
	progressOverlay: {
		position: "absolute",
		inset: 0,
		zIndex: 100,
		display: "flex",
		flexDirection: "column" as const,
		alignItems: "center",
		justifyContent: "center",
		gap: "16px",
		backgroundColor: "rgba(255, 255, 255, 0.85)",
		backdropFilter: "blur(4px)",
		borderRadius: "0",
		transition: "opacity 0.3s ease",
	},
	progressContent: {
		display: "flex",
		flexDirection: "column" as const,
		alignItems: "center",
		gap: "12px",
	},
	progressBar: {
		width: "200px",
		height: "4px",
		borderRadius: "2px",
		backgroundColor: token.colorFillSecondary,
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		borderRadius: "2px",
		backgroundColor: token.colorPrimary,
		transition: "width 0.4s ease",
	},
	progressText: {
		display: "flex",
		flexDirection: "column" as const,
		alignItems: "center",
		gap: "4px",
	},
	progressTitle: {
		fontSize: "15px",
		fontWeight: 600,
		lineHeight: "22px",
		color: token.colorText,
	},
	progressSubtitle: {
		fontSize: "13px",
		lineHeight: "18px",
		color: token.colorTextSecondary,
	},
}))

interface CanvasUpgradeBannerProps {
	onUpgrade: () => Promise<void>
	onDismiss: () => void
}

export function CanvasUpgradeBanner({ onUpgrade, onDismiss }: CanvasUpgradeBannerProps) {
	const { styles } = useStyles()
	const { t } = useTranslation("super")
	const [isUpgrading, setIsUpgrading] = useState(false)

	const handleUpgrade = useCallback(async () => {
		setIsUpgrading(true)
		try {
			await onUpgrade()
		} finally {
			setIsUpgrading(false)
		}
	}, [onUpgrade])

	return (
		<div className={styles.banner}>
			<ArrowUpCircle className={styles.icon} size={20} />
			<div className={styles.content}>
				<div className={styles.title}>{t("design.upgrade.title")}</div>
				<div className={styles.description}>{t("design.upgrade.description")}</div>
			</div>
			<div className={styles.actions}>
				<button
					className={styles.upgradeButton}
					onClick={handleUpgrade}
					disabled={isUpgrading}
				>
					{isUpgrading ? t("design.upgrade.upgrading") : t("design.upgrade.button")}
				</button>
				{!isUpgrading && (
					<button className={styles.closeButton} onClick={onDismiss}>
						<X size={14} />
					</button>
				)}
			</div>
		</div>
	)
}

interface CanvasUpgradeOverlayProps {
	percent: number
	title: string
	subtitle: string
}

export function CanvasUpgradeOverlay({ percent, title, subtitle }: CanvasUpgradeOverlayProps) {
	const { styles } = useStyles()

	return (
		<div className={styles.progressOverlay}>
			<div className={styles.progressContent}>
				<ArrowUpCircle size={32} style={{ color: "var(--ant-color-primary)" }} />
				<div className={styles.progressText}>
					<div className={styles.progressTitle}>{title}</div>
					<div className={styles.progressSubtitle}>{subtitle}</div>
				</div>
				<div className={styles.progressBar}>
					<div className={styles.progressFill} style={{ width: `${percent}%` }} />
				</div>
			</div>
		</div>
	)
}
