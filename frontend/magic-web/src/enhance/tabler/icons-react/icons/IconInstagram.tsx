import type { IconProps } from "@tabler/icons-react"

const IconInstagram = ({ size = 20 }: IconProps) => {
	return (
		<svg
			fill="none"
			height={size}
			viewBox="0 0 20 20"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				<linearGradient
					id="instagram_gradient"
					x1="1"
					y1="19"
					x2="19"
					y2="1"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#FFDC80" />
					<stop offset="0.25" stopColor="#F77737" />
					<stop offset="0.5" stopColor="#E1306C" />
					<stop offset="0.75" stopColor="#C13584" />
					<stop offset="1" stopColor="#6C63FF" />
				</linearGradient>
			</defs>
			<rect width="20" height="20" rx="4" fill="url(#instagram_gradient)" />
			<path
				d="M10 6.25C7.929 6.25 6.25 7.929 6.25 10C6.25 12.071 7.929 13.75 10 13.75C12.071 13.75 13.75 12.071 13.75 10C13.75 7.929 12.071 6.25 10 6.25ZM10 12.5C8.621 12.5 7.5 11.379 7.5 10C7.5 8.621 8.621 7.5 10 7.5C11.379 7.5 12.5 8.621 12.5 10C12.5 11.379 11.379 12.5 10 12.5Z"
				fill="white"
			/>
			<circle cx="14" cy="6" r="0.75" fill="white" />
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M13.5 3.5H6.5C4.843 3.5 3.5 4.843 3.5 6.5V13.5C3.5 15.157 4.843 16.5 6.5 16.5H13.5C15.157 16.5 16.5 15.157 16.5 13.5V6.5C16.5 4.843 15.157 3.5 13.5 3.5ZM6.5 4.75H13.5C14.467 4.75 15.25 5.533 15.25 6.5V13.5C15.25 14.467 14.467 15.25 13.5 15.25H6.5C5.533 15.25 4.75 14.467 4.75 13.5V6.5C4.75 5.533 5.533 4.75 6.5 4.75Z"
				fill="white"
			/>
		</svg>
	)
}

export default IconInstagram
