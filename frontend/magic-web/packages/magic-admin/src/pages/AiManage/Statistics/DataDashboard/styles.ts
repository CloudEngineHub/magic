import { createStyles } from "antd-style"

export const useStyles = createStyles(
	({ css, token, prefixCls }, { isMobile }: { isMobile: boolean }) => ({
		page: css`
			height: 100%;
			overflow: auto;
			padding: ${isMobile ? "16px" : "24px 28px"};
			background: ${token.magicColorUsages.bg[1]};
		`,
		inner: css`
			max-width: 1536px;
			margin: 0 auto;
			display: flex;
			flex-direction: column;
			gap: 24px;
		`,
		header: css`
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 16px;
			padding-bottom: 24px;
			border-bottom: 1px solid ${token.colorBorderSecondary};

			@media (max-width: 768px) {
				flex-direction: column;
			}
		`,
		titleBlock: css`
			display: flex;
			flex-direction: column;
			gap: 6px;
			min-width: 0;
		`,
		title: css`
			margin: 0;
			color: ${token.magicColorUsages.text[0]};
			font-size: ${isMobile ? "22px" : "24px"};
			font-weight: 700;
			letter-spacing: 0;
			line-height: 1.5;
		`,
		subtitle: css`
			color: ${token.magicColorUsages.text[2]};
			font-size: 13px;
			line-height: 1.5;
		`,
		panel: css`
			background: ${token.magicColorUsages.bg[0]};
			border: 1px solid ${token.colorBorderSecondary};
			border-radius: 10px;
			box-shadow: 0 8px 28px rgba(15, 23, 42, 0.04);
			padding: 24px;
		`,
		filterPanel: css`
			padding: 0;
		`,
		filterGrid: css`
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 12px;
			align-items: end;

			@media (max-width: 1280px) {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}

			@media (max-width: 860px) {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}

			@media (max-width: 640px) {
				grid-template-columns: 1fr;
			}
		`,
		filterItem: css`
			display: flex;
			flex-direction: column;
			gap: 6px;
			min-width: 0;

			.ant-form-item {
				margin-bottom: 0;
			}
		`,
		filterLabel: css`
			color: ${token.magicColorUsages.text[2]};
			font-size: 12px;
			font-weight: 500;
			line-height: 20px;
		`,
		timeFilter: css`
			> button {
				width: 100%;
				justify-content: space-between;
			}
		`,
		metricGrid: css`
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 16px;

			@media (max-width: 1280px) {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}

			@media (max-width: 860px) {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}

			@media (max-width: 540px) {
				grid-template-columns: 1fr;
			}
		`,
		metricCard: css`
			position: relative;
			min-height: 90px;
			padding: 16px;
			overflow: hidden;
			background: ${token.magicColorUsages.bg[0]};
			border: 1px solid ${token.colorBorderSecondary};
			border-radius: 8px;
		`,
		metricIcon: css`
			position: absolute;
			top: 16px;
			right: 16px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 34px;
			height: 34px;
			color: var(--metric-color);
			background: var(--metric-bg);
			border-radius: 8px;
		`,
		metricLabel: css`
			padding-right: 42px;
			color: ${token.magicColorUsages.text[2]};
			font-size: 13px;
			font-weight: 500;
			line-height: 18px;
			display: flex;
			align-items: center;
			gap: 4px;
		`,
		metricHelpIcon: css`
			color: ${token.colorTextTertiary};
			vertical-align: -2px;
		`,
		metricValue: css`
			margin-top: 10px;
			color: ${token.colorText};
			font-size: 24px;
			font-weight: 700;
			line-height: 30px;
			word-break: break-word;
		`,
		metricHelper: css`
			margin-top: 6px;
			color: ${token.colorTextTertiary};
			font-size: 12px;
			line-height: 18px;
		`,
		analysisGrid: css`
			display: grid;
			grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.9fr);
			gap: 16px;

			@media (max-width: 1080px) {
				grid-template-columns: 1fr;
			}
		`,
		fullPanel: css`
			grid-column: 1 / -1;
		`,
		cardHeader: css`
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 12px;
			margin-bottom: 24px;
		`,
		cardTitle: css`
			margin: 0;
			color: ${token.colorText};
			font-size: 16px;
			font-weight: 700;
			letter-spacing: 0;
			line-height: 24px;
		`,
		cardDesc: css`
			margin-top: 4px;
			color: ${token.colorTextSecondary};
			font-size: 13px;
			line-height: 18px;
		`,
		chartBox: css`
			height: ${isMobile ? "248px" : "272px"};
			padding: 12px 20px 14px 12px;
		`,
		rankingList: css`
			display: flex;
			flex-direction: column;
			gap: 10px;
			// padding: 12px 16px 14px;
		`,
		rankingItem: css`
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 8px;
			align-items: start;
		`,
		rankingName: css`
			color: ${token.colorText};
			font-size: 13px;
			font-weight: 600;
			line-height: 20px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`,
		rankingMeta: css`
			color: ${token.colorTextTertiary};
			font-size: 12px;
			line-height: 18px;
		`,
		rankingValue: css`
			color: ${token.colorText};
			font-size: 13px;
			font-weight: 700;
			line-height: 20px;
			white-space: nowrap;
		`,
		rankingValueBlock: css`
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			gap: 2px;
		`,
		rankingPercent: css`
			color: ${token.colorTextTertiary};
			font-size: 12px;
			line-height: 18px;
			white-space: nowrap;
		`,
		progressLine: css`
			grid-column: 1 / -1;
			.${prefixCls}-progress-inner {
				height: 8px;
			}
		`,
		detailPanel: css`
			padding: 18px 20px 20px;
		`,
		detailTop: css`
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			margin-bottom: 12px;

			@media (max-width: 640px) {
				align-items: flex-start;
				flex-direction: column;
			}
		`,
		detailTabs: css`
			.ant-tabs-nav {
				margin-bottom: 20px;
			}
		`,
		detailTabContent: css`
			display: flex;
			flex-direction: column;
			gap: 16px;
		`,
		detailTableTop: css`
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;

			@media (max-width: 640px) {
				align-items: flex-start;
				flex-direction: column;
			}
		`,
		detailSubtitle: css`
			margin: 0;
			color: ${token.colorText};
			font-size: 16px;
			font-weight: 700;
			letter-spacing: 0;
			line-height: 24px;
		`,
		columnTitle: css`
			display: inline-flex;
			align-items: center;
			gap: 4px;
			min-width: 0;
			vertical-align: middle;
		`,
		columnTitleText: css`
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`,
		columnHelpIcon: css`
			display: inline-flex;
			flex: 0 0 auto;
			align-items: center;
			justify-content: center;
			color: ${token.colorTextTertiary};
			cursor: help;
		`,
		entityCell: css`
			display: flex;
			align-items: center;
			gap: 8px;
			min-width: 0;
		`,
		avatar: css`
			display: inline-flex;
			flex: 0 0 30px;
			align-items: center;
			justify-content: center;
			width: 30px;
			height: 30px;
			color: ${token.colorTextSecondary};
			background: ${token.colorFillQuaternary};
			border: 1px solid ${token.colorBorderSecondary};
			border-radius: 50%;
			font-size: 12px;
		`,
		entityName: css`
			color: ${token.colorText};
			font-size: 13px;
			font-weight: 600;
			line-height: 20px;
		`,
		entityMeta: css`
			color: ${token.colorTextTertiary};
			font-size: 12px;
			line-height: 18px;
		`,
		dictionaryTabs: css`
			.ant-tabs-nav {
				margin-bottom: 16px;
			}
		`,
		dictionaryIntroGrid: css`
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 16px;

			@media (max-width: 1080px) {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}

			@media (max-width: 640px) {
				grid-template-columns: 1fr;
			}
		`,
		dictionaryIntroCard: css`
			padding: 16px;
			background: ${token.magicColorUsages.bg[0]};
			border: 1px solid ${token.colorBorderSecondary};
			border-radius: 8px;
		`,
		dictionaryBadge: css`
			display: inline-flex;
			align-items: center;
			height: 22px;
			padding: 0 8px;
			margin-bottom: 10px;
			color: var(--badge-color);
			background: var(--badge-bg);
			border: 1px solid var(--badge-border);
			border-radius: 6px;
			font-size: 12px;
			font-weight: 600;
		`,
		sectionGap: css`
			display: flex;
			flex-direction: column;
			gap: 16px;
		`,
		empty: css`
			display: flex;
			justify-content: center;
			align-items: center;
		`,
	}),
)
