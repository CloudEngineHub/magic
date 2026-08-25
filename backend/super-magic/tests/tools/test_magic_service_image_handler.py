from app.tools.media_generator.base import (
    GeneratedImage,
    ImageGenerationRequest,
)
from app.tools.media_generator.handlers import magic_service
from app.tools.media_generator.handlers.magic_service import MagicServiceHandler, _ImageApiPayload


async def test_magic_service_handler_generate_calls_single_api_method(monkeypatch):
    handler = MagicServiceHandler(api_base_url="https://magic.example.com/v2", access_key="ak-test")
    calls = []

    async def fake_call_api(payload):
        calls.append(("call_api", payload))
        return ["https://cdn.example.com/image.png"]

    async def fake_download_images(image_urls):
        calls.append(("download", image_urls))
        return [
            GeneratedImage(
                image_url=image_urls[0],
                temp_file_path="/tmp/image.png",
            )
        ]

    monkeypatch.setattr(handler, "_call_api", fake_call_api)
    monkeypatch.setattr(handler, "_download_images", fake_download_images)

    response = await handler.generate(
        ImageGenerationRequest(
            prompt="生成一张图",
            model="seedream",
            size="1024x1024",
            reference_image_urls=["https://cdn.example.com/ref.png"],
        )
    )

    assert calls == [
        (
            "call_api",
            _ImageApiPayload(
                model="seedream",
                prompt="生成一张图",
                images=["https://cdn.example.com/ref.png"],
                n=1,
                size="1024x1024",
            ),
        ),
        ("download", ["https://cdn.example.com/image.png"]),
    ]
    assert response.images[0].image_url == "https://cdn.example.com/image.png"


async def test_magic_service_handler_call_api_submits_task_and_polls(monkeypatch):
    handler = MagicServiceHandler(api_base_url="https://magic.example.com/v2", access_key="ak-test")
    handler._POLL_INTERVAL_SECONDS = 0
    calls = []

    class FakeResponse:
        def __init__(self, status, body):
            self.status = status
            self._body = body
            self.headers = {}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def json(self):
            return self._body

        async def text(self):
            return str(self._body)

    class FakeSession:
        def __init__(self):
            self.query_responses = [
                {"id": "IGT-test", "status": "running"},
                {
                    "id": "IGT-test",
                    "status": "succeeded",
                    "response": {
                        "created": 1778743200,
                        "data": [{"url": "https://cdn.example.com/image.png"}],
                    },
                },
            ]

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def post(self, url, json, headers, timeout):
            calls.append(("post", url, json, timeout))
            return FakeResponse(200, {"id": "IGT-test", "status": "running"})

        def get(self, url, headers, timeout):
            calls.append(("get", url, timeout))
            return FakeResponse(200, self.query_responses.pop(0))

    monkeypatch.setattr(magic_service.aiohttp, "ClientSession", FakeSession)

    image_urls = await handler._call_api(
        _ImageApiPayload(
            model="seedream",
            prompt="生成一张图",
            images=["https://cdn.example.com/ref.png"],
            n=1,
            size="1024x1024",
        )
    )

    assert image_urls == ["https://cdn.example.com/image.png"]
    assert calls == [
        (
            "post",
            "https://magic.example.com/v2/images/generation-tasks",
            {
                "model": "seedream",
                "prompt": "生成一张图",
                "images": ["https://cdn.example.com/ref.png"],
                "n": 1,
                "size": "1024x1024",
                "sequential_image_generation": "auto",
            },
            300,
        ),
        ("get", "https://magic.example.com/v2/images/generation-tasks/IGT-test", 300),
        ("get", "https://magic.example.com/v2/images/generation-tasks/IGT-test", 300),
    ]
