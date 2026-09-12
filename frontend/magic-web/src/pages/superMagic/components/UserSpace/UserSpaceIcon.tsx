import type { SVGProps } from "react"

interface UserSpaceIconProps extends SVGProps<SVGSVGElement> {
	size?: number
}

/** 云朵内的用户标识用于区分个人空间与项目文件。 */
export default function UserSpaceIcon({ size = 16, ...props }: UserSpaceIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 8.7 4.5 4.5 0 0 0 7 18Z" />
			<circle cx="12" cy="11" r="1.8" />
			<path d="M8.8 16a3.5 3.5 0 0 1 6.4 0" />
		</svg>
	)
}
