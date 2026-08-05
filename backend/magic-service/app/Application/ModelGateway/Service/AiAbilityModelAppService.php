<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\ModelGateway\Service;

use App\Application\Kernel\EnvManager;
use App\Application\ModelGateway\Mapper\ModelEntry;
use App\Application\ModelGateway\Mapper\ModelGatewayMapper;
use App\Application\Provider\Service\AiAbilityConfigAppService;
use App\Domain\ModelGateway\Entity\ValueObject\ModelGatewayDataIsolation;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\ErrorCode\ServiceProviderErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use Hyperf\Odin\Contract\Model\ModelInterface;
use Psr\Log\LoggerInterface;
use RuntimeException;

class AiAbilityModelAppService
{
    private const string AUTO_MODEL_ID = 'auto';

    public function __construct(
        private readonly AiAbilityConfigAppService $aiAbilityConfigAppService,
        private readonly ModelGatewayMapper $modelGatewayMapper,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function getChatModel(AiAbilityCode $abilityCode, string $organizationCode, string $userId): ModelInterface
    {
        try {
            $abilityConfig = $this->aiAbilityConfigAppService->getConfig($organizationCode, $abilityCode->value);
        } catch (RuntimeException) {
            ExceptionBuilder::throw(ServiceProviderErrorCode::AI_ABILITY_NOT_FOUND);
        }
        if (! ($abilityConfig['enabled'] ?? false)) {
            ExceptionBuilder::throw(ServiceProviderErrorCode::AI_ABILITY_DISABLED);
        }

        $configuredModelId = trim((string) ($abilityConfig['config']['model_id'] ?? ''));
        if ($configuredModelId !== '') {
            $selectionSource = 'ability';
            $logicalModelId = $configuredModelId;
            $modelEntry = $this->getModelEntry(
                $this->createUnrestrictedDataIsolation($organizationCode, $userId),
                $logicalModelId
            );
        } else {
            [$selectionSource, $logicalModelId, $modelEntry] = $this->resolveSubscriptionFallback(
                $organizationCode,
                $userId
            );
        }

        $resolvedModelId = trim($modelEntry->getAttributes()->getResolvedModelId());
        if ($resolvedModelId === '') {
            ExceptionBuilder::throw(ServiceProviderErrorCode::AI_ABILITY_MODEL_UNAVAILABLE);
        }

        $this->logger->info('AiAbilityModelResolved', [
            'ability_code' => $abilityCode->value,
            'selection_source' => $selectionSource,
            'logical_model_id' => $logicalModelId,
            'resolved_model_id' => $resolvedModelId,
            'organization_code' => $organizationCode,
            'user_id' => $userId,
        ]);

        return $this->modelGatewayMapper->getChatModelProxy(
            $this->createUnrestrictedDataIsolation($organizationCode, $userId),
            $resolvedModelId
        );
    }

    protected function createSubscriptionDataIsolation(string $organizationCode, string $userId): ModelGatewayDataIsolation
    {
        $dataIsolation = ModelGatewayDataIsolation::create($organizationCode, $userId);
        $dataIsolation->getSubscriptionManager()->setEnabled(true);
        EnvManager::initDataIsolationEnv($dataIsolation, force: true);
        return $dataIsolation;
    }

    protected function createUnrestrictedDataIsolation(string $organizationCode, string $userId): ModelGatewayDataIsolation
    {
        return ModelGatewayDataIsolation::createByOrganizationCodeWithoutSubscription($organizationCode, $userId);
    }

    private function getModelEntry(ModelGatewayDataIsolation $dataIsolation, string $logicalModelId): ModelEntry
    {
        $models = $this->modelGatewayMapper->getChatModels($dataIsolation, true);
        $modelEntry = $models[$logicalModelId] ?? null;
        if (! $modelEntry instanceof ModelEntry) {
            ExceptionBuilder::throw(ServiceProviderErrorCode::AI_ABILITY_MODEL_UNAVAILABLE);
        }
        return $modelEntry;
    }

    /**
     * @return array{string, string, ModelEntry}
     */
    private function resolveSubscriptionFallback(string $organizationCode, string $userId): array
    {
        $models = $this->modelGatewayMapper->getChatModels(
            $this->createSubscriptionDataIsolation($organizationCode, $userId),
            true
        );
        if ($models === []) {
            ExceptionBuilder::throw(ServiceProviderErrorCode::AI_ABILITY_MODEL_UNAVAILABLE);
        }

        if (($models[self::AUTO_MODEL_ID] ?? null) instanceof ModelEntry) {
            return ['subscription_auto', self::AUTO_MODEL_ID, $models[self::AUTO_MODEL_ID]];
        }

        $logicalModelId = array_key_first($models);
        $modelEntry = $logicalModelId === null ? null : $models[$logicalModelId];
        if (! $modelEntry instanceof ModelEntry) {
            ExceptionBuilder::throw(ServiceProviderErrorCode::AI_ABILITY_MODEL_UNAVAILABLE);
        }

        return ['subscription_first', (string) $logicalModelId, $modelEntry];
    }
}
