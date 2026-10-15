import { createStyles } from "antd-style"

/** 沿用旧版样式体系，参考结果在窄屏回落到表单下方。 */
export const useModelMultiplierStyles = createStyles(({ css, token }) => ({
	root: css`
		width: 100%;
		max-width: 896px;
		color: ${token.colorText};
	`,
	layout: css`
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 24px;
		align-items: start;
		@media (max-width: 768px) {
			grid-template-columns: minmax(0, 1fr);
		}
	`,
	preview: css`
		padding: 20px;
		border-radius: 6px;
		background: ${token.colorFillAlter};
		min-width: 0;
	`,
	muted: css`
		color: ${token.colorTextSecondary};
		font-size: 13px;
		line-height: 1.65;
	`,
	amount: css`
		font-size: 24px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	`,
	section: css`
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid ${token.colorBorderSecondary};
	`,
	row: css`
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
	`,
	example: css`
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.8fr);
		align-items: center;
		gap: 12px;
		padding: 14px 0;
		border-bottom: 1px solid ${token.colorBorderSecondary};
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
		@media (max-width: 768px) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	`,
	rules: css`
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px 28px;
		margin-top: 16px;
		dt {
			font-weight: 500;
			margin-bottom: 4px;
		}
		dd {
			margin: 0;
		}
		@media (max-width: 768px) {
			grid-template-columns: minmax(0, 1fr);
		}
	`,
}))
