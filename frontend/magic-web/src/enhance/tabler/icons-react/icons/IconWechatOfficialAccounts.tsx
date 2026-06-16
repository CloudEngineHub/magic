import type { IconProps } from "@tabler/icons-react"

const IconWechatOfficialAccounts = ({ size = 20 }: IconProps) => {
	return (
		<svg
			fill="none"
			height={size}
			viewBox="0 0 20 20"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect width="20" height="20" rx="4" fill="#07C160" />
			<path
				d="M13.75 8.125C13.75 6.089 11.786 4.375 9.375 4.375C6.964 4.375 5 6.089 5 8.125C5 9.893 6.502 11.399 8.542 11.771L8.125 13.125L9.896 11.8C9.722 11.808 9.549 11.812 9.375 11.812C9.375 11.812 9.375 11.812 9.375 11.812V11.875C9.549 11.875 9.722 11.868 9.893 11.855C9.893 11.855 9.893 11.855 9.893 11.855C12.025 11.632 13.75 10.031 13.75 8.125Z"
				fill="white"
			/>
			<path
				d="M15 11.25C15 9.75 13.75 8.5 12.083 8.25C12.083 8.25 12.083 8.25 12.083 8.25C12.361 8.75 12.5 9.306 12.5 9.875C12.5 11.514 11.264 12.896 9.5 13.417L9.375 14.375L10.625 13.542C12.986 13.542 15 12.528 15 11.25Z"
				fill="rgba(255,255,255,0.7)"
			/>
			<circle cx="7.75" cy="7.75" r="0.625" fill="#07C160" />
			<circle cx="10.75" cy="7.75" r="0.625" fill="#07C160" />
		</svg>
	)
}

export default IconWechatOfficialAccounts
