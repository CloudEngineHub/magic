from __future__ import annotations

from dataclasses import dataclass, field

from magic_use.errors import BrowserConfigError
from magic_use.models.common import BrowserBackendKind, BrowserName
from magic_use.userscripts import Userscript


@dataclass(frozen=True, slots=True)
class ProxyConfig:
    server: str
    username: str | None = None
    password: str | None = None
    bypass: tuple[str, ...] = ()

    def to_playwright(self) -> dict[str, str]:
        value = {"server": self.server}
        if self.username is not None:
            value["username"] = self.username
        if self.password is not None:
            value["password"] = self.password
        if self.bypass:
            value["bypass"] = ",".join(self.bypass)
        return value


@dataclass(frozen=True, slots=True)
class LocalPlaywrightConfig:
    headless: bool = True
    browser_args: tuple[str, ...] = ()
    downloads_path: str | None = None
    proxy: ProxyConfig | None = None


@dataclass(frozen=True, slots=True)
class RemotePlaywrightConfig:
    endpoint: str
    health_check_enabled: bool = True
    health_check_url: str | None = None
    health_check_timeout_seconds: float = 60.0
    health_check_interval_seconds: float = 1.0
    connect_timeout_ms: float = 30_000
    retry_timeout_seconds: float = 60.0
    retry_interval_seconds: float = 1.0

    def __post_init__(self) -> None:
        if not self.endpoint.startswith(("ws://", "wss://")):
            raise BrowserConfigError("Remote Playwright endpoint must use ws:// or wss://")
        if self.health_check_url is not None and not self.health_check_url.startswith(("http://", "https://")):
            raise BrowserConfigError("Remote Playwright health_check_url must use http:// or https://")
        if min(
            self.health_check_timeout_seconds,
            self.health_check_interval_seconds,
            self.connect_timeout_ms,
            self.retry_timeout_seconds,
            self.retry_interval_seconds,
        ) <= 0:
            raise BrowserConfigError("Remote Playwright timeouts must be positive")


@dataclass(frozen=True, slots=True)
class BrowserContextConfig:
    viewport_width: int = 1280
    viewport_height: int = 1940
    device_scale_factor: float = 2.0
    user_agent: str | None = None
    extra_headers: dict[str, str] = field(default_factory=dict)
    locale: str = "zh-CN"
    timezone_id: str = "Asia/Shanghai"
    permissions: tuple[str, ...] = ()
    geolocation: tuple[float, float] | None = None
    storage_state: str | dict[str, object] | None = None
    storage_state_path: str | None = None
    bypass_csp: bool = False
    ignore_https_errors: bool = False
    accept_downloads: bool = True

    def __post_init__(self) -> None:
        if self.viewport_width < 1 or self.viewport_height < 1:
            raise BrowserConfigError("Browser viewport dimensions must be positive")
        if self.device_scale_factor <= 0:
            raise BrowserConfigError("Browser device scale factor must be positive")
        if self.geolocation is not None:
            latitude, longitude = self.geolocation
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise BrowserConfigError("Browser geolocation is outside the valid range")


@dataclass(frozen=True, slots=True)
class PureConfig:
    enabled: bool = True
    disabled_domains: frozenset[str] = frozenset()
    session_override: bool | None = None

    def __post_init__(self) -> None:
        normalized_domains = (
            domain.strip().lower().strip(".")
            for domain in self.disabled_domains
        )
        object.__setattr__(
            self,
            "disabled_domains",
            frozenset(domain for domain in normalized_domains if domain),
        )

    def enabled_for(self, hostname: str) -> bool:
        if self.session_override is not None:
            return self.session_override
        normalized = hostname.lower().strip(".")
        if any(normalized == domain or normalized.endswith(f".{domain}") for domain in self.disabled_domains):
            return False
        return self.enabled


@dataclass(frozen=True, slots=True)
class BrowserScriptConfig:
    pure: PureConfig = field(default_factory=PureConfig)
    lens_enabled: bool = True
    marker_enabled: bool = True
    userscripts: tuple[Userscript, ...] = ()


@dataclass(frozen=True, slots=True)
class SnapshotConfig:
    max_nodes: int = 500
    max_depth: int = 30

    def __post_init__(self) -> None:
        if self.max_nodes < 1 or self.max_depth < 1:
            raise BrowserConfigError("Snapshot limits must be positive")


@dataclass(frozen=True, slots=True)
class BrowserArtifactConfig:
    webp_quality: int = 35
    webp_min_quality: int = 15
    webp_quality_step: int = 5
    max_bytes: int = 100 * 1024
    resize_step: float = 0.85
    min_dimension: int = 640

    def __post_init__(self) -> None:
        if not 0 <= self.webp_min_quality <= self.webp_quality <= 100:
            raise BrowserConfigError("Browser WebP quality range is invalid")
        if self.webp_quality_step < 1 or self.max_bytes < 1 or self.min_dimension < 1:
            raise BrowserConfigError("Browser artifact limits must be positive")
        if not 0 < self.resize_step < 1:
            raise BrowserConfigError("Browser artifact resize step must be between zero and one")


@dataclass(frozen=True, slots=True)
class BrowserTimeouts:
    default_ms: float = 30_000
    navigation_ms: float = 30_000
    script_ms: float = 10_000
    action_settle_ms: float = 150
    stability_timeout_ms: float = 3_000
    network_quiet_ms: float = 500
    dom_quiet_ms: float = 300

    def __post_init__(self) -> None:
        if min(
            self.default_ms,
            self.navigation_ms,
            self.script_ms,
            self.stability_timeout_ms,
            self.network_quiet_ms,
            self.dom_quiet_ms,
        ) <= 0 or self.action_settle_ms < 0:
            raise BrowserConfigError("Browser timeouts must be positive and action_settle_ms cannot be negative")


@dataclass(frozen=True, slots=True)
class BrowserLifecycleConfig:
    page_idle_seconds: float = 600
    page_keep_alive_max_seconds: float = 3_600
    context_idle_seconds: float = 120
    host_idle_seconds: float = 120
    sweep_interval_seconds: float = 5

    def __post_init__(self) -> None:
        if min(
            self.page_idle_seconds,
            self.page_keep_alive_max_seconds,
            self.context_idle_seconds,
            self.host_idle_seconds,
            self.sweep_interval_seconds,
        ) <= 0:
            raise BrowserConfigError("Browser lifecycle durations must be positive")


@dataclass(frozen=True, slots=True)
class BrowserResourceLimits:
    soft_contexts: int = 8
    hard_contexts: int = 12
    soft_pages: int = 24
    hard_pages: int = 32

    def __post_init__(self) -> None:
        if min(self.soft_contexts, self.hard_contexts, self.soft_pages, self.hard_pages) < 1:
            raise BrowserConfigError("Browser resource limits must be positive")
        if self.soft_contexts > self.hard_contexts or self.soft_pages > self.hard_pages:
            raise BrowserConfigError("Browser soft limits cannot exceed hard limits")


@dataclass(frozen=True, slots=True)
class BrowserRuntimeConfig:
    host_scope: str = "default"
    backend: BrowserBackendKind = BrowserBackendKind.LOCAL_PLAYWRIGHT
    browser_name: BrowserName = BrowserName.CHROMIUM
    local_playwright: LocalPlaywrightConfig = field(default_factory=LocalPlaywrightConfig)
    remote_playwright: RemotePlaywrightConfig | None = None
    context: BrowserContextConfig = field(default_factory=BrowserContextConfig)
    scripts: BrowserScriptConfig = field(default_factory=BrowserScriptConfig)
    snapshot: SnapshotConfig = field(default_factory=SnapshotConfig)
    artifacts: BrowserArtifactConfig = field(default_factory=BrowserArtifactConfig)
    timeouts: BrowserTimeouts = field(default_factory=BrowserTimeouts)
    lifecycle: BrowserLifecycleConfig = field(default_factory=BrowserLifecycleConfig)
    resources: BrowserResourceLimits = field(default_factory=BrowserResourceLimits)
    event_buffer_size: int = 1_000
    diagnostic_buffer_size: int = 1_000

    def __post_init__(self) -> None:
        if not self.host_scope.strip():
            raise BrowserConfigError("Browser host_scope cannot be empty")
        if self.backend is BrowserBackendKind.REMOTE_PLAYWRIGHT and self.remote_playwright is None:
            raise BrowserConfigError("remote_playwright config is required for the remote backend")
        if self.event_buffer_size < 1 or self.diagnostic_buffer_size < 1:
            raise BrowserConfigError("Browser buffer limits must be positive")
