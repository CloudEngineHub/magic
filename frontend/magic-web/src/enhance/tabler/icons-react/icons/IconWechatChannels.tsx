import type { IconProps } from "@tabler/icons-react"

const IconWechatChannels = ({ size = 20 }: IconProps) => {
	return (
		<svg
			fill="none"
			height={size}
			viewBox="0 0 20 20"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect width="20" height="20" rx="4" fill="#FA9D3B" />
			<path
				d="M10 4.5C6.964 4.5 4.5 6.964 4.5 10C4.5 13.036 6.964 15.5 10 15.5C13.036 15.5 15.5 13.036 15.5 10C15.5 6.964 13.036 4.5 10 4.5ZM12.625 10.75L9 12.875C8.862 12.955 8.688 12.858 8.688 12.698V8.302C8.688 8.142 8.862 8.045 9 8.125L12.625 10.25C12.763 10.33 12.763 10.52 12.625 10.75Z"
				fill="white"
			/>
		</svg>
	)
}

export default IconWechatChannels
