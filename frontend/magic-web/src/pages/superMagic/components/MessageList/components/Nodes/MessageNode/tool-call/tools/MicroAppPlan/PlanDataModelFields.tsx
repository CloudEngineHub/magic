import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"
import { Badge } from "@/components/shadcn-ui/badge"
import type { PlanDataModelField } from "./model"

interface PlanDataModelFieldsProps {
	fields: PlanDataModelField[]
}

function PlanDataModelFields({ fields }: PlanDataModelFieldsProps) {
	if (fields.length === 0) return null

	return (
		<HeadlessHorizontalScroll
			className="mt-2 rounded-md"
			scrollContainerClassName="overscroll-x-contain"
			scrollContainerProps={{
				"data-testid": "plan-data-model-fields-scroll",
			}}
			renderLeftControl={() => null}
			renderRightControl={() => null}
		>
			<div
				className="flex min-w-max flex-nowrap gap-1.5"
				data-testid="plan-data-model-fields-rail"
			>
				{fields.map((field, index) => {
					const key = `field-${index}`

					if (field.text) {
						return (
							<Badge
								key={key}
								variant="secondary"
								className="shrink-0 whitespace-nowrap rounded-md font-normal"
							>
								{field.text}
							</Badge>
						)
					}

					// 固定卡片宽度便于横向比较字段，长说明由外层滚动容器承载。
					return (
						<div
							key={key}
							className="w-[220px] shrink-0 rounded-md border border-border bg-background px-2.5 py-2"
							data-testid="plan-data-model-field"
						>
							{(field.name || field.type) && (
								<div className="flex items-start justify-between gap-2">
									{field.name && (
										<span className="min-w-0 break-all text-xs font-medium leading-5 text-foreground">
											{field.name}
										</span>
									)}
									{field.type && (
										<Badge
											variant="outline"
											className="h-5 shrink-0 rounded px-1.5 font-mono text-[10px] font-normal"
										>
											{field.type}
										</Badge>
									)}
								</div>
							)}
							{field.description && (
								<p className="mt-1 whitespace-normal text-[11px] leading-4 text-muted-foreground">
									{field.description}
								</p>
							)}
							{field.details.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-1">
									{field.details.map((detail, detailIndex) => (
										<span
											key={`detail-${detailIndex}`}
											className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] leading-4"
										>
											<span className="text-muted-foreground">
												{detail.label}
											</span>
											<span className="break-all text-foreground">
												{detail.value}
											</span>
										</span>
									))}
								</div>
							)}
						</div>
					)
				})}
			</div>
		</HeadlessHorizontalScroll>
	)
}

export default PlanDataModelFields
