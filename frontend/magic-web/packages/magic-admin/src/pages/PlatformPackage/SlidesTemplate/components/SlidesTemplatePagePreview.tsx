import { memo, useEffect, useState } from "react"
import { Button, Flex } from "antd"
import { createStyles } from "antd-style"
import { IconChevronLeft, IconChevronRight, IconPhoto } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"

interface SlidesTemplatePagePreviewProps {
	pages: string[]
	title: string
}

const useStyles = createStyles(({ token }) => ({
	container: {
		position: "relative",
		width: "100%",
		height: 280,
		overflow: "hidden",
		borderRadius: 10,
		background: token.magicColorUsages.fill[0],
	},
	image: {
		// `contain` preserves the PPT page proportions instead of cropping slide content.
		width: "100%",
		height: "100%",
		objectFit: "contain",
		display: "block",
	},
	empty: {
		height: "100%",
		color: token.colorTextTertiary,
		fontSize: 13,
	},
	navigationButton: {
		position: "absolute",
		top: "50%",
		zIndex: 1,
		width: 32,
		height: 32,
		padding: 0,
		transform: "translateY(-50%)",
		border: 0,
		borderRadius: "50%",
		color: "#fff",
		background: "rgb(0 0 0 / 48%)",
		boxShadow: "0 4px 12px rgb(0 0 0 / 20%)",
		"&:hover": {
			color: "#fff !important",
			background: "rgb(0 0 0 / 68%) !important",
		},
	},
	previous: {
		left: 12,
	},
	next: {
		right: 12,
	},
	pageIndex: {
		position: "absolute",
		right: 12,
		bottom: 12,
		padding: "2px 8px",
		borderRadius: 12,
		color: "#fff",
		fontSize: 12,
		lineHeight: "20px",
		background: "rgb(0 0 0 / 54%)",
	},
}))

function SlidesTemplatePagePreview({ pages, title }: SlidesTemplatePagePreviewProps) {
	const { t } = useTranslation("admin/common")
	const { styles, cx } = useStyles()
	const pageKey = pages.join("\n")
	const [activeIndex, setActiveIndex] = useState(0)
	const pageCount = pages.length
	const safeActiveIndex = Math.min(activeIndex, Math.max(pageCount - 1, 0))
	const activePage = pages[safeActiveIndex]
	const canSwitch = pageCount > 1

	useEffect(() => {
		setActiveIndex(0)
	}, [pageKey])

	if (!pageCount) {
		return (
			<div className={styles.container}>
				<Flex className={styles.empty} align="center" justify="center" gap={8}>
					<IconPhoto size={18} />
					{t("slidesTemplate.preview.empty")}
				</Flex>
			</div>
		)
	}

	const goToPrevious = () => {
		setActiveIndex((current) => (current <= 0 ? pageCount - 1 : current - 1))
	}
	const goToNext = () => {
		setActiveIndex((current) => (current >= pageCount - 1 ? 0 : current + 1))
	}

	return (
		<div className={styles.container}>
			<img
				className={styles.image}
				src={activePage}
				alt={`${title} ${safeActiveIndex + 1}`}
				decoding="async"
				draggable={false}
			/>
			{canSwitch ? (
				<>
					<Button
						type="text"
						className={cx(styles.navigationButton, styles.previous)}
						aria-label={t("slidesTemplate.preview.previousPage")}
						onClick={goToPrevious}
					>
						<IconChevronLeft size={18} />
					</Button>
					<Button
						type="text"
						className={cx(styles.navigationButton, styles.next)}
						aria-label={t("slidesTemplate.preview.nextPage")}
						onClick={goToNext}
					>
						<IconChevronRight size={18} />
					</Button>
				</>
			) : null}
			<span className={styles.pageIndex}>
				{safeActiveIndex + 1} / {pageCount}
			</span>
		</div>
	)
}

export default memo(SlidesTemplatePagePreview)
