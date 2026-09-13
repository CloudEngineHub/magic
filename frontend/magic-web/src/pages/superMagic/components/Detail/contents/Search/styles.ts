import { createStyles } from "antd-style"

export const useStyles = createStyles(({ token }) => ({
	searchContainer: {
		overflow: "hidden",
		height: "100%",
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
		backgroundColor: token.colorBgContainer,
	},
	summary: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		minWidth: 0,
		fontSize: 13,
		whiteSpace: "nowrap",
		"& svg": { flexShrink: 0 },
	},
	batchSummary: {
		color: token.colorTextSecondary,
		fontSize: 12,
	},
	queryArea: {
		padding: "20px 28px 0",
		flexShrink: 0,
		"@media (max-width: 768px)": { padding: "16px 16px 0" },
	},
	query: {
		display: "flex",
		alignItems: "flex-start",
		gap: 12,
		padding: "12px 16px",
		border: `1px solid ${token.colorBorderSecondary}`,
		borderRadius: 22,
		color: token.colorText,
		fontSize: 15,
		lineHeight: 1.6,
		// 详情面板可以独立变窄；完整查询允许折行，不通过字符串裁剪丢失检索条件。
		overflowWrap: "anywhere",
		"& svg": { flexShrink: 0, marginTop: 4, color: token.colorTextSecondary },
		"& span": { minWidth: 0 },
	},
}))
