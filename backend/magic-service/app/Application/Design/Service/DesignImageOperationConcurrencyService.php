<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Entity\ValueObject\ProviderDataIsolation;
use App\Domain\Provider\Service\AiAbilityDomainService;
use App\Infrastructure\Util\Concurrency\ConcurrencyLease;
use App\Infrastructure\Util\Concurrency\RedisConcurrencyLimiter;

readonly class DesignImageOperationConcurrencyService
{
    private const POOL_NAME_PREFIX = 'design:image-operation:running:';

    private const int SLOT_TTL_SECONDS = 60;

    public function __construct(
        private RedisConcurrencyLimiter $limiter,
        private AiAbilityDomainService $aiAbilityDomainService,
    ) {
    }

    public function supports(ImageGenerationEntity $entity): bool
    {
        return in_array($entity->getType(), [ImageGenerationType::ERASER, ImageGenerationType::EXPAND], true);
    }

    public function tryAcquire(ImageGenerationEntity $entity): ConcurrencyLease
    {
        return $this->limiter->tryAcquire(
            $this->poolName($entity),
            (string) $entity->getId(),
            $this->maxConcurrency($entity),
            self::SLOT_TTL_SECONDS
        );
    }

    public function release(ConcurrencyLease $lease): bool
    {
        return $this->limiter->release($lease);
    }

    private function maxConcurrency(ImageGenerationEntity $entity): int
    {
        $abilityCode = $this->resolveAbilityCode($entity);
        if ($abilityCode === null) {
            return 0;
        }

        // 并发数由 AI 能力管理配置维护；未配置 concurrent 时不做应用层并发限制。
        $ability = $this->aiAbilityDomainService->getByCode(ProviderDataIsolation::create('')->disabled(), $abilityCode);
        $config = $ability?->getConfig() ?? [];
        $concurrent = $config['concurrent'] ?? null;
        if (is_string($concurrent)) {
            $concurrent = trim($concurrent);
        }
        if ($concurrent === null || $concurrent === '' || ! is_numeric($concurrent)) {
            return 0;
        }

        return max(0, (int) $concurrent);
    }

    private function poolName(ImageGenerationEntity $entity): string
    {
        $abilityCode = $this->resolveAbilityCode($entity);
        if ($abilityCode === null) {
            return self::POOL_NAME_PREFIX . 'unknown';
        }

        return self::POOL_NAME_PREFIX . $abilityCode->value;
    }

    private function resolveAbilityCode(ImageGenerationEntity $entity): ?AiAbilityCode
    {
        return match ($entity->getType()) {
            ImageGenerationType::ERASER => AiAbilityCode::ImageEraser,
            ImageGenerationType::EXPAND => AiAbilityCode::ImageExpand,
            default => null,
        };
    }
}
