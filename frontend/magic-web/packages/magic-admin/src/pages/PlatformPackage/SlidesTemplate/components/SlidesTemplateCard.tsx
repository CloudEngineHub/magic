import { memo } from "react"
import { Flex, Image, Switch } from "antd"
import { useTranslation } from "react-i18next"
import { MagicButton, MobileCard } from "@admin-components"
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import { isSystemSlidesTemplate } from "../utils"

interface SlidesTemplateCardProps {
	data?: SlidesTemplate.Item
	onClick?: (data: SlidesTemplate.Item) => void
	statusLoadingIds: Set<string>
	hasEditRight: boolean
	sourceTypeLabel: (sourceType?: SlidesTemplate.SourceType) => string
	handleStatusChange: (record: SlidesTemplate.Item, checked: boolean) => void
	handleEdit: (record: SlidesTemplate.Item) => void
	handleDelete: (record: SlidesTemplate.Item) => void
}

function SlidesTemplateCard({
	data,
	onClick,
	statusLoadingIds,
	hasEditRight,
	sourceTypeLabel,
	handleStatusChange,
	handleEdit,
	handleDelete,
}: SlidesTemplateCardProps) {
	const { t } = useTranslation("admin/common")

	if (!data) return null

	const title = data.label?.zh_CN || data.label?.en_US || "-"
	const editDisabled = !hasEditRight || isSystemSlidesTemplate(data)

	return (
		<MobileCard title={title} onClick={() => onClick?.(data)}>
			<Flex vertical gap={8}>
				{data.thumbnail_url ? (
					<Image
						src={data.thumbnail_url}
						alt={data.label?.zh_CN || data.label?.en_US || ""}
						width="100%"
						height={120}
						style={{ objectFit: "cover", borderRadius: 8 }}
						preview={false}
					/>
				) : null}
				<span>
					{t("slidesTemplate.columns.code")}: {data.code}
				</span>
				<span>
					{t("sortOrder")}: {data.sort ?? 0}
				</span>
				<span>
					{t("slidesTemplate.columns.source")}: {sourceTypeLabel(data.source_type)}
				</span>
				<Flex align="center" gap={8}>
					<span>{t("slidesTemplate.columns.status")}:</span>
					<Switch
						checked={data.status === SlidesTemplate.StatusMap.enabled}
						loading={statusLoadingIds.has(data.id)}
						disabled={!hasEditRight || statusLoadingIds.has(data.id)}
						onChange={(checked) => handleStatusChange(data, checked)}
					/>
				</Flex>
				<Flex justify="end" gap={8}>
					<MagicButton
						type="link"
						disabled={editDisabled}
						onClick={() => handleEdit(data)}
					>
						{t("button.edit")}
					</MagicButton>
					<MagicButton
						type="link"
						danger
						disabled={editDisabled}
						onClick={() => handleDelete(data)}
					>
						{t("button.delete")}
					</MagicButton>
				</Flex>
			</Flex>
		</MobileCard>
	)
}

export default memo(SlidesTemplateCard)
