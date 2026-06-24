<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use App\Infrastructure\Util\Concurrency\ConcurrencyLease;
use App\Infrastructure\Util\Concurrency\RedisConcurrencyLimiter;
use Hyperf\Contract\ConfigInterface;

readonly class DesignImageOperationConcurrencyService
{
    private const POOL_NAME = 'design:image-operation:running:eraser-expand';

    private const int SLOT_TTL_SECONDS = 600;

    public function __construct(
        private RedisConcurrencyLimiter $limiter,
        private ConfigInterface $config,
    ) {
    }

    public function supports(ImageGenerationEntity $entity): bool
    {
        return in_array($entity->getType(), [ImageGenerationType::ERASER, ImageGenerationType::EXPAND], true);
    }

    public function tryAcquire(ImageGenerationEntity $entity): ConcurrencyLease
    {
        return $this->limiter->tryAcquire(
            self::POOL_NAME,
            (string) $entity->getId(),
            $this->maxConcurrency(),
            self::SLOT_TTL_SECONDS
        );
    }

    public function release(ConcurrencyLease $lease): bool
    {
        return $this->limiter->release($lease, self::POOL_NAME);
    }

    private function maxConcurrency(): int
    {
        return (int) $this->config->get('design_generation.image_operation.max_concurrency', 2);
    }
}
