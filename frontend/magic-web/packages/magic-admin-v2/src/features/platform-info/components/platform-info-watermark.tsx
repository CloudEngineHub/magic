import { Info } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
	DescriptionList,
	EditableDescriptionList,
} from "@magic-admin-v2/components/description-list"
import { Badge } from "@magic-admin-v2/components/ui/badge"
import { Button } from "@magic-admin-v2/components/ui/button"
import { Checkbox } from "@magic-admin-v2/components/ui/checkbox"
import { Switch } from "@magic-admin-v2/components/ui/switch"
import type {
	PlatformInfoWatermark,
	PlatformWatermarkDepth,
	PlatformWatermarkField,
} from "@magic-admin-v2/features/platform-info/types"
import {
	buildPlatformWatermarkPreviewText,
	platformWatermarkDepthTextColors,
	platformWatermarkDepths,
	platformWatermarkFields,
} from "@magic-admin-v2/features/platform-info/utils"
import { cn } from "@magic-admin-v2/utils/cn"
import { PlatformInfoFieldControl } from "./platform-info-fields"

/** 预览层需要铺满整块画布，重复次数按画布尺寸与旋转角度取值。 */
const watermarkPreviewRepeatCount = 12

/** 预览画布旋转角度，与前台水印渲染保持一致。 */
const watermarkPreviewRotate = "-12deg"

/**
 * 水印相关文案必须使用静态 i18n key，因此这里显式列出每个字段的读取，
 * 而不是用变量拼接 key。
 */
function usePlatformWatermarkCopy() {
	const { t } = useTranslation()

	const fieldLabels: Record<PlatformWatermarkField, string> = {
		real_name: t("platformInfo.watermark.field.realName"),
		employee_no: t("platformInfo.watermark.field.employeeNo"),
		visit_time: t("platformInfo.watermark.field.visitTime"),
		department: t("platformInfo.watermark.field.department"),
		phone: t("platformInfo.watermark.field.phone"),
		email: t("platformInfo.watermark.field.email"),
	}
	const fieldSamples: Record<PlatformWatermarkField, string> = {
		real_name: t("platformInfo.watermark.preview.sample.realName"),
		employee_no: t("platformInfo.watermark.preview.sample.employeeNo"),
		visit_time: t("platformInfo.watermark.preview.sample.visitTime"),
		department: t("platformInfo.watermark.preview.sample.department"),
		phone: t("platformInfo.watermark.preview.sample.phone"),
		email: t("platformInfo.watermark.preview.sample.email"),
	}
	const depthLabels: Record<PlatformWatermarkDepth, string> = {
		light: t("platformInfo.watermark.depth.light"),
		standard: t("platformInfo.watermark.depth.standard"),
		strong: t("platformInfo.watermark.depth.strong"),
	}

	return { depthLabels, fieldLabels, fieldSamples }
}

/** 按固定顺序取出已选水印字段，保证预览与徽标顺序稳定。 */
function getSelectedWatermarkFields(value: PlatformInfoWatermark) {
	return platformWatermarkFields.filter((field) => value.fields.includes(field))
}

export function PlatformInfoWatermarkPreview({ value }: { value: PlatformInfoWatermark }) {
	const { t } = useTranslation()
	const { depthLabels, fieldLabels, fieldSamples } = usePlatformWatermarkCopy()
	const selectedFields = getSelectedWatermarkFields(value)
	const previewText =
		buildPlatformWatermarkPreviewText(selectedFields, fieldSamples) ||
		t("platformInfo.watermark.preview.fallback")

	return (
		<div className="space-y-6">
			<DescriptionList
				items={[
					[
						t("platformInfo.watermark.field.enabled"),
						<Badge variant={value.enabled ? "success" : "outline"}>
							{value.enabled ? t("common.enabled") : t("common.disabled")}
						</Badge>,
					],
					[
						t("platformInfo.watermark.field.content"),
						selectedFields.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{selectedFields.map((field) => (
									<Badge
										className="whitespace-nowrap"
										key={field}
										variant="outline"
									>
										{fieldLabels[field]}
									</Badge>
								))}
							</div>
						) : (
							""
						),
					],
					[t("platformInfo.watermark.field.depth"), depthLabels[value.depth]],
				]}
			/>
			<PlatformWatermarkCanvas
				enabled={value.enabled}
				previewText={previewText}
				depth={value.depth}
			/>
			<p className="text-xs text-muted-foreground">
				{t("platformInfo.watermark.preview.tip")}
			</p>
		</div>
	)
}

export function PlatformInfoWatermarkForm({
	error,
	onChange,
	value,
}: {
	error?: string
	onChange: (value: PlatformInfoWatermark) => void
	value: PlatformInfoWatermark
}) {
	const { t } = useTranslation()
	const { depthLabels, fieldLabels } = usePlatformWatermarkCopy()
	const [contentError, setContentError] = useState("")
	// 水印关闭时内容和深浅保留在表单里但不可编辑，避免用户误以为配置已废弃。
	const isContentDisabled = !value.enabled

	function toggleField(field: PlatformWatermarkField, checked: boolean) {
		const nextFields = checked
			? platformWatermarkFields.filter(
					(item) => item === field || value.fields.includes(item),
				)
			: value.fields.filter((item) => item !== field)

		// 与旧版一致：开启水印后至少保留一项内容，否则前台会渲染出空白水印。
		// 这里直接阻止改动并就地提示，避免用户切到别的分区后保存出无效配置。
		if (value.enabled && nextFields.length === 0) {
			setContentError(t("platformInfo.validation.watermarkContentRequired"))
			return
		}

		setContentError("")
		onChange({ ...value, fields: nextFields })
	}

	function toggleEnabled(checked: boolean) {
		setContentError("")
		onChange({ ...value, enabled: checked })
	}

	return (
		<div className="space-y-6">
			<EditableDescriptionList
				items={[
					[
						t("platformInfo.watermark.field.enabled"),
						<div className="flex h-9 items-center gap-3">
							<Switch checked={value.enabled} onCheckedChange={toggleEnabled} />
							<span className="text-sm text-muted-foreground">
								{value.enabled ? t("common.enabled") : t("common.disabled")}
							</span>
						</div>,
						t("platformInfo.watermark.fieldDesc.enabled"),
					],
					[
						t("platformInfo.watermark.field.content"),
						<PlatformInfoFieldControl error={contentError || error}>
							<div
								className={cn(
									"grid gap-x-5 gap-y-3 sm:grid-cols-2",
									isContentDisabled && "opacity-60",
								)}
								role="group"
								aria-label={t("platformInfo.watermark.field.content")}
							>
								{platformWatermarkFields.map((field) => (
									<div className="flex items-center gap-2" key={field}>
										<Checkbox
											checked={value.fields.includes(field)}
											disabled={isContentDisabled}
											id={`platform-watermark-field-${field}`}
											onCheckedChange={(checked) =>
												toggleField(field, checked === true)
											}
										/>
										<label
											className="text-sm"
											htmlFor={`platform-watermark-field-${field}`}
										>
											{fieldLabels[field]}
										</label>
									</div>
								))}
							</div>
						</PlatformInfoFieldControl>,
						t("platformInfo.watermark.fieldDesc.content"),
					],
					[
						t("platformInfo.watermark.field.depth"),
						<div
							aria-label={t("platformInfo.watermark.field.depth")}
							className="grid grid-cols-3 gap-2"
							role="radiogroup"
						>
							{platformWatermarkDepths.map((depth) => (
								<Button
									aria-checked={value.depth === depth}
									className="w-full"
									disabled={isContentDisabled}
									key={depth}
									onClick={() => onChange({ ...value, depth })}
									role="radio"
									type="button"
									variant={value.depth === depth ? "default" : "outline"}
								>
									{depthLabels[depth]}
								</Button>
							))}
						</div>,
						t("platformInfo.watermark.fieldDesc.depth"),
					],
				]}
			/>
			<PlatformWatermarkNotice />
		</div>
	)
}

function PlatformWatermarkNotice() {
	const { t } = useTranslation()

	return (
		<p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
			<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<span>{t("platformInfo.watermark.defaultTip")}</span>
		</p>
	)
}

function PlatformWatermarkCanvas({
	depth,
	enabled,
	previewText,
}: {
	depth: PlatformWatermarkDepth
	enabled: boolean
	previewText: string
}) {
	const { t } = useTranslation()

	return (
		<div className="space-y-2">
			<p className="text-sm font-medium">{t("platformInfo.watermark.preview.title")}</p>
			<div className="relative h-56 overflow-hidden rounded-md border bg-background">
				{/* 水印层需要超出画布再旋转，否则四角会露出空白；文字颜色由深浅档位决定，
				 * 属于渲染参数，因此使用内联样式而不是主题色。
				 * 列宽使用 max-content 而不是 1fr：选择较多内容时文案会变长，
				 * 零最小宽度的列会让相邻两列文字互相重叠。 */}
				<div
					aria-hidden="true"
					className="absolute -inset-24 grid grid-cols-[repeat(2,minmax(max-content,1fr))] content-around justify-items-start gap-x-6 gap-y-8"
					style={{
						color: platformWatermarkDepthTextColors[depth],
						opacity: enabled ? 1 : 0.35,
						transform: `rotate(${watermarkPreviewRotate})`,
					}}
				>
					{Array.from({ length: watermarkPreviewRepeatCount }, (_, index) => (
						<span className="whitespace-nowrap text-lg leading-6" key={index}>
							{previewText}
						</span>
					))}
				</div>
			</div>
		</div>
	)
}
