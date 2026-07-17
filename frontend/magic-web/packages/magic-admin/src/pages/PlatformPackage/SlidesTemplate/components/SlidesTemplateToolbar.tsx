import { memo } from "react"
import { Flex, Select } from "antd"
import { IconRefresh, IconSearch } from "@tabler/icons-react"
import type { TFunction } from "i18next"
import { MagicButton, MagicInput } from "@admin-components"
import { SlidesTemplate } from "@admin/types/slidesTemplate"

export interface SlidesTemplateFilterDraft {
	keyword: string
	code: string
	category_code?: string
	tag_codes: string[]
	tag_match?: SlidesTemplate.TagMatch
	status?: SlidesTemplate.Status
}

interface SlidesTemplateToolbarProps {
	className?: string
	filterDraft: SlidesTemplateFilterDraft
	categoryOptions: Array<{ label: string; value: string }>
	tagOptions: Array<{ label: string; value: string }>
	statusLabel: (status: SlidesTemplate.Status) => string
	onFilterDraftChange: React.Dispatch<React.SetStateAction<SlidesTemplateFilterDraft>>
	onSubmit: () => void
	onReset: () => void
	onRefresh: () => void
	onCategoryDropdownOpen?: () => void
	onTagDropdownOpen?: () => void
	t: TFunction
}

export const SlidesTemplateToolbar = memo(
	({
		className,
		filterDraft,
		categoryOptions,
		tagOptions,
		statusLabel,
		onFilterDraftChange,
		onSubmit,
		onReset,
		onRefresh,
		onCategoryDropdownOpen,
		onTagDropdownOpen,
		t,
	}: SlidesTemplateToolbarProps) => {
		return (
			<Flex gap={8} wrap="wrap" className={className}>
				<MagicInput
					value={filterDraft.keyword}
					placeholder={t("slidesTemplate.filters.keyword")}
					style={{ width: 220 }}
					onChange={(event) =>
						onFilterDraftChange((prev) => ({
							...prev,
							keyword: event.target.value,
						}))
					}
					onPressEnter={onSubmit}
				/>
				<MagicInput
					value={filterDraft.code}
					placeholder={t("slidesTemplate.filters.code")}
					style={{ width: 260 }}
					onChange={(event) =>
						onFilterDraftChange((prev) => ({ ...prev, code: event.target.value }))
					}
					onPressEnter={onSubmit}
				/>
				<Select
					allowClear
					showSearch
					value={filterDraft.category_code}
					placeholder={t("slidesTemplate.filters.category")}
					style={{ width: 180 }}
					options={categoryOptions}
					filterOption={(input, option) =>
						String(option?.label ?? "")
							.toLowerCase()
							.includes(input.toLowerCase())
					}
					onOpenChange={(open) => {
						if (open) onCategoryDropdownOpen?.()
					}}
					onChange={(value) =>
						onFilterDraftChange((prev) => ({ ...prev, category_code: value }))
					}
				/>
				<Select
					allowClear
					showSearch
					mode="multiple"
					maxTagCount="responsive"
					value={filterDraft.tag_codes}
					placeholder={t("slidesTemplate.filters.tags")}
					style={{ width: 220 }}
					options={tagOptions}
					filterOption={(input, option) =>
						String(option?.label ?? "")
							.toLowerCase()
							.includes(input.toLowerCase())
					}
					onOpenChange={(open) => {
						if (open) onTagDropdownOpen?.()
					}}
					onChange={(value) =>
						onFilterDraftChange((prev) => ({
							...prev,
							tag_codes: value,
							tag_match: value.length ? (prev.tag_match ?? "any") : undefined,
						}))
					}
				/>
				<Select
					value={filterDraft.tag_match ?? "any"}
					placeholder={t("slidesTemplate.filters.tagMatch")}
					style={{ width: 120 }}
					disabled={!filterDraft.tag_codes.length}
					options={[
						{ label: t("slidesTemplate.tagMatch.any"), value: "any" },
						{ label: t("slidesTemplate.tagMatch.all"), value: "all" },
					]}
					onChange={(value) =>
						onFilterDraftChange((prev) => ({ ...prev, tag_match: value }))
					}
				/>
				<Select
					allowClear
					value={filterDraft.status}
					placeholder={t("slidesTemplate.filters.status")}
					style={{ width: 160 }}
					options={[
						{ label: statusLabel(SlidesTemplate.StatusMap.enabled), value: 1 },
						{ label: statusLabel(SlidesTemplate.StatusMap.disabled), value: 0 },
					]}
					onChange={(value) =>
						onFilterDraftChange((prev) => ({ ...prev, status: value }))
					}
				/>
				<MagicButton type="primary" icon={<IconSearch size={16} />} onClick={onSubmit}>
					{t("button.search")}
				</MagicButton>
				<MagicButton onClick={onReset}>{t("button.reset")}</MagicButton>
				<MagicButton icon={<IconRefresh size={16} />} onClick={onRefresh}>
					{t("button.reload")}
				</MagicButton>
			</Flex>
		)
	},
)
