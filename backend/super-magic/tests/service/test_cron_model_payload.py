import pytest

from app.service.cron.models import (
    CronJob,
    CronPayload,
    CronSchedule,
    PayloadKind,
    ScheduleKind,
)
from app.service.cron.store import _parse_job_file, build_job_md
from app.utils.async_file_utils import async_write_text


@pytest.mark.asyncio
async def test_cron_job_payload_keeps_text_image_and_video_models(tmp_path):
    job = CronJob(
        id="mock-job",
        schedule=CronSchedule(kind=ScheduleKind.EVERY, every_ms=60_000),
        payload=CronPayload(
            kind=PayloadKind.AGENT_TURN,
            agent_name="mock-agent",
            model_id="mock-text-model",
            image_model_id="mock-image-model",
            video_model_id="mock-video-model",
            agent_id="mock-task-1",
            timeout_seconds=30,
        ),
        body="Run a mock scheduled task.",
        enabled=True,
        name="mock scheduled task",
        timezone="UTC",
    )
    job_md = build_job_md(job)
    job_path = tmp_path / "mock-job.md"
    await async_write_text(job_path, job_md)

    job = await _parse_job_file(job_path, "mock-job", 0)

    assert job is not None
    assert job.payload.model_id == "mock-text-model"
    assert job.payload.image_model_id == "mock-image-model"
    assert job.payload.video_model_id == "mock-video-model"
    assert job.payload.agent_id == "mock-task-1"
    assert job.payload.fork is False
    assert "video_generation_config" not in job_md
