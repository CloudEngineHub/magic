"""
aiohttp integration for OpenTelemetry

Provides automatic instrumentation for aiohttp client requests.
"""
import logging
import json
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from .telemetry import is_telemetry_enabled
from .constants import LangfuseAttributes
from .span_utils import set_observation_io, redact_headers

# Import aiohttp library first to ensure dependency check passes
# Then import TraceConfig for custom trace configuration
try:
    import aiohttp  # noqa: F401
    from aiohttp import TraceConfig
    AIOHTTP_TRACE_CONFIG_AVAILABLE = True
except ImportError:
    AIOHTTP_TRACE_CONFIG_AVAILABLE = False
    TraceConfig = None

# Try to import aiohttp instrumentor, but make it optional
try:
    from opentelemetry.instrumentation.aiohttp_client import AioHttpClientInstrumentor
    AIOHTTP_INSTRUMENTATION_AVAILABLE = True
except ImportError:
    AIOHTTP_INSTRUMENTATION_AVAILABLE = False
    logging.warning(
        "opentelemetry-instrumentation-aiohttp-client not available. "
        "Install it with: pip install opentelemetry-instrumentation-aiohttp-client"
    )

# Track if already instrumented
_aiohttp_instrumented = False

_logger = logging.getLogger(__name__)


async def _on_request_start(session, trace_config_ctx, params):
    """Hook to set aiohttp request span name from method + path."""
    span = trace.get_current_span()
    if not span or not span.is_recording():
        return

    try:
        method = str(params.method)
        url = params.url
        path = url.path or "/"
        span_name = f"{method} {path}"
        span.update_name(span_name)
        span.set_attribute(LangfuseAttributes.NAME, span_name)
        _logger.debug(f"Set aiohttp span name: {span_name}")
    except Exception as e:
        _logger.debug(f"Failed to set aiohttp span name: {e}")

    # Fill the observation Input column (headers only; request body is a stream we
    # must not consume here).
    try:
        input_payload = {"method": str(params.method), "url": str(params.url)}
        headers = getattr(params, "headers", None)
        if headers is not None:
            input_payload["headers"] = redact_headers(headers)
        set_observation_io(span, input_value=input_payload)
    except Exception as e:
        _logger.debug(f"Failed to set aiohttp observation input: {e}")


async def _on_request_end(session, trace_config_ctx, params):
    """Hook to mark aiohttp response errors and capture error bodies."""
    span = trace.get_current_span()
    if not span or not span.is_recording():
        return

    response = params.response if hasattr(params, 'response') else None
    if not response:
        return

    status_code = response.status
    span.set_attribute("http.response.status_code", status_code)

    # Fill the observation Output column. We only record the status code here to avoid
    # consuming the response stream on success; error bodies are captured below.
    try:
        set_observation_io(span, output_value={"status_code": status_code})
    except Exception as e:
        _logger.debug(f"Failed to set aiohttp observation output: {e}")

    if status_code >= 400:
        error_category = "5xx" if status_code >= 500 else "4xx"
        error_type = "server_error" if status_code >= 500 else "client_error"

        span.set_status(Status(StatusCode.ERROR, f"HTTP {status_code}"))
        span.set_attribute("error", True)
        span.set_attribute("error.type", error_type)
        span.set_attribute("error.status_code", status_code)
        span.set_attribute("http.error.category", error_category)

        response_body = ""
        try:
            response_body = await response.text()
        except Exception:
            try:
                content = await response.read()
                if content:
                    response_body = f"<binary data, {len(content)} bytes>"
            except Exception:
                pass

        if response_body:
            body_preview = response_body[:1000] if len(response_body) > 1000 else response_body
            span.set_attribute("http.response.body", body_preview)
            span.add_event(
                name="http.error.response",
                attributes={
                    "http.status_code": status_code,
                    "http.response.body": response_body[:5000],
                    "error.message": f"HTTP {status_code}: {body_preview}",
                },
            )
            try:
                body_json = json.loads(response_body)
                if isinstance(body_json, dict):
                    if "error" in body_json:
                        span.set_attribute("error.message", str(body_json["error"]))
                    elif "message" in body_json:
                        span.set_attribute("error.message", str(body_json["message"]))
                    if "detail" in body_json:
                        span.set_attribute("error.detail", str(body_json["detail"]))
            except (json.JSONDecodeError, TypeError):
                span.set_attribute("error.message", body_preview)
    else:
        span.set_status(Status(StatusCode.OK))


def instrument_aiohttp():
    """
    Automatically instrument aiohttp client with OpenTelemetry

    This will automatically:
    - Trace all HTTP requests made with aiohttp.ClientSession
    - Add request/response metadata to spans
    - Track errors (4xx, 5xx, exceptions)
    - Add response time metrics

    Note:
        This function is idempotent - calling it multiple times is safe.

    Usage:
        # In your application startup (ws_server.py)
        from app.infrastructure.observability import instrument_aiohttp
        instrument_aiohttp()

        # Then all aiohttp requests will be automatically traced
        async with aiohttp.ClientSession() as session:
            async with session.get("https://api.example.com/data") as response:
                data = await response.json()
    """
    global _aiohttp_instrumented

    # Idempotent: if already instrumented, just return
    if _aiohttp_instrumented:
        return

    if not is_telemetry_enabled():
        return

    if not AIOHTTP_INSTRUMENTATION_AVAILABLE:
        _logger.info("aiohttp instrumentation skipped (package not installed)")
        return

    try:
        # Create trace config with hooks for span naming and error tracking
        if not AIOHTTP_TRACE_CONFIG_AVAILABLE or TraceConfig is None:
            _logger.warning("aiohttp TraceConfig not available, skipping custom trace config")
            AioHttpClientInstrumentor().instrument()
            _aiohttp_instrumented = True
            _logger.info("aiohttp client instrumentation enabled (without custom trace config)")
            return

        trace_config = TraceConfig()

        # Hook 1: Update span name on request start
        async def on_request_start_hook(session, trace_config_ctx, params):
            """Update span name with full path + query string"""
            await _on_request_start(session, trace_config_ctx, params)

        # Hook 2: Mark errors on request end
        async def on_request_end_hook(session, trace_config_ctx, params):
            """Mark 4xx/5xx as errors"""
            await _on_request_end(session, trace_config_ctx, params)

        trace_config.on_request_start.append(on_request_start_hook)
        trace_config.on_request_end.append(on_request_end_hook)

        # Instrument with trace config
        # Note: We need to pass trace_configs as a list
        AioHttpClientInstrumentor().instrument(
            tracer_provider=None,  # Use default tracer
            trace_configs=[trace_config],
        )
        _aiohttp_instrumented = True
        _logger.info("aiohttp client instrumentation enabled (with span naming and error tracking)")
    except Exception as e:
        # Don't fail if instrumentation fails
        _logger.warning(f"Failed to instrument aiohttp: {e}")


def uninstrument_aiohttp():
    """Remove aiohttp instrumentation"""
    global _aiohttp_instrumented

    if not AIOHTTP_INSTRUMENTATION_AVAILABLE:
        return

    try:
        AioHttpClientInstrumentor().uninstrument()
        _aiohttp_instrumented = False
    except Exception:
        pass
