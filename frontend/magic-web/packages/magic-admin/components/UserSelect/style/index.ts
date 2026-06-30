import { createStyles } from "antd-style"

export const useStyles = createStyles(({ token, css }) => ({
	avatar: {
		backgroundColor: token.magicColorUsages.primary.default,
		borderRadius: "4px !important",
	},
	tag: css`
		background-color: ${token.magicColorUsages.fill[0]};
		display: flex;
		gap: 4px;
		align-items: center;
		border-radius: 4px;
	`,
}))
