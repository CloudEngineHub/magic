import { SlidesTemplate } from "../../../types/slidesTemplate"

export interface SlidesTemplateFormValues {
	label: SlidesTemplate.LangText
	description: SlidesTemplate.LangText
	thumbnail_file_key: string
	collage_file_key?: string | null
	template_file_key: string
	preview_url?: string | null
	status?: boolean
	sort?: number | null
}

export function resolveSlidesTemplateTitle(record: SlidesTemplate.Item) {
	return record.label?.zh_CN || record.label?.en_US || record.code
}

export function getSlidesTemplateStatusByChecked(checked: boolean) {
	return checked ? SlidesTemplate.StatusMap.enabled : SlidesTemplate.StatusMap.disabled
}

export function isSystemSlidesTemplate(record: Pick<SlidesTemplate.Item, "source_type">) {
	return record.source_type === SlidesTemplate.SourceTypeMap.system
}

export function buildSlidesTemplateSaveParams(
	values: SlidesTemplateFormValues,
): SlidesTemplate.SaveParams {
	return {
		label: values.label,
		description: values.description,
		thumbnail_file_key: values.thumbnail_file_key,
		collage_file_key: values.collage_file_key || null,
		template_file_key: values.template_file_key,
		preview_url: values.preview_url || null,
		status: getSlidesTemplateStatusByChecked(Boolean(values.status)),
		sort: values.sort ?? 0,
	}
}
