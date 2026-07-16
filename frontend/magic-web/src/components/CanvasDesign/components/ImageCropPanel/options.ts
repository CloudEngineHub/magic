export interface PresetOptionItem {
	label: string
	value?: string
}

export interface PresetOption {
	label: string
	value: string
	children: PresetOptionItem[]
}

export const presetOptions: PresetOption[] = [
	{
		label: "通用",
		value: "common",
		children: [
			{
				label: "1:1",
			},
			{
				label: "3:4",
			},
			{
				label: "2:3",
			},
			{
				label: "9:16",
			},
			{
				label: "4:3",
			},
			{
				label: "3:2",
			},
			{
				label: "16:9",
			},
		],
	},
	{
		label: "淘宝/天猫",
		value: "taobao-tmall",
		children: [
			{
				label: "商品主图",
				value: "800x800",
			},
			{
				label: "商品长图",
				value: "800x1200",
			},
			{
				label: "详情页",
				value: "750x1000",
			},
			{
				label: "店铺海报",
				value: "1920x600",
			},
		],
	},
	{
		label: "京东",
		value: "jd",
		children: [
			{
				label: "商品主图",
				value: "800x800",
			},
			{
				label: "商品长图",
				value: "800x1200",
			},
			{
				label: "详情页",
				value: "750x1000",
			},
			{
				label: "店铺横幅",
				value: "1920x500",
			},
		],
	},
	{
		label: "拼多多",
		value: "pinduoduo",
		children: [
			{
				label: "商品主图",
				value: "800x800",
			},
			{
				label: "商品长图",
				value: "800x1200",
			},
			{
				label: "详情页",
				value: "750x1000",
			},
			{
				label: "营销横图",
				value: "1200x600",
			},
		],
	},
	{
		label: "抖音电商",
		value: "douyin-ecommerce",
		children: [
			{
				label: "商品主图",
				value: "800x800",
			},
			{
				label: "短视频封面",
				value: "1080x1920",
			},
			{
				label: "直播封面",
				value: "750x1000",
			},
			{
				label: "店铺头图",
				value: "1125x633",
			},
		],
	},
	{
		label: "小红书电商",
		value: "rednote-ecommerce",
		children: [
			{
				label: "商品方图",
				value: "1080x1080",
			},
			{
				label: "笔记封面",
				value: "1242x1660",
			},
			{
				label: "竖版图文",
				value: "1080x1440",
			},
			{
				label: "横版图文",
				value: "1080x608",
			},
		],
	},
	{
		label: "Instagram",
		value: "instagram",
		children: [
			{
				label: "Square",
				value: "1080x1080",
			},
			{
				label: "Story",
				value: "1080x1920",
			},
			{
				label: "Portrait",
				value: "1080x1350",
			},
			{
				label: "Landscape",
				value: "1080x566",
			},
			{
				label: "Profile photo",
				value: "320x320",
			},
		],
	},
	{
		label: "Facebook",
		value: "facebook",
		children: [
			{
				label: "Story",
				value: "1080x1920",
			},
			{
				label: "Post",
				value: "1200x630",
			},
			{
				label: "Profile photo",
				value: "170x170",
			},
		],
	},
	{
		label: "TikTok",
		value: "tiktok",
		children: [
			{
				label: "Clip",
				value: "1080x1920",
			},
		],
	},
	{
		label: "YouTube",
		value: "youtube",
		children: [
			{
				label: "Thumbnail",
				value: "1280x720",
			},
		],
	},
	{
		label: "LinkedIn",
		value: "linkedin",
		children: [
			{
				label: "LinkedIn",
				value: "1200x627",
			},
			{
				label: "Profile photo",
				value: "400x400",
			},
		],
	},
	{
		label: "Twitter",
		value: "twitter",
		children: [
			{
				label: "Cover photo",
				value: "1500x500",
			},
			{
				label: "Landscape",
				value: "1024x512",
			},
			{
				label: "Profile photo",
				value: "400x400",
			},
		],
	},
]
