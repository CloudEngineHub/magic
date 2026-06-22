<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\Volcengine;

use App\Infrastructure\ExternalAPI\Volcengine\DTO\SpeechRecognitionResultDTO;
use App\Infrastructure\ExternalAPI\Volcengine\ValueObject\VolcengineStatusCode;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class SpeechRecognitionResultDTOTest extends TestCase
{
    public function testFailedResultWithoutAudioInfoCanExposeVolcengineError(): void
    {
        $dto = new SpeechRecognitionResultDTO([
            'volcengine_log_id' => '2026062210060788E8E2F66A67BE11D2CA',
            'volcengine_status_code' => '45000151',
            'volcengine_message' => '[Invalid audio format] OperatorWrapper Process failed: invalid argument,audio convert failed',
        ]);

        $this->assertSame(0, $dto->getDuration());
        $this->assertSame(VolcengineStatusCode::INVALID_AUDIO_FORMAT, $dto->getVolcengineStatusCode());
        $this->assertSame('45000151', $dto->getVolcengineStatusCodeString());
        $this->assertSame(
            '[Invalid audio format] OperatorWrapper Process failed: invalid argument,audio convert failed',
            $dto->getVolcengineMessage()
        );
    }
}
