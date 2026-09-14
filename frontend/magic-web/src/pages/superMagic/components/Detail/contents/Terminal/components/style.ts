import { createStyles } from "antd-style"
import type { ITheme } from "@xterm/xterm"

export const terminalColors = {
	bar: "#23272F",
	border: "#343A46",
	muted: "#9199A8",
	hover: "#343B49",
}

export const terminalTheme = {
	// One Dark theme colors from https://github.com/janoamaral/Xresources-themes
	background: "#1E2127",
	foreground: "#D6DAE2",
	cursor: "#5C6370",
	selectionBackground: "#3A3F4B",
	// ANSI colors
	black: "#1E2127",
	red: "#E06C75",
	green: "#98C379",
	yellow: "#D19A66",
	blue: "#61AFEF",
	magenta: "#C678DD",
	cyan: "#56B6C2",
	white: "#ABB2BF",
	// Bright ANSI colors
	brightBlack: "#5C6370",
	brightRed: "#E06C75",
	brightGreen: "#98C379",
	brightYellow: "#D19A66",
	brightBlue: "#61AFEF",
	brightMagenta: "#C678DD",
	brightCyan: "#56B6C2",
	brightWhite: "#FFFFFF",
} satisfies ITheme

export const useStyles = createStyles(({ css }) => {
	return {
		terminalDisplay: css`
			width: 100%;
			height: 100%;
			flex: 1;
			min-width: 0;
			min-height: 0;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			background-color: ${terminalTheme.background};
			color: ${terminalTheme.foreground};
		`,
		terminalBody: css`
			flex: 1;
			min-width: 0;
			min-height: 0;
			padding: 16px 20px;
			overflow: hidden;
			box-sizing: border-box;
			background-color: ${terminalTheme.background};

			@media (max-width: 440px) {
				padding: 14px 12px;
			}
		`,
		terminalMount: css`
			width: 100%;
			height: 100%;
			position: relative;
			background-color: ${terminalTheme.background};

			/* 留白由外层负责；字符画布尺寸由 FitAddon 计算，不能强制拉伸。 */
			& .xterm {
				height: 100%;
				background-color: ${terminalTheme.background};
			}

			& .xterm-viewport {
				background-color: ${terminalTheme.background};
			}
		`,
		footer: css`
			display: flex;
			align-items: center;
			justify-content: space-between;
			flex-shrink: 0;
			gap: 16px;
			min-height: 36px;
			padding: 6px 14px 6px 16px;
			box-sizing: border-box;
			border-top: 1px solid ${terminalColors.border};
			background-color: ${terminalColors.bar};
			font-size: 12px;
			line-height: 1.4;
		`,
		status: css`
			display: inline-flex;
			align-items: center;
			gap: 7px;
			font-weight: 500;
			white-space: nowrap;

			& svg {
				color: ${terminalTheme.green};
			}
		`,
		exitCode: css`
			display: inline-flex;
			align-items: center;
			gap: 7px;
			color: ${terminalColors.muted};
			white-space: nowrap;
		`,
		exitCodeValue: css`
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 22px;
			height: 22px;
			padding: 0 5px;
			border-radius: 4px;
			background-color: ${terminalColors.hover};
			font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
			color: ${terminalTheme.foreground};
		`,
		error: css`
			& svg,
			& [data-terminal-exit-code] {
				color: ${terminalTheme.red};
			}
		`,
	}
})
