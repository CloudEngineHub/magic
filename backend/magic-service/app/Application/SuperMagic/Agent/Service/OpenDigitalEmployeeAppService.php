<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Service;

use App\Application\Contact\Service\MagicUserSettingAppService;
use App\Application\Kernel\EnvManager;
use App\Application\Mode\Service\ModeAppService;
use App\Application\ModelGateway\Mapper\ModelGatewayMapper;
use App\Domain\ModelGateway\Entity\ValueObject\ModelGatewayDataIsolation;
use App\ErrorCode\AgentErrorCode;
use App\ErrorCode\ModeErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use stdClass;

class OpenDigitalEmployeeAppService
{
    private const string DEFAULT_AGENT_CODE = 'general';

    public function __construct(
        private readonly SuperMagicAgentAppService $superMagicAgentAppService,
        private readonly ModeAppService $modeAppService,
        private readonly MagicUserSettingAppService $magicUserSettingAppService,
        private readonly ModelGatewayMapper $modelGatewayMapper,
    ) {
    }

    public function getSortList(MagicUserAuthorization $authorization): array
    {
        return $this->superMagicAgentAppService->sortListQueries($authorization);
    }

    public function getModels(MagicUserAuthorization $authorization, string $code): array
    {
        $agentCode = $this->resolveAccessibleAgentCode($authorization, $code);
        $mode = $this->resolveMode($authorization, $agentCode);
        $categories = $this->buildModelCategoryMap($mode['groups'] ?? []);

        $models = [];
        foreach ($mode['models'] ?? [] as $key => $model) {
            $modelData = is_object($model) && method_exists($model, 'toArray')
                ? $model->toArray()
                : (array) $model;
            $id = (string) ($modelData['id'] ?? $key);
            if ($id === '') {
                continue;
            }

            $modelData['model_category'] = $categories[$id] ?? 'llm';
            $models[$id] = $modelData;
        }

        return ['models' => $models];
    }

    public function getDefaultConfig(MagicUserAuthorization $authorization, string $code): array
    {
        $agentCode = $this->resolveAccessibleAgentCode($authorization, $code);
        $availableModelIds = $this->getAvailableModelIds($authorization);
        $agentConfig = $this->loadDefaultConfig($authorization, $agentCode);
        $agentCandidates = $this->getModeModelsByCategory(
            $this->resolveMode($authorization, $agentCode)
        );

        $generalConfig = $agentConfig;
        $generalCandidates = $agentCandidates;
        if ($agentCode !== self::DEFAULT_AGENT_CODE) {
            $generalConfig = $this->loadDefaultConfig($authorization, self::DEFAULT_AGENT_CODE);
            try {
                $generalCandidates = $this->getModeModelsByCategory(
                    $this->resolveMode($authorization, self::DEFAULT_AGENT_CODE)
                );
            } catch (BusinessException $exception) {
                if ($exception->getCode() !== ModeErrorCode::MODE_NOT_FOUND->value) {
                    throw $exception;
                }
                $generalCandidates = [];
            }
        }

        $model = $this->resolveDefaultModel(
            'llm',
            $agentConfig,
            $agentCandidates,
            $generalConfig,
            $generalCandidates,
            $availableModelIds['llm'] ?? [],
            true
        );
        if ($model === null) {
            ExceptionBuilder::throw(ModeErrorCode::MODE_NOT_FOUND, 'mode_not_found');
        }

        return [
            'model' => $model,
            'image_model' => $this->resolveDefaultModel(
                'image',
                $agentConfig,
                $agentCandidates,
                $generalConfig,
                $generalCandidates,
                $availableModelIds['image'] ?? [],
                true
            ) ?? new stdClass(),
            'video_model' => $this->resolveDefaultModel(
                'video',
                $agentConfig,
                $agentCandidates,
                $generalConfig,
                $generalCandidates,
                $availableModelIds['video'] ?? [],
                false
            ) ?? new stdClass(),
            'extra' => $agentConfig['extra'] ?? $generalConfig['extra'] ?? new stdClass(),
        ];
    }

    private function resolveAccessibleAgentCode(MagicUserAuthorization $authorization, string $code): string
    {
        $code = trim($code);
        $list = $this->getSortList($authorization);
        foreach (array_merge($list['frequent'] ?? [], $list['all'] ?? []) as $agent) {
            if (($agent['code'] ?? $agent['id'] ?? '') === $code) {
                return $code;
            }
        }

        ExceptionBuilder::throw(AgentErrorCode::AGENT_NOT_FOUND, 'agent_not_found');
    }

    private function resolveMode(MagicUserAuthorization $authorization, string $code): array
    {
        try {
            return $this->modeAppService->show($authorization, $code);
        } catch (BusinessException $exception) {
            if ($exception->getCode() !== ModeErrorCode::MODE_NOT_FOUND->value) {
                throw $exception;
            }

            if ($code === self::DEFAULT_AGENT_CODE) {
                ExceptionBuilder::throw(ModeErrorCode::MODE_NOT_FOUND, 'mode_not_found', throwable: $exception);
            }

            return $this->resolveMode($authorization, self::DEFAULT_AGENT_CODE);
        }
    }

    private function loadDefaultConfig(MagicUserAuthorization $authorization, string $code): array
    {
        $setting = $this->magicUserSettingAppService->getProjectTopicModelConfig(
            $authorization,
            'default_' . $code
        );

        return $setting?->getValue() ?? [];
    }

    /**
     * The task handler validates against ModelGatewayMapper, so use the same source
     * when deciding whether a model can be returned to an Open API caller.
     *
     * @return array<string, array<string, true>>
     */
    private function getAvailableModelIds(MagicUserAuthorization $authorization): array
    {
        $dataIsolation = ModelGatewayDataIsolation::create(
            $authorization->getOrganizationCode(),
            $authorization->getId()
        );
        EnvManager::initDataIsolationEnv($dataIsolation);

        return [
            'llm' => $this->toModelIdMap($this->modelGatewayMapper->getChatModels($dataIsolation, true)),
            'image' => $this->toModelIdMap($this->modelGatewayMapper->getImageModels($dataIsolation, true)),
            'video' => $this->toModelIdMap($this->modelGatewayMapper->getVideoModels($dataIsolation, true)),
        ];
    }

    /**
     * @param array<int, object> $models
     * @return array<string, true>
     */
    private function toModelIdMap(array $models): array
    {
        $modelIds = [];
        foreach ($models as $model) {
            if (method_exists($model, 'getKey')) {
                $modelIds[$model->getKey()] = true;
            }
        }

        return $modelIds;
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    private function getModeModelsByCategory(array $mode): array
    {
        $categories = $this->buildModelCategoryMap($mode['groups'] ?? []);
        $modelsByCategory = ['llm' => [], 'image' => [], 'video' => []];
        $position = 0;

        foreach ($mode['models'] ?? [] as $key => $model) {
            $modelData = is_object($model) && method_exists($model, 'toArray')
                ? $model->toArray()
                : (array) $model;
            $relationId = (string) ($modelData['id'] ?? $key);
            $category = $categories[$relationId] ?? 'llm';
            $modelId = (string) ($modelData['model_id'] ?? '');
            if (
                $modelId === ''
                || ($modelData['model_status'] ?? 'normal') !== 'normal'
                || ! isset($modelsByCategory[$category])
            ) {
                continue;
            }

            $modelData['_position'] = $position++;
            $modelsByCategory[$category][] = $modelData;
        }

        foreach ($modelsByCategory as &$models) {
            usort($models, static function (array $left, array $right): int {
                $sort = ((int) ($left['sort'] ?? 0)) <=> ((int) ($right['sort'] ?? 0));
                return $sort !== 0 ? $sort : $left['_position'] <=> $right['_position'];
            });
        }
        unset($models);

        return $modelsByCategory;
    }

    /**
     * @param array<string, mixed> $agentConfig
     * @param array<string, list<array<string, mixed>>> $agentCandidates
     * @param array<string, mixed> $generalConfig
     * @param array<string, list<array<string, mixed>>> $generalCandidates
     * @param array<string, true> $availableModelIds
     * @return null|array<string, string>
     */
    private function resolveDefaultModel(
        string $category,
        array $agentConfig,
        array $agentCandidates,
        array $generalConfig,
        array $generalCandidates,
        array $availableModelIds,
        bool $useFirstGeneralCandidate
    ): ?array {
        foreach ([[$agentConfig, $agentCandidates], [$generalConfig, $generalCandidates]] as [$config, $candidates]) {
            $configuredModelId = (string) (((array) ($config[$this->getConfigKey($category)] ?? []))['model_id'] ?? '');
            if ($configuredModelId === '') {
                continue;
            }

            foreach ($candidates[$category] ?? [] as $candidate) {
                if (($candidate['model_id'] ?? '') === $configuredModelId && isset($availableModelIds[$configuredModelId])) {
                    return $this->toDefaultConfigModel($candidate, $category);
                }
            }
        }

        if (! $useFirstGeneralCandidate) {
            return null;
        }

        foreach ($generalCandidates[$category] ?? [] as $candidate) {
            $modelId = (string) ($candidate['model_id'] ?? '');
            if (isset($availableModelIds[$modelId])) {
                return $this->toDefaultConfigModel($candidate, $category);
            }
        }

        return null;
    }

    private function getConfigKey(string $category): string
    {
        return [
            'llm' => 'model',
            'image' => 'image_model',
            'video' => 'video_model',
        ][$category] ?? 'model';
    }

    /**
     * @param array<string, mixed> $model
     * @return array<string, string>
     */
    private function toDefaultConfigModel(array $model, string $category): array
    {
        $config = [
            'model_id' => (string) $model['model_id'],
        ];
        if ($category === 'video') {
            return $config;
        }

        return array_merge($config, [
            'id' => (string) ($model['provider_model_id'] ?? ''),
            'name' => (string) ($model['model_name'] ?? ''),
            'icon' => (string) ($model['model_icon'] ?? ''),
        ]);
    }

    private function buildModelCategoryMap(array $groups): array
    {
        $categories = [];
        foreach ($groups as $group) {
            foreach ($group['model_ids'] ?? [] as $id) {
                $categories[(string) $id] = 'llm';
            }
            foreach ($group['image_model_ids'] ?? [] as $id) {
                $categories[(string) $id] = 'image';
            }
            foreach ($group['video_model_ids'] ?? [] as $id) {
                $categories[(string) $id] = 'video';
            }
        }

        return $categories;
    }
}
