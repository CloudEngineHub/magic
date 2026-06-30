import { createStyles } from "antd-style"
import { AlertCircle, ArrowUpCircle } from "lucide-react"

const useStyles = createStyles(({ token }) => ({
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
	progressAction: {
		marginTop: "4px",
		padding: "6px 14px",
		borderRadius: "6px",
		border: "none",
		backgroundColor: token.colorPrimary,
		color: "#fff",
		fontSize: "13px",
		fontWeight: 500,
		cursor: "pointer",
		transition: "opacity 0.2s",
		"&:hover": {
			opacity: 0.85,
		},
		"&:disabled": {
			opacity: 0.5,
			cursor: "not-allowed",
		},
	},
}))

interface CanvasUpgradeOverlayProps {
	percent: number
	title: string
	subtitle: string
	status?: "progress" | "error"
	actionLabel?: string
	onAction?: () => void
	actionDisabled?: boolean
}

export function CanvasUpgradeOverlay({
	percent,
	title,
	subtitle,
	status = "progress",
	actionLabel,
	onAction,
	actionDisabled,
}: CanvasUpgradeOverlayProps) {
	const { styles } = useStyles()
	const iconColor = status === "error" ? "var(--ant-color-error)" : "var(--ant-color-primary)"

	return (
		<div className={styles.progressOverlay}>
			<div className={styles.progressContent}>
				{status === "error" ? (
					<AlertCircle size={32} style={{ color: iconColor }} />
				) : (
					<ArrowUpCircle size={32} style={{ color: iconColor }} />
				)}
				<div className={styles.progressText}>
					<div className={styles.progressTitle}>{title}</div>
					<div className={styles.progressSubtitle}>{subtitle}</div>
				</div>
				{status === "progress" && (
					<div className={styles.progressBar}>
						<div className={styles.progressFill} style={{ width: `${percent}%` }} />
					</div>
				)}
				{actionLabel && onAction && (
					<button
						type="button"
						className={styles.progressAction}
						onClick={onAction}
						disabled={actionDisabled}
						data-testid="on-action"
					>
						{actionLabel}
					</button>
				)}
			</div>
		</div>
	)
}
