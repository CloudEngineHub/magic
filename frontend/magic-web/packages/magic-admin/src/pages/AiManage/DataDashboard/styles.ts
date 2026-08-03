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
		agentSelectPopup: css`
			.${prefixCls}-select-item-option-content {
				white-space: normal;
			}
		`,
		agentOption: css`
			display: flex;
			flex-direction: column;
			gap: 2px;
			min-width: 0;
			padding: 2px 0;
		`,
		agentOptionAll: css`
			color: ${token.colorText};
			font-size: 13px;
			font-weight: 500;
			line-height: 20px;
		`,
		agentOptionName: css`
			color: ${token.colorText};
			font-size: 13px;
			font-weight: 600;
			line-height: 20px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		`,
		agentOptionCode: css`
			color: ${token.colorTextTertiary};
			font-size: 12px;
			line-height: 18px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
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

			@media (max-width: 640px) {
				flex-direction: column;
			}
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
			height: ${isMobile ? "248px" : "240px"};
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
		levelSegmented: css`
			flex: 0 0 auto;

			@media (max-width: 640px) {
				width: 100%;
			}
		`,
		departmentPenetrationContent: css`
			display: flex;
			align-items: center;
			justify-content: center;
		`,
		departmentPenetrationList: css`
			display: flex;
			width: 100%;
			max-height: 240px;
			flex-direction: column;
			gap: 12px;
			overflow-x: hidden;
			overflow-y: auto;
			overscroll-behavior: contain;
			padding-right: 4px;
			scrollbar-gutter: stable;
		`,
		departmentPenetrationItem: css`
			display: grid;
			flex: 0 0 auto;
			grid-template-columns: 26px minmax(0, 1fr) auto;
			column-gap: 8px;
			align-items: center;
		`,
		departmentRank: css`
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 26px;
			height: 26px;
			color: var(--department-rank-color);
			background: var(--department-rank-bg);
			border-radius: 8px;
			font-size: 12px;
			font-variant-numeric: tabular-nums;
			line-height: 1;
		`,
		departmentNameLine: css`
			display: flex;
			align-items: center;
			gap: 8px;
			min-width: 0;
		`,
		departmentName: css`
			min-width: 0;
			overflow: hidden;
			color: ${token.colorText};
			font-size: 14px;
			font-weight: 600;
			line-height: 20px;
			text-overflow: ellipsis;
			white-space: nowrap;
		`,
		departmentLevelTag: css`
			display: inline-flex;
			min-width: 0;
			flex: 0 1 auto;
			align-items: center;
			min-height: 22px;
			height: auto;
			padding: 0 8px;
			color: ${token.colorTextTertiary};
			background: ${token.colorFillTertiary};
			border-radius: 999px;
			font-size: 12px;
			line-height: 18px;
			white-space: normal;
			word-break: break-all;
		`,
		departmentRate: css`
			color: ${token.colorText};
			font-size: 14px;
			font-variant-numeric: tabular-nums;
			font-weight: 500;
			line-height: 22px;
			white-space: nowrap;
		`,
		departmentMeta: css`
			grid-column: 1 / -1;
			margin-top: 2px;
			overflow: hidden;
			color: ${token.colorTextTertiary};
			font-size: 12px;
			line-height: 18px;
			text-overflow: ellipsis;
			white-space: nowrap;
		`,
		departmentProgress: css`
			grid-column: 1 / -1;
			line-height: 1;

			.${prefixCls}-progress-inner, .${prefixCls}-progress-bg {
				height: 6px !important;
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
		detailTableWrap: css`
			height: 100%;
			min-height: 200px;
			overflow-anchor: none;

			.${prefixCls}-table-placeholder {
				height: ${isMobile ? "360px" : "660px"};

				.${prefixCls}-table-cell {
					height: 100%;
				}
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
		resourceCell: css`
			display: flex;
			min-width: 0;
			flex-direction: column;
			gap: 2px;
		`,
		resourcePrimary: css`
			min-width: 0;
			overflow: hidden;
			color: ${token.colorText};
			font-size: 13px;
			line-height: 20px;
			text-overflow: ellipsis;
			white-space: nowrap;
		`,
		resourceMeta: css`
			min-width: 0;
			overflow: hidden;
			color: ${token.colorTextTertiary};
			font-size: 12px;
			line-height: 18px;
			text-overflow: ellipsis;
			white-space: nowrap;
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
