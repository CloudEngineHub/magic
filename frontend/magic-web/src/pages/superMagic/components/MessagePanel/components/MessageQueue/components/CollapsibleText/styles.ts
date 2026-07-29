import { createStyles } from "antd-style"

export const useStyles = createStyles(() => {
	return {
		container: {
			width: "100%",
		},

		textContainer: {
			position: "relative",
			overflow: "hidden",
			transition: "max-height 0.3s ease",

			// 基础文本样式
			fontSize: "12px",
			lineHeight: "16px",
			wordBreak: "break-word",
			cursor: "default",
		},

		collapsed: {
			display: "-webkit-box",
			WebkitBoxOrient: "vertical",
			overflow: "hidden",
			position: "relative",

			// 渐变遮罩效果，让文本在末尾逐渐消失
			"&::after": {
				content: '""',
				position: "absolute",
				right: 0,
				bottom: 0,
				width: "60px",
				height: "16px",
				pointerEvents: "none",
			},
		},

		tooltipContent: {
			width: "480px",
			maxWidth: "calc(100vw - 32px)",
			color: "inherit",
			"& *": {
				color: "inherit !important",
			},
			"& p": {
				margin: 0,
				fontSize: "inherit !important",
				lineHeight: "inherit !important",
			},
			"& .magic-mention, & .super-placeholder": {
				fontSize: "inherit !important",
				lineHeight: "inherit !important",
			},
			"& .inspector-detail-read-only > button": {
				height: "16px",
				padding: 0,
				border: 0,
				lineHeight: "16px",
			},
			"& .inspector-detail-read-only.magic-mention": {
				borderColor: "rgb(255 255 255 / 0.3)",
				backgroundColor: "rgb(255 255 255 / 0.12) !important",
			},
			"& .inspector-detail-node-view > span": {
				borderColor: "rgb(255 255 255 / 0.3)",
				backgroundColor: "rgb(255 255 255 / 0.12)",
			},
			"& .inspector-detail-node-view [class*='bg-muted']": {
				backgroundColor: "rgb(255 255 255 / 0.12)",
			},
		},
	}
})
