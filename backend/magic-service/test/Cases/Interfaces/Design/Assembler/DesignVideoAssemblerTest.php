<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Interfaces\Design\Assembler;

use App\Domain\Design\Entity\DesignGenerationTaskEntity;
use App\Domain\Design\Entity\ValueObject\DesignGenerationAssetType;
use App\Domain\Design\Entity\ValueObject\DesignGenerationStatus;
use App\Domain\Design\Entity\ValueObject\DesignGenerationType;
use App\Interfaces\Design\Assembler\DesignVideoAssembler;
use DateTime;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class DesignVideoAssemblerTest extends TestCase
{
    public function testVideoGenerationDtoIncludesRecordExtensions(): void
    {
        $entity = $this->createCompletedVideoTask();

        $result = DesignVideoAssembler::toDTO($entity)->toArray();

        $this->assertArrayHasKey('billing', $result);
        $this->assertArrayHasKey('generation_info', $result);
        $this->assertArrayHasKey('runtime', $result);
        $this->assertSame([
            'points' => null,
        ], $result['billing']);
        $this->assertSame([
            'task' => 'generate',
            'input_mode' => 'standard',
            'aspect_ratio' => '16:9',
            'resolution' => '720p',
            'duration_seconds' => 5,
        ], $result['generation_info']);
        $this->assertSame([
            'started_at' => '2026-06-25 11:49:50',
            'finished_at' => '2026-06-25 11:52:30',
            'elapsed_seconds' => 160,
        ], $result['runtime']);
        $this->assertArrayNotHasKey('generation_mode', $result['generation_info']);
        $this->assertArrayNotHasKey('input_materials', $result);
    }

    private function createCompletedVideoTask(): DesignGenerationTaskEntity
    {
        $entity = new DesignGenerationTaskEntity();
        $entity->setId(1001);
        $entity->setOrganizationCode('org');
        $entity->setUserId('user-1');
        $entity->setProjectId(123);
        $entity->setGenerationId('video-1');
        $entity->setAssetType(DesignGenerationAssetType::VIDEO);
        $entity->setGenerationType(DesignGenerationType::TEXT_TO_VIDEO);
        $entity->setModelId('video-model');
        $entity->setPrompt('生成小猫在游泳');
        $entity->setFileDir('/videos');
        $entity->setFileName('cat.mp4');
        $entity->setInputPayload([]);
        $entity->setRequestPayload([
            'task' => 'generate',
            'input_mode' => 'standard',
            'generation' => [
                'mode' => 'fast',
                'aspect_ratio' => '16:9',
                'resolution' => '720p',
                'duration_seconds' => 5,
            ],
        ]);
        $entity->setProviderPayload([
            'submitted_at' => '2026-06-25T11:49:50+08:00',
        ]);
        $entity->setOutputPayload([]);
        $entity->setStatus(DesignGenerationStatus::COMPLETED);
        $entity->setErrorMessage(null);
        $entity->setCreatedAt(new DateTime('2026-06-25 11:49:48'));
        $entity->setUpdatedAt(new DateTime('2026-06-25 11:52:30'));

        return $entity;
    }
}
