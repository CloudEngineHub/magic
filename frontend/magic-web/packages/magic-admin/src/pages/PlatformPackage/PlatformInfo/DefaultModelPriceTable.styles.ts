import { createStyles } from "antd-style"
/** 使用旧端主题变量复现统一分组表，窄屏改成价格和金额分行展示。 */
export const useDefaultModelPriceStyles = createStyles(({ css, token }) => ({
	section: css`
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid ${token.colorBorderSecondary};
		display: flex;
		flex-direction: column;
		gap: 12px;
		font-size: 14px;
		h4,
		h5,
		p {
			margin: 0;
		}
		h4,
		h5 {
			font-size: 14px;
			font-weight: 500;
		}
	`,
	table: css`
		border: 1px solid ${token.colorBorderSecondary};
		border-radius: 8px;
		overflow: hidden;
	`,
	header: css`
		display: grid;
		grid-template-columns:
			minmax(0, 2.2fr) minmax(0, 1.7fr) minmax(0, 1fr) minmax(0, 0.8fr)
			32px;
		gap: 20px;
		align-items: center;
		padding: 12px 20px;
		background: ${token.colorFillQuaternary};
		color: ${token.colorTextSecondary};
		font-size: 12px;
		@media (max-width: 1023px) {
			display: none;
		}
	`,
	group: css`
		border-top: 1px solid ${token.colorBorderSecondary};
	`,
	groupHeading: css`
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 20px;
		background: ${token.colorFillQuaternary};
	`,
	node: css`
		min-width: 0;
		border-top: 1px solid ${token.colorBorderSecondary};
	`,
	row: css`
		display: grid;
		grid-template-columns:
			minmax(0, 2.2fr) minmax(0, 1.7fr) minmax(0, 1fr) minmax(0, 0.8fr)
			32px;
		gap: 8px 20px;
		align-items: center;
		padding: 12px 20px;
		@media (max-width: 1023px) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 32px;
		}
	`,
	name: css`
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		@media (max-width: 1023px) {
			grid-column: span 2;
		}
	`,
	text: css`
		min-width: 0;
		overflow-wrap: anywhere;
		strong {
			font-weight: 500;
		}
	`,
	muted: css`
		color: ${token.colorTextSecondary};
		font-size: 12px;
		line-height: 20px;
	`,
	identifier: css`
		color: ${token.colorTextSecondary};
		font-size: 12px;
		line-height: 20px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	`,
	badge: css`
		display: inline-block;
		margin-left: 8px;
		border-radius: 4px;
		padding: 0 6px;
		font-size: 12px;
		font-weight: 400;
		color: ${token.colorTextSecondary};
		background: ${token.colorFillTertiary};
	`,
	button: css`
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: ${token.colorTextSecondary};
		cursor: pointer;
		&:hover {
			background: ${token.colorFillTertiary};
		}
	`,
	prices: css`
		min-width: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
		@media (max-width: 1023px) {
			grid-column: span 3;
		}
	`,
	benchmark: css`
		margin-top: 8px;
		padding: 8px;
		border-radius: 6px;
		background: ${token.colorFillQuaternary};
		font-size: 12px;
		line-height: 20px;
	`,
	priceLine: css`
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
	`,
	amount: css`
		min-width: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
		text-align: right;
	`,
	ratio: css`
		min-width: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
		text-align: right;
		font-weight: 600;
	`,
	mobile: css`
		color: ${token.colorTextSecondary};
		font-size: 12px;
		@media (min-width: 1024px) {
			display: none;
		}
	`,
	formula: css`
		margin: 0 20px 16px;
		padding: 16px;
		border-radius: 6px;
		background: ${token.colorFillQuaternary};
		font-size: 12px;
		line-height: 24px;
		overflow-wrap: anywhere;
	`,
	binding: css`
		border-bottom: 1px solid ${token.colorBorderSecondary};
		padding-bottom: 12px;
		margin-bottom: 12px;
	`,
	children: css`
		> div {
			border-left: 1px solid ${token.colorBorderSecondary};
		}
	`,
	arrow: css`
		transition: transform 0.15s;
	`,
}))
