import { createStyles } from "antd-style"
/** 旧管理端使用现有主题变量，窄屏折行，不引入新管理端样式。 */
export const useDefaultModelPriceStyles = createStyles(({ css, token }) => ({
	section: css`
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid ${token.colorBorderSecondary};
		display: flex;
		flex-direction: column;
		gap: 12px;
		h4,
		h5 {
			margin: 0;
			font-size: 14px;
			font-weight: 500;
		}
		p {
			margin: 0;
		}
	`,
	group: css`
		border: 1px solid ${token.colorBorderSecondary};
		border-radius: 8px;
		padding: 12px;
		h5 {
			padding-bottom: 12px;
		}
	`,
	header: css`
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.8fr);
		gap: 16px;
		color: ${token.colorTextSecondary};
		font-size: 12px;
		@media (max-width: 1024px) {
			display: none;
		}
	`,
	node: css`
		min-width: 0;
		border-top: 1px solid ${token.colorBorderSecondary};
	`,
	row: css`
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.8fr);
		gap: 16px;
		padding: 16px 0;
		@media (max-width: 1024px) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	`,
	name: css`
		min-width: 0;
		overflow-wrap: anywhere;
	`,
	muted: css`
		color: ${token.colorTextSecondary};
		font-size: 12px;
		line-height: 1.8;
	`,
	button: css`
		border: none;
		background: transparent;
		color: ${token.colorPrimary};
		cursor: pointer;
		font-size: 12px;
		padding: 4px;
		&:hover {
			text-decoration: underline;
		}
	`,
	prices: css`
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	`,
	amount: css`
		min-width: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
	`,
	ratio: css`
		min-width: 0;
		overflow-wrap: anywhere;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	`,
	mobile: css`
		font-size: 12px;
		color: ${token.colorTextSecondary};
		@media (min-width: 1025px) {
			display: none;
		}
	`,
	formula: css`
		margin-bottom: 16px;
		padding: 16px;
		border-radius: 6px;
		background: ${token.colorFillQuaternary};
		font-size: 12px;
		line-height: 1.8;
		overflow-wrap: anywhere;
	`,
	binding: css`
		border-bottom: 1px solid ${token.colorBorderSecondary};
		padding-bottom: 12px;
		margin-bottom: 12px;
	`,
}))
