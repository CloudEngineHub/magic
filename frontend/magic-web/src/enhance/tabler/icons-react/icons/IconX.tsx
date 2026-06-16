import type { IconProps } from "@tabler/icons-react"

const IconX = ({ size = 20 }: IconProps) => {
	return (
		<svg
			fill="none"
			height={size}
			viewBox="0 0 20 20"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect width="20" height="20" rx="4" fill="#000000" />
			<path
				d="M11.469 9.178L15.35 4.75H14.355L11.028 8.55L8.36 4.75H5L9.076 10.61L5 15.25H5.995L9.516 11.238L12.34 15.25H15.7L11.469 9.178ZM10.015 10.664L9.571 10.04L6.35 5.484H7.886L10.41 9.147L10.854 9.771L14.355 14.546H12.82L10.015 10.664Z"
				fill="white"
			/>
		</svg>
	)
}

export default IconX
