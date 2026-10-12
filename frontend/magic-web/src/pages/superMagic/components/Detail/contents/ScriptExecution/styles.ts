import { createStyles } from "antd-style"

export const useStyles = createStyles(({ css, token, isDarkMode }) => ({
	scriptExecutionContainer: css`
		overflow: hidden;
		height: 100%;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		background-color: ${token.colorBgContainer};
		color: ${token.colorText};
	`,
	toolbar: css`
		--detail-action-font-size: 14px;
		--detail-action-line-height: 20px;
		--detail-action-height: 32px;
		--detail-action-gap: 6px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		min-height: 52px;
		padding: 10px 16px;
		border-bottom: 1px solid ${token.colorBorderSecondary};
		background-color: ${token.colorBgContainer};
		user-select: none;
		-webkit-user-select: none;

		@media (pointer: coarse) {
			--detail-action-height: 44px;
		}
	`,
	title: css`
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 16px;
		line-height: 24px;
		font-weight: 500;
		cursor: default;
	`,
	readOnly: css`
		font-size: 12px;
		font-weight: 400;
		color: ${token.colorTextSecondary};

		@media (max-width: 440px) {
			display: none;
		}
	`,
	content: css`
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 16px;
		overflow: hidden;
		background-color: ${token.colorBgLayout};
	`,
	section: css`
		min-height: 0;
		display: flex;
		flex-direction: column;
		border: 1px solid ${token.colorBorderSecondary};
		border-radius: ${token.borderRadius}px;
		overflow: hidden;
		background-color: ${token.colorBgContainer};
	`,
	codeSection: css`
		flex: 0 1 42%;
		min-height: 160px;
	`,
	outputSection: css`
		flex: 1 1 58%;
		min-height: 0;
	`,
	sectionHeader: css`
		display: flex;
		align-items: center;
		min-height: 36px;
		padding: 0 12px;
		border-bottom: 1px solid ${token.colorBorderSecondary};
		background-color: ${token.colorFillQuaternary};
		font-size: 13px;
		font-weight: 500;
		color: ${token.colorTextSecondary};
	`,
	codeBody: css`
		flex: 1;
		min-height: 0;
		overflow: hidden;

		& .monaco-editor,
		& .monaco-editor-background,
		& .margin {
			background-color: ${isDarkMode ? "#1C2027" : "#F7F8FA"} !important;
		}
	`,
	loading: css`
		display: flex;
		height: 100%;
		align-items: center;
		justify-content: center;
	`,
	outputBody: css`
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	`,
	outputStream: css`
		flex: 1 1 50%;
		min-height: 0;
		display: flex;
		flex-direction: column;

		& + & {
			border-top: 1px solid ${token.colorBorderSecondary};
		}
	`,
	streamHeader: css`
		flex-shrink: 0;
		padding: 6px 12px;
		font-size: 12px;
		line-height: 18px;
		color: ${token.colorTextSecondary};
		background-color: ${token.colorFillQuaternary};
	`,
	streamContent: css`
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	`,
	emptyOutput: css`
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		font-size: 13px;
		color: ${token.colorTextQuaternary};
		background-color: ${isDarkMode ? "#1C2027" : "#F7F8FA"};
	`,
	footer: css`
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
		gap: 16px;
		min-height: 44px;
		padding: 10px 16px;
		box-sizing: border-box;
		border-top: 1px solid ${token.colorBorderSecondary};
		background-color: ${token.colorBgContainer};
		font-size: 14px;
		line-height: 22px;
		color: ${token.colorText};
	`,
	status: css`
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-weight: 500;

		& svg {
			color: ${token.colorSuccess};
		}
	`,
	error: css`
		color: ${token.colorError};

		& svg {
			color: ${token.colorError};
		}
	`,
	exitCode: css`
		color: ${token.colorTextSecondary};
		white-space: nowrap;
	`,
}))
