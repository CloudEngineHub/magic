"""
HTTPX library integration for OpenTelemetry

Provides automatic instrumentation for httpx (modern async/sync HTTP client).
"""
import logging
import json
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from .telemetry import is_telemetry_enabled
from .constants import LangfuseAttributes
from .span_utils import set_observation_io, redact_headers

# Import httpx library first to ensure dependency check passes
try:
    import httpx  # noqa: F401
except ImportError:
    pass

# Try to import httpx instrumentor, but make it optional
try:
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    HTTPX_INSTRUMENTATION_AVAILABLE = True
except ImportError:
    HTTPX_INSTRUMENTATION_AVAILABLE = False
    logging.warning(
        "opentelemetry-instrumentation-httpx not available. "
        "Install it with: pip install opentelemetry-instrumentation-httpx"
    )

# Track if already instrumented
_httpx_instrumented = False

_logger = logging.getLogger(__name__)

# Max request/response body length captured into span attributes.
_MAX_BODY_LEN = 5000


def _read_httpx_body(request):
    """Best-effort read of an httpx request body as a bounded string."""
    try:
        content = getattr(request, "content", None)
        if not content:
            return None
        if isinstance(content, bytes):
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                return f"<binary data, {len(content)} bytes>"
        else:
            text = str(content)
        return text[:_MAX_BODY_LEN] + "...<truncated>" if len(text) > _MAX_BODY_LEN else text
    except Exception:
        return None


def _request_hook(span, request):
    """Hook to set httpx request span name from method + path."""
    if not span or not span.is_recording():
        return

    method = request.method
    url = str(request.url)

    try:
        from urllib.parse import urlparse
        path = getattr(request.url, 'path', None) or urlparse(url).path or "/"
        span_name = f"{method} {path}"
        span.update_name(span_name)
        span.set_attribute(LangfuseAttributes.NAME, span_name)
        _logger.debug(f"Set httpx span name: {span_name}")
    except Exception as e:
        _logger.debug(f"Failed to set httpx span name: {e}")

    # Fill the observation Input column
    try:
        input_payload = {"method": method, "url": url}
        headers = getattr(request, "headers", None)
        if headers is not None:
            input_payload["headers"] = redact_headers(headers)
        body = _read_httpx_body(request)
        if body is not None:
            input_payload["body"] = body
        set_observation_io(span, input_value=input_payload)
    except Exception as e:
        _logger.debug(f"Failed to set httpx observation input: {e}")


def _response_hook(span, request, response):
    """Hook to mark httpx response errors and capture error bodies."""
    if not span or not span.is_recording():
        return

    status_code = response.status_code
    span.set_attribute("http.response.status_code", status_code)

    # Fill the observation Output column for all responses (not only errors).
    try:
        output_payload = {"status_code": status_code}
        out_body = _read_httpx_body(response)
        if out_body is not None:
            output_payload["body"] = out_body
        set_observation_io(span, output_value=output_payload)
    except Exception as e:
        _logger.debug(f"Failed to set httpx observation output: {e}")

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
            response_body = response.text
        except Exception:
            try:
                content = response.content
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


def instrument_httpx() -> None:
    """
    Automatically instrument httpx library with OpenTelemetry

    This will automatically:
    - Trace all HTTP requests made with httpx.Client and httpx.AsyncClient
    - Add request/response metadata to spans
    - Track errors (connection errors, timeouts, HTTP errors)
    - Integrate with existing traces

    Note:
        This function is idempotent - calling it multiple times is safe.

    Usage:
        # In your application startup (ws_server.py)
        from app.infrastructure.observability import instrument_httpx
        instrument_httpx()

        # Then all httpx calls will be automatically traced
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get("https://api.example.com/data")
    """
    global _httpx_instrumented

    # Idempotent: if already instrumented, just return
    if _httpx_instrumented:
        return

    if not is_telemetry_enabled():
        return

    if not HTTPX_INSTRUMENTATION_AVAILABLE:
        _logger.info("httpx instrumentation skipped (package not installed)")
        return

    try:
        HTTPXClientInstrumentor().instrument(
            request_hook=_request_hook,
            response_hook=_response_hook,
        )
        _httpx_instrumented = True
        _logger.info("httpx library instrumentation enabled (with error tracking)")
    except Exception as e:
        # Don't fail if instrumentation fails
        _logger.warning(f"Failed to instrument httpx: {e}")


def uninstrument_httpx() -> None:
    """Remove httpx instrumentation"""
    global _httpx_instrumented

    if not HTTPX_INSTRUMENTATION_AVAILABLE:
        return

    try:
        HTTPXClientInstrumentor().uninstrument()
        _httpx_instrumented = False
    except Exception:
        pass
