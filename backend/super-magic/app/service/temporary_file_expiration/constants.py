"""默认临时文件过期策略常量。"""

TEXT_TTL_SECONDS = 12 * 60 * 60
IMAGE_TTL_SECONDS = 24 * 60 * 60
DEFAULT_TTL_SECONDS = 24 * 60 * 60

TEXT_EXTENSIONS = frozenset({".txt"})

IMAGE_EXTENSIONS = frozenset(
    {
        ".avif",
        ".bmp",
        ".gif",
        ".jpeg",
        ".jpg",
        ".png",
        ".svg",
        ".webp",
    }
)
