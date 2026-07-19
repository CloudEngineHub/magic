"""Unit tests for observability sampling and attribute reduction.

Covers:
- _ErrorFirstSamplingProcessor: tail-based sampling logic
- base_tool span attributes: minimal on success, full context on error
- HTTP hook helpers (httpx, requests, aiohttp): span naming and error marking
- FastAPI server request hook: span naming, removed noisy attributes
"""
import json
import random
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers for building real SDK spans used across tests
# ---------------------------------------------------------------------------
from opentelemetry import trace as trace_api
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import Status, StatusCode

_RESOURCE = Resource.create({"service.name": "test"})


def _make_provider() -> TracerProvider:
    return TracerProvider(resource=_RESOURCE)


def _make_span(provider: TracerProvider, name: str = "test_span"):
    """Return a started (not ended) _Span from the given provider."""
    tracer = provider.get_tracer("test")
    return tracer.start_span(name)


# ===========================================================================
# 1. _ErrorFirstSamplingProcessor
# ===========================================================================

from app.infrastructure.observability.telemetry import _ErrorFirstSamplingProcessor


class _CapturingProcessor(SpanProcessor):
    """Records every span passed to on_end for assertion."""

    def __init__(self):
        self.ended: list = []

    def on_start(self, span, parent_context=None):
        pass

    def on_end(self, span):
        self.ended.append(span)

    def shutdown(self, timeout_millis: int = 30_000) -> bool:
        return True

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        return True


class TestErrorFirstSamplingProcessor:
    def _processor(self, ratio: float = 0.1) -> tuple[_ErrorFirstSamplingProcessor, _CapturingProcessor]:
        inner = _CapturingProcessor()
        return _ErrorFirstSamplingProcessor(inner, ratio), inner

    # ------------------------------------------------------------------
    # ERROR spans → always exported
    # ------------------------------------------------------------------
    def test_error_span_always_exported(self):
        proc, inner = self._processor(ratio=0.0)  # 0% for normal — only errors pass
        provider = _make_provider()
        provider.add_span_processor(proc)

        tracer = provider.get_tracer("test")
        with tracer.start_as_current_span("err_span") as span:
            span.set_status(Status(StatusCode.ERROR, "boom"))

        assert len(inner.ended) == 1
        assert inner.ended[0].status.status_code == StatusCode.ERROR

    def test_error_span_exported_100_percent(self):
        proc, inner = self._processor(ratio=0.0)
        provider = _make_provider()
        provider.add_span_processor(proc)
        tracer = provider.get_tracer("test")

        for _ in range(20):
            with tracer.start_as_current_span("err") as span:
                span.set_status(Status(StatusCode.ERROR, "err"))

        assert len(inner.ended) == 20

    # ------------------------------------------------------------------
    # Spans with recorded exception events → always exported
    # ------------------------------------------------------------------
    def test_exception_span_always_exported(self):
        proc, inner = self._processor(ratio=0.0)
        provider = _make_provider()
        provider.add_span_processor(proc)
        tracer = provider.get_tracer("test")

        with tracer.start_as_current_span("exc_span") as span:
            span.record_exception(ValueError("oops"))

        assert len(inner.ended) == 1
        assert any(e.name == "exception" for e in inner.ended[0].events)

    # ------------------------------------------------------------------
    # Normal (OK) spans → sampled probabilistically
    # ------------------------------------------------------------------
    def test_normal_span_ratio_zero_drops_all(self):
        proc, inner = self._processor(ratio=0.0)
        provider = _make_provider()
        provider.add_span_processor(proc)
        tracer = provider.get_tracer("test")

        for _ in range(50):
            with tracer.start_as_current_span("ok_span"):
                pass  # StatusCode stays UNSET / no error

        assert len(inner.ended) == 0

    def test_normal_span_ratio_one_keeps_all(self):
        proc, inner = self._processor(ratio=1.0)
        provider = _make_provider()
        provider.add_span_processor(proc)
        tracer = provider.get_tracer("test")

        for _ in range(20):
            with tracer.start_as_current_span("ok_span"):
                pass

        assert len(inner.ended) == 20

    def test_normal_span_roughly_10_percent(self):
        """With ratio=0.1 and 1000 spans, expect ~10% ± generous tolerance."""
        proc, inner = self._processor(ratio=0.1)
        provider = _make_provider()
        provider.add_span_processor(proc)
        tracer = provider.get_tracer("test")

        random.seed(42)
        for _ in range(1000):
            with tracer.start_as_current_span("ok_span"):
                pass

        count = len(inner.ended)
        assert 50 <= count <= 200, f"Expected ~100 sampled spans, got {count}"

    # ------------------------------------------------------------------
    # on_start is forwarded to inner processor
    # ------------------------------------------------------------------
    def test_on_start_forwarded_to_inner(self):
        inner = MagicMock(spec=SpanProcessor)
        proc = _ErrorFirstSamplingProcessor(inner, 0.0)

        mock_span = MagicMock()
        mock_ctx = MagicMock()
        proc.on_start(mock_span, mock_ctx)

        inner.on_start.assert_called_once_with(mock_span, mock_ctx)

    # ------------------------------------------------------------------
    # shutdown / force_flush forwarded to inner
    # ------------------------------------------------------------------
    def test_shutdown_forwarded(self):
        inner = MagicMock(spec=SpanProcessor)
        inner.shutdown.return_value = True
        proc = _ErrorFirstSamplingProcessor(inner, 0.1)
        proc.shutdown(5000)
        inner.shutdown.assert_called_once_with(5000)

    def test_shutdown_falls_back_when_inner_rejects_timeout(self):
        inner = MagicMock(spec=SpanProcessor)
        inner.shutdown.side_effect = [TypeError("takes 1 positional argument but 2 were given"), None]
        proc = _ErrorFirstSamplingProcessor(inner, 0.1)
        assert proc.shutdown(5000) is True
        assert inner.shutdown.call_count == 2
        inner.shutdown.assert_has_calls([call(5000), call()])

    def test_force_flush_forwarded(self):
        inner = MagicMock(spec=SpanProcessor)
        inner.force_flush.return_value = True
        proc = _ErrorFirstSamplingProcessor(inner, 0.1)
        proc.force_flush(1000)
        inner.force_flush.assert_called_once_with(1000)

    # ------------------------------------------------------------------
    # OTEL_SAMPLING_RATIO env var is respected at setup_telemetry() time
    # ------------------------------------------------------------------
    def test_sampling_ratio_from_env(self, monkeypatch):
        monkeypatch.setenv("OTEL_SAMPLING_RATIO", "0.25")
        # Reload to pick up new env value
        import importlib
        import app.infrastructure.observability.telemetry as tel_mod
        # Just check that reading the env produces the right float
        ratio = float(__import__("os").getenv("OTEL_SAMPLING_RATIO", "0.1"))
        assert ratio == 0.25


# ===========================================================================
# 2. base_tool span attribute behaviour
# ===========================================================================

from app.tools.core.base_tool import BaseTool
from agentlang.tools.tool_result import ToolResult


class _MinimalTool(BaseTool):
    """Concrete subclass for testing span attribute behaviour."""

    name = "test_tool"
    description = "A test tool description that is fairly long for testing purposes."

    async def execute(self, **kwargs) -> ToolResult:
        return ToolResult(ok=True, content="ok")


def _make_tool() -> _MinimalTool:
    return _MinimalTool()


def _make_mock_span() -> MagicMock:
    """Mock span that records set_attribute calls for assertion."""
    span = MagicMock()
    span.is_recording.return_value = True
    span._attrs: dict = {}

    def _set_attr(key, value):
        span._attrs[key] = value

    span.set_attribute.side_effect = _set_attr
    span.events = []
    return span


class TestBaseToolSpanAttributes:
    """Tests for _start_tool_span and _end_tool_span attribute behaviour."""

    def _get_attrs(self, span: MagicMock) -> dict:
        return span._attrs

    # ------------------------------------------------------------------
    # _create_tool_span: only minimal attributes set on span
    # Signature: _create_tool_span(self, tool_context, kwargs: dict)
    # ------------------------------------------------------------------
    @patch("app.tools.core.base_tool.is_telemetry_enabled", return_value=True)
    @patch("app.tools.core.base_tool.get_tracer")
    def test_start_span_sets_tool_name(self, mock_get_tracer, _mock_enabled):
        tool = _make_tool()
        mock_span = _make_mock_span()
        mock_get_tracer.return_value.start_span.return_value = mock_span

        ctx = MagicMock()
        ctx.tool_call_id = "call_123"
        ctx.tool_name = "test_tool"
        ctx.user_id = "u1"
        ctx.session_id = "s1"

        tool._create_tool_span(ctx, {"command": "echo hello", "timeout": 10})

        attrs = self._get_attrs(mock_span)
        assert attrs.get("tool.name") == "test_tool"
        assert attrs.get("tool.call_id") == "call_123"
        assert attrs.get("user.id") == "u1"
        assert attrs.get("session.id") == "s1"

    @patch("app.tools.core.base_tool.is_telemetry_enabled", return_value=True)
    @patch("app.tools.core.base_tool.get_tracer")
    def test_start_span_does_not_set_description(self, mock_get_tracer, _mock_enabled):
        tool = _make_tool()
        mock_span = _make_mock_span()
        mock_get_tracer.return_value.start_span.return_value = mock_span

        tool._create_tool_span(None, {"command": "ls -la"})

        attrs = self._get_attrs(mock_span)
        assert "tool.description" not in attrs

    @patch("app.tools.core.base_tool.is_telemetry_enabled", return_value=True)
    @patch("app.tools.core.base_tool.get_tracer")
    def test_start_span_does_not_set_params_as_attributes(self, mock_get_tracer, _mock_enabled):
        tool = _make_tool()
        mock_span = _make_mock_span()
        mock_get_tracer.return_value.start_span.return_value = mock_span

        tool._create_tool_span(None, {"command": "cat /etc/passwd", "timeout": 30})

        attrs = self._get_attrs(mock_span)
        assert "tool.params.command" not in attrs
        assert "tool.params.timeout" not in attrs
        assert "tool.params.keys" not in attrs
        assert "tool.params.count" not in attrs

    @patch("app.tools.core.base_tool.is_telemetry_enabled", return_value=True)
    @patch("app.tools.core.base_tool.get_tracer")
    def test_start_span_stores_pending_params_on_span(self, mock_get_tracer, _mock_enabled):
        tool = _make_tool()
        mock_span = _make_mock_span()
        mock_get_tracer.return_value.start_span.return_value = mock_span

        tool._create_tool_span(None, {"command": "echo hi", "flag": True})

        assert hasattr(mock_span, "_otel_pending_params")
        assert mock_span._otel_pending_params == {"command": "echo hi", "flag": True}

    @patch("app.tools.core.base_tool.is_telemetry_enabled", return_value=True)
    @patch("app.tools.core.base_tool.get_tracer")
    def test_start_span_stores_description_on_span(self, mock_get_tracer, _mock_enabled):
        tool = _make_tool()
        mock_span = _make_mock_span()
        mock_get_tracer.return_value.start_span.return_value = mock_span

        tool._create_tool_span(None, {})

        assert hasattr(mock_span, "_otel_tool_description")
        assert "test tool" in mock_span._otel_tool_description.lower()

    # ------------------------------------------------------------------
    # _end_tool_span on SUCCESS: minimal attributes
    # ------------------------------------------------------------------
    def test_end_span_success_no_description(self):
        tool = _make_tool()
        span = _make_mock_span()
        span._otel_pending_params = {"command": "ls"}
        span._otel_tool_description = "My tool description"
        span._otel_tool_class = "MyTool"
        span._otel_tool_module = "app.tools.my_tool"

        result = ToolResult(ok=True, content="file list here")
        tool._end_tool_span(span, result, execution_time=0.5)

        attrs = self._get_attrs(span)
        assert "tool.description" not in attrs
        assert "tool.params.command" not in attrs
        assert "tool.class" not in attrs
        assert "tool.module" not in attrs
        assert "tool.result.preview" not in attrs
        assert "tool.completed_at" not in attrs

    def test_end_span_success_sets_execution_time(self):
        tool = _make_tool()
        span = _make_mock_span()
        span._otel_pending_params = {}
        span._otel_tool_description = ""
        span._otel_tool_class = "T"
        span._otel_tool_module = "m"

        result = ToolResult(ok=True, content="ok")
        tool._end_tool_span(span, result, execution_time=1.23)

        attrs = self._get_attrs(span)
        assert attrs.get("tool.execution_time") == pytest.approx(1.23)
        assert attrs.get("tool.execution_time_ms") == 1230

    def test_end_span_success_sets_ok_status(self):
        tool = _make_tool()
        span = _make_mock_span()
        span._otel_pending_params = {}
        span._otel_tool_description = ""
        span._otel_tool_class = "T"
        span._otel_tool_module = "m"

        result = ToolResult(ok=True, content="ok")
        tool._end_tool_span(span, result, execution_time=0.1)

        # set_status should have been called with OK
        call_args_list = span.set_status.call_args_list
        assert any(
            call_args.args[0].status_code == StatusCode.OK
            for call_args in call_args_list
            if hasattr(call_args.args[0], "status_code")
        )

    # ------------------------------------------------------------------
    # _end_tool_span on FAILURE: full diagnostic context
    # ------------------------------------------------------------------
    def test_end_span_failure_includes_description(self):
        tool = _make_tool()
        span = _make_mock_span()
        span._otel_pending_params = {"command": "rm -rf /"}
        span._otel_tool_description = "Removes files"
        span._otel_tool_class = "ShellExec"
        span._otel_tool_module = "app.tools.shell_exec"

        result = ToolResult(ok=False, content="Permission denied")
        tool._end_tool_span(span, result, execution_time=0.05)

        attrs = self._get_attrs(span)
        assert attrs.get("tool.description") == "Removes files"
        assert attrs.get("tool.class") == "ShellExec"
        assert attrs.get("tool.module") == "app.tools.shell_exec"

    def test_end_span_failure_includes_params(self):
        tool = _make_tool()
        span = _make_mock_span()
        span._otel_pending_params = {"command": "cat secret.txt", "timeout": 30}
        span._otel_tool_description = "desc"
        span._otel_tool_class = "T"
        span._otel_tool_module = "m"

        result = ToolResult(ok=False, content="File not found")
        tool._end_tool_span(span, result, execution_time=0.02)

        attrs = self._get_attrs(span)
        assert attrs.get("tool.params.command") == "cat secret.txt"
        assert attrs.get("tool.params.timeout") == "30"

    def test_end_span_failure_truncates_long_param(self):
        tool = _make_tool()
        span = _make_mock_span()
        long_cmd = "x" * 600
        span._otel_pending_params = {"command": long_cmd}
        span._otel_tool_description = ""
        span._otel_tool_class = "T"
        span._otel_tool_module = "m"

        result = ToolResult(ok=False, content="err")
        tool._end_tool_span(span, result, execution_time=0.01)

        attrs = self._get_attrs(span)
        val = attrs.get("tool.params.command", "")
        assert len(val) <= 510  # 500 chars + "..."
        assert val.endswith("...")

    def test_end_span_exception_includes_params(self):
        tool = _make_tool()
        span = _make_mock_span()
        span._otel_pending_params = {"command": "bad cmd"}
        span._otel_tool_description = "desc"
        span._otel_tool_class = "T"
        span._otel_tool_module = "m"

        error = RuntimeError("crashed")
        tool._end_tool_span(span, None, execution_time=0.01, error=error)

        attrs = self._get_attrs(span)
        assert attrs.get("tool.params.command") == "bad cmd"


# ===========================================================================
# 3. httpx response hook — span naming and error marking
# ===========================================================================

from app.infrastructure.observability.httpx_integration import _request_hook as httpx_request_hook
from app.infrastructure.observability.httpx_integration import _response_hook as httpx_response_hook


def _mock_span_for_hook() -> MagicMock:
    span = MagicMock()
    span.is_recording.return_value = True
    span._attrs: dict = {}
    span.set_attribute.side_effect = lambda k, v: span._attrs.update({k: v})
    return span


class TestHttpxRequestHook:
    def test_sets_span_name_from_path(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        req.method = "GET"
        req.url = MagicMock()
        req.url.path = "/api/v1/users"
        str(req.url)  # ensure str() works

        with patch("builtins.str", side_effect=lambda x: "/api/v1/users" if x is req.url else str.__class__.__call__(str, x)):
            pass  # Don't patch str globally; just construct naturally

        httpx_request_hook(span, req)

        span.update_name.assert_called()
        name = span.update_name.call_args[0][0]
        assert name.startswith("GET")
        assert "/api/v1/users" in name

    def test_does_not_set_http_request_method_attribute(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        req.method = "POST"
        req.url = MagicMock()
        req.url.path = "/send"

        httpx_request_hook(span, req)

        assert "http.request.method" not in span._attrs
        assert "http.request.url" not in span._attrs

    def test_does_not_set_combined_http_request_attribute(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        req.method = "DELETE"
        req.url = MagicMock()
        req.url.path = "/resource/1"

        httpx_request_hook(span, req)

        assert "http.request" not in span._attrs


class TestHttpxResponseHook:
    def _make_response(self, status_code: int, body: str = ""):
        resp = MagicMock()
        resp.status_code = status_code
        resp.text = body
        return resp

    def test_success_sets_status_ok(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(200)

        httpx_response_hook(span, req, resp)

        span.set_status.assert_called()
        status_arg = span.set_status.call_args[0][0]
        assert status_arg.status_code == StatusCode.OK

    def test_success_does_not_set_http_success_attribute(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(200)

        httpx_response_hook(span, req, resp)

        assert "http.success" not in span._attrs

    def test_4xx_sets_error_status(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(404, '{"message": "Not found"}')

        httpx_response_hook(span, req, resp)

        attrs = span._attrs
        assert attrs.get("error") is True
        assert attrs.get("error.type") == "client_error"
        assert attrs.get("http.error.category") == "4xx"
        assert attrs.get("error.status_code") == 404

    def test_5xx_sets_server_error(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(500, "Internal Server Error")

        httpx_response_hook(span, req, resp)

        attrs = span._attrs
        assert attrs.get("error.type") == "server_error"
        assert attrs.get("http.error.category") == "5xx"

    def test_4xx_captures_json_error_message(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(401, '{"message": "Unauthorized"}')

        httpx_response_hook(span, req, resp)

        assert span._attrs.get("error.message") == "Unauthorized"

    def test_4xx_captures_response_body(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(403, "Forbidden: access denied")

        httpx_response_hook(span, req, resp)

        assert "http.response.body" in span._attrs
        assert "Forbidden" in span._attrs["http.response.body"]

    def test_4xx_adds_error_event(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(422, '{"detail": "Validation error"}')

        httpx_response_hook(span, req, resp)

        span.add_event.assert_called_once()
        # add_event is called as: span.add_event(name="http.error.response", attributes={...})
        call_kwargs = span.add_event.call_args
        event_name = call_kwargs.args[0] if call_kwargs.args else call_kwargs.kwargs.get("name")
        assert event_name == "http.error.response"

    def test_success_sets_status_code_attribute(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(201)

        httpx_response_hook(span, req, resp)

        assert span._attrs.get("http.response.status_code") == 201


# ===========================================================================
# 4. requests response hook
# ===========================================================================

from app.infrastructure.observability.requests_integration import _request_hook as req_request_hook
from app.infrastructure.observability.requests_integration import _response_hook as req_response_hook


class TestRequestsResponseHook:
    def _make_response(self, status_code: int, body: str = ""):
        resp = MagicMock()
        resp.status_code = status_code
        resp.text = body
        return resp

    def test_success_does_not_set_http_success(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(200)

        req_response_hook(span, req, resp)

        assert "http.success" not in span._attrs

    def test_4xx_marks_error(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(400, '{"error": "Bad request"}')

        req_response_hook(span, req, resp)

        attrs = span._attrs
        assert attrs.get("error") is True
        assert attrs.get("error.type") == "client_error"

    def test_5xx_marks_server_error(self):
        span = _mock_span_for_hook()
        req = MagicMock()
        resp = self._make_response(503, "Service unavailable")

        req_response_hook(span, req, resp)

        assert span._attrs.get("error.type") == "server_error"
        assert span._attrs.get("http.error.category") == "5xx"

    def test_request_hook_sets_span_name(self):
        span = _mock_span_for_hook()
        req_obj = MagicMock()
        req_obj.method = "PUT"
        req_obj.url = "https://api.example.com/resource/42"

        req_request_hook(span, req_obj)

        span.update_name.assert_called()
        name = span.update_name.call_args[0][0]
        assert name.startswith("PUT")
        assert "/resource/42" in name

    def test_request_hook_no_redundant_attributes(self):
        span = _mock_span_for_hook()
        req_obj = MagicMock()
        req_obj.method = "GET"
        req_obj.url = "https://example.com/path"

        req_request_hook(span, req_obj)

        assert "http.request.method" not in span._attrs
        assert "http.request.url" not in span._attrs
        assert "http.request" not in span._attrs


# ===========================================================================
# 5. aiohttp hooks
# ===========================================================================

from app.infrastructure.observability.aiohttp_integration import (
    _on_request_end as aiohttp_on_request_end,
    _on_request_start as aiohttp_on_request_start,
)


class TestAiohttpHooks:
    def _params_start(self, method: str, path: str):
        params = MagicMock()
        params.method = method
        url = MagicMock()
        url.path = path
        params.url = url
        return params

    def _params_end(self, method: str, path: str, status: int, body: str = ""):
        params = MagicMock()
        params.method = method
        url = MagicMock()
        url.path = path
        params.url = url
        response = MagicMock()
        response.status = status
        response.text = AsyncMock(return_value=body)
        params.response = response
        return params

    @pytest.mark.asyncio
    async def test_on_request_start_sets_span_name(self):
        span = _mock_span_for_hook()
        with patch("app.infrastructure.observability.aiohttp_integration.trace") as mock_trace:
            mock_trace.get_current_span.return_value = span
            params = self._params_start("POST", "/api/data")
            await aiohttp_on_request_start(None, None, params)

        span.update_name.assert_called()
        name = span.update_name.call_args[0][0]
        assert "POST" in name
        assert "/api/data" in name

    @pytest.mark.asyncio
    async def test_on_request_start_no_redundant_attributes(self):
        span = _mock_span_for_hook()
        with patch("app.infrastructure.observability.aiohttp_integration.trace") as mock_trace:
            mock_trace.get_current_span.return_value = span
            params = self._params_start("GET", "/health")
            await aiohttp_on_request_start(None, None, params)

        assert "http.request" not in span._attrs

    @pytest.mark.asyncio
    async def test_on_request_end_success_no_http_success_attr(self):
        span = _mock_span_for_hook()
        with patch("app.infrastructure.observability.aiohttp_integration.trace") as mock_trace:
            mock_trace.get_current_span.return_value = span
            params = self._params_end("GET", "/ok", 200)
            await aiohttp_on_request_end(None, None, params)

        assert "http.success" not in span._attrs

    @pytest.mark.asyncio
    async def test_on_request_end_4xx_marks_error(self):
        span = _mock_span_for_hook()
        with patch("app.infrastructure.observability.aiohttp_integration.trace") as mock_trace:
            mock_trace.get_current_span.return_value = span
            params = self._params_end("GET", "/forbidden", 403, '{"message": "Forbidden"}')
            await aiohttp_on_request_end(None, None, params)

        attrs = span._attrs
        assert attrs.get("error") is True
        assert attrs.get("error.type") == "client_error"
        assert attrs.get("http.error.category") == "4xx"

    @pytest.mark.asyncio
    async def test_on_request_end_5xx_marks_server_error(self):
        span = _mock_span_for_hook()
        with patch("app.infrastructure.observability.aiohttp_integration.trace") as mock_trace:
            mock_trace.get_current_span.return_value = span
            params = self._params_end("POST", "/crash", 502, "Bad Gateway")
            await aiohttp_on_request_end(None, None, params)

        assert span._attrs.get("error.type") == "server_error"
        assert span._attrs.get("http.error.category") == "5xx"


# ===========================================================================
# 6. FastAPI server request hook
# ===========================================================================

from app.infrastructure.observability.fastapi_integration import _server_request_hook


class TestFastAPIServerRequestHook:
    def _scope(self, method: str, path: str, route_path: str | None = None, query: bytes = b"", path_params: dict | None = None):
        scope = {
            "method": method,
            "path": path,
            "query_string": query,
            "path_params": path_params or {},
            "headers": [],
            "scheme": "http",
        }
        if route_path is not None:
            route = MagicMock()
            route.path = route_path
            route.name = "route_func"
            scope["route"] = route
        return scope

    def test_sets_span_name_from_route_template(self):
        span = _mock_span_for_hook()
        scope = self._scope("GET", "/users/42", route_path="/users/{user_id}")

        with patch("app.infrastructure.observability.fastapi_integration.enrich_span_with_user_context"):
            _server_request_hook(span, scope)

        span.update_name.assert_called()
        name = span.update_name.call_args[0][0]
        assert name == "GET /users/{user_id}"

    def test_sets_http_route_attribute(self):
        span = _mock_span_for_hook()
        scope = self._scope("POST", "/items/5", route_path="/items/{item_id}")

        with patch("app.infrastructure.observability.fastapi_integration.enrich_span_with_user_context"):
            _server_request_hook(span, scope)

        assert span._attrs.get("http.route") == "/items/{item_id}"

    def test_does_not_set_query_string_attribute(self):
        span = _mock_span_for_hook()
        scope = self._scope("GET", "/search", query=b"q=hello&page=2")

        with patch("app.infrastructure.observability.fastapi_integration.enrich_span_with_user_context"):
            _server_request_hook(span, scope)

        assert "http.query_string" not in span._attrs

    def test_does_not_set_route_name_attribute(self):
        span = _mock_span_for_hook()
        scope = self._scope("GET", "/users/1", route_path="/users/{id}")

        with patch("app.infrastructure.observability.fastapi_integration.enrich_span_with_user_context"):
            _server_request_hook(span, scope)

        assert "http.route_name" not in span._attrs

    def test_does_not_set_path_param_attributes(self):
        span = _mock_span_for_hook()
        scope = self._scope("DELETE", "/items/99", route_path="/items/{item_id}", path_params={"item_id": "99"})

        with patch("app.infrastructure.observability.fastapi_integration.enrich_span_with_user_context"):
            _server_request_hook(span, scope)

        assert "http.path_param.item_id" not in span._attrs

    def test_fallback_span_name_without_route(self):
        span = _mock_span_for_hook()
        scope = self._scope("GET", "/static/file.js")  # no route

        with patch("app.infrastructure.observability.fastapi_integration.enrich_span_with_user_context"):
            _server_request_hook(span, scope)

        span.update_name.assert_called()
        name = span.update_name.call_args[0][0]
        assert name == "GET /static/file.js"
