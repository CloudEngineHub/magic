import {
	IconArrowLeft,
	IconArrowRight,
	IconCheck,
	IconCode,
	IconDots,
	IconLogin2,
	type IconProps,
} from "@tabler/icons-react"
import React from "react"

const icons = {
	"ts-arrow-left": IconArrowLeft,
	"ts-arrow-right": IconArrowRight,
	"ts-check-line": IconCheck,
	"ts-code": IconCode,
	"ts-more-dot": IconDots,
	"ts-subtask": IconLogin2,
} as const

type TSIconProps = Omit<IconProps, "type"> & {
	type: keyof typeof icons
}

export default function TSIcon({ type, ...props }: TSIconProps) {
	const Icon = icons[type]
	return <Icon size={props.size ?? 18} {...props} />
}
