"""
Requests library integration for OpenTelemetry

Provides automatic instrumentation for requests (synchronous HTTP client).
"""
import logging
import json
from urllib.parse import urlparse
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from .telemetry import is_telemetry_enabled
from .constants import LangfuseAttributes
from .span_utils import set_observation_io, redact_headers

# Import requests library first to ensure dependency check passes
try:
    import requests  # noqa: F401
except ImportError:
    pass

# Try to import requests instrumentor, but make it optional
try:
    from opentelemetry.instrumentation.requests import RequestsInstrumentor
    REQUESTS_INSTRUMENTATION_AVAILABLE = True
except ImportError:
    REQUESTS_INSTRUMENTATION_AVAILABLE = False
    logging.warning(
        "opentelemetry-instrumentation-requests not available. "
        "Install it with: pip install opentelemetry-instrumentation-requests"
    )

# Track if already instrumented
_requests_instrumented = False

_logger = logging.getLogger(__name__)

# Max request/response body length captured into span attributes.
_MAX_BODY_LEN = 5000


def _bounded_text(text: str) -> str:
    return text[:_MAX_BODY_LEN] + "...<truncated>" if len(text) > _MAX_BODY_LEN else text


def _read_requests_body(body):
    """Best-effort read of a requests PreparedRequest body as a bounded string."""
    try:
        if not body:
            return None
        if isinstance(body, bytes):
            try:
                return _bounded_text(body.decode("utf-8"))
            except UnicodeDecodeError:
                return f"<binary data, {len(body)} bytes>"
        return _bounded_text(str(body))
    except Exception:
        return None


def _request_hook(span, request_obj):
    """Hook to set requests span name from method + path."""
    if not span or not span.is_recording():
        return

    method = request_obj.method
    url = request_obj.url

    try:
        parsed = urlparse(url)
        path = parsed.path or "/"
        span_name = f"{method} {path}"
        span.update_name(span_name)
        span.set_attribute(LangfuseAttributes.NAME, span_name)
        _logger.debug(f"Set requests span name: {span_name}")
    except Exception as e:
        _logger.debug(f"Failed to set requests span name: {e}")

    # Fill the observation Input column
    try:
        input_payload = {"method": method, "url": url}
        headers = getattr(request_obj, "headers", None)
        if headers is not None:
            input_payload["headers"] = redact_headers(headers)
        body = _read_requests_body(getattr(request_obj, "body", None))
        if body is not None:
            input_payload["body"] = body
        set_observation_io(span, input_value=input_payload)
    except Exception as e:
        _logger.debug(f"Failed to set requests observation input: {e}")


def _response_hook(span, request_obj, response_obj):
    """Hook to mark requests response errors and capture error bodies."""
    if not span or not span.is_recording():
        return

    status_code = response_obj.status_code
    span.set_attribute("http.response.status_code", status_code)

    # Fill the observation Output column for all responses (not only errors).
    try:
        output_payload = {"status_code": status_code}
        try:
            out_body = _bounded_text(response_obj.text) if response_obj.text else None
        except Exception:
            out_body = None
        if out_body is not None:
            output_payload["body"] = out_body
        set_observation_io(span, output_value=output_payload)
    except Exception as e:
        _logger.debug(f"Failed to set requests observation output: {e}")

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
            response_body = response_obj.text
        except Exception:
            try:
                content = response_obj.content
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


def instrument_requests() -> None:
    """
    Automatically instrument requests library with OpenTelemetry

    This will automatically:
    - Trace all HTTP requests made with requests.get/post/put/delete/patch
    - Add request/response metadata to spans
    - Track errors (connection errors, timeouts, HTTP errors)
    - Integrate with existing traces

    Note:
        This function is idempotent - calling it multiple times is safe.

    Usage:
        # In your application startup (ws_server.py)
        from app.infrastructure.observability import instrument_requests
        instrument_requests()

        # Then all requests calls will be automatically traced
        import requests
        response = requests.get("https://api.example.com/data")
    """
    global _requests_instrumented

    # Idempotent: if already instrumented, just return
    if _requests_instrumented:
        return

    if not is_telemetry_enabled():
        return

    if not REQUESTS_INSTRUMENTATION_AVAILABLE:
        _logger.info("requests instrumentation skipped (package not installed)")
        return

    try:
        RequestsInstrumentor().instrument(
            request_hook=_request_hook,
            response_hook=_response_hook,
        )
        _requests_instrumented = True
        _logger.info("requests library instrumentation enabled (with error tracking)")
    except Exception as e:
        # Don't fail if instrumentation fails
        _logger.warning(f"Failed to instrument requests: {e}")


def uninstrument_requests() -> None:
    """Remove requests instrumentation"""
    global _requests_instrumented

    if not REQUESTS_INSTRUMENTATION_AVAILABLE:
        return

    try:
        RequestsInstrumentor().uninstrument()
        _requests_instrumented = False
    except Exception:
        pass
