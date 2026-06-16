import type { IconProps } from "@tabler/icons-react"

const IconFacebook = ({ size = 20 }: IconProps) => {
	return (
		<svg
			fill="none"
			height={size}
			viewBox="0 0 20 20"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect width="20" height="20" rx="4" fill="#1877F2" />
			<path
				d="M13.75 10L14.063 8.125H12.25V6.875C12.25 6.334 12.517 5.812 13.359 5.812H14.141V4.219C14.141 4.219 13.438 4.094 12.766 4.094C11.359 4.094 10.438 4.953 10.438 6.531V8.125H8.781V10H10.438V15.625C10.77 15.678 11.109 15.703 11.453 15.703C11.797 15.703 12.135 15.678 12.469 15.625V10H13.75Z"
				fill="white"
			/>
		</svg>
	)
}

export default IconFacebook
