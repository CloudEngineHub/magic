<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Provider\Assembler;

use App\Application\Provider\DTO\ProviderModelGroupDTO;
use App\Application\Provider\DTO\ProviderModelProviderDTO;
use App\Application\Provider\DTO\ProviderModelQueryResultDTO;
use App\Application\Provider\DTO\ProviderModelRecordDTO;
use App\Domain\Provider\Entity\ProviderConfigEntity;
use App\Domain\Provider\Entity\ProviderEntity;
use App\Domain\Provider\Entity\ProviderModelEntity;
use App\Domain\Provider\Entity\ValueObject\Status;
use Hyperf\Contract\TranslatorInterface;

class AdminProviderModelAssembler
{
    /**
     * @param array{page: int, page_size: int, total: int, list: ProviderModelEntity[], provider_context: array{configs: array<int, ProviderConfigEntity>, providers: array<int, ProviderEntity>}} $result
     */
    public static function modelRecordsToArray(array $result): array
    {
        $resultDTO = self::toModelRecordQueryResultDTO($result);

        return [
            'page' => $resultDTO->page,
            'page_size' => $resultDTO->pageSize,
            'total' => $resultDTO->total,
            'list' => array_map(
                static fn (ProviderModelRecordDTO $record): array => self::modelRecordToArray($record),
                $resultDTO->list
            ),
        ];
    }

    /**
     * @param array{page: int, page_size: int, total: int, list: array<string, ProviderModelEntity[]>, provider_context: array{configs: array<int, ProviderConfigEntity>, providers: array<int, ProviderEntity>}} $result
     */
    public static function modelGroupsToArray(array $result): array
    {
        $resultDTO = self::toModelGroupQueryResultDTO($result);

        return [
            'page' => $resultDTO->page,
            'page_size' => $resultDTO->pageSize,
            'total' => $resultDTO->total,
            'list' => array_map(
                static fn (ProviderModelGroupDTO $group): array => self::modelGroupToArray($group),
                $resultDTO->list
            ),
        ];
    }

    /**
     * @param array{page: int, page_size: int, total: int, list: ProviderModelEntity[], provider_context: array{configs: array<int, ProviderConfigEntity>, providers: array<int, ProviderEntity>}} $result
     */
    private static function toModelRecordQueryResultDTO(array $result): ProviderModelQueryResultDTO
    {
        $providerContext = $result['provider_context'];
        $locale = di(TranslatorInterface::class)->getLocale();
        $list = [];
        foreach ($result['list'] as $model) {
            $list[] = new ProviderModelRecordDTO(
                id: (string) $model->getId(),
                modelId: $model->getModelId(),
                name: $model->getLocalizedName($locale),
                modelVersion: $model->getModelVersion(),
                category: $model->getCategory()?->value ?? '',
                modelType: $model->getModelType()->value,
                status: $model->getStatus()?->value ?? Status::Disabled->value,
                icon: $model->getIcon(),
                provider: self::buildProviderItem($model, $providerContext, $locale),
            );
        }

        return new ProviderModelQueryResultDTO(
            page: $result['page'],
            pageSize: $result['page_size'],
            total: $result['total'],
            list: $list,
        );
    }

    /**
     * @param array{page: int, page_size: int, total: int, list: array<string, ProviderModelEntity[]>, provider_context: array{configs: array<int, ProviderConfigEntity>, providers: array<int, ProviderEntity>}} $result
     */
    private static function toModelGroupQueryResultDTO(array $result): ProviderModelQueryResultDTO
    {
        $providerContext = $result['provider_context'];
        $locale = di(TranslatorInterface::class)->getLocale();
        $list = [];
        foreach ($result['list'] as $modelId => $groupModels) {
            if (empty($groupModels)) {
                continue;
            }

            $model = self::selectRepresentativeModel($groupModels);
            $providers = [];
            foreach ($groupModels as $groupModel) {
                $providers[] = self::buildProviderItem($groupModel, $providerContext, $locale, true);
            }

            $list[] = new ProviderModelGroupDTO(
                modelId: (string) $modelId,
                name: $model->getLocalizedName($locale),
                category: $model->getCategory()?->value ?? '',
                modelType: $model->getModelType()->value,
                icon: $model->getIcon(),
                providerCount: count($providers),
                providers: $providers,
            );
        }

        return new ProviderModelQueryResultDTO(
            page: $result['page'],
            pageSize: $result['page_size'],
            total: $result['total'],
            list: $list,
        );
    }

    private static function modelRecordToArray(ProviderModelRecordDTO $record): array
    {
        return [
            'id' => $record->id,
            'model_id' => $record->modelId,
            'name' => $record->name,
            'model_version' => $record->modelVersion,
            'category' => $record->category,
            'model_type' => $record->modelType,
            'status' => $record->status,
            'icon' => $record->icon,
            'provider' => self::providerToArray($record->provider),
        ];
    }

    private static function modelGroupToArray(ProviderModelGroupDTO $group): array
    {
        return [
            'model_id' => $group->modelId,
            'name' => $group->name,
            'category' => $group->category,
            'model_type' => $group->modelType,
            'icon' => $group->icon,
            'provider_count' => $group->providerCount,
            'providers' => array_map(
                static fn (ProviderModelProviderDTO $provider): array => self::providerToArray($provider, true),
                $group->providers
            ),
        ];
    }

    private static function providerToArray(ProviderModelProviderDTO $provider, bool $withModelRecord = false): array
    {
        $data = [
            'service_provider_config_id' => $provider->serviceProviderConfigId,
            'provider_code' => $provider->providerCode,
            'name' => $provider->name,
            'alias' => $provider->alias,
            'status' => $provider->status,
            'icon' => $provider->icon,
        ];

        if ($withModelRecord) {
            $data['model_record_id'] = $provider->modelRecordId ?? '';
            $data['model_status'] = $provider->modelStatus;
        }

        return $data;
    }

    /**
     * @param ProviderModelEntity[] $models
     */
    private static function selectRepresentativeModel(array $models): ProviderModelEntity
    {
        return $models[0];
    }

    /**
     * @param array{configs: array<int, ProviderConfigEntity>, providers: array<int, ProviderEntity>} $providerContext
     */
    private static function buildProviderItem(ProviderModelEntity $model, array $providerContext, string $locale, bool $withModelRecord = false): ProviderModelProviderDTO
    {
        $configId = $model->getServiceProviderConfigId();
        $config = $providerContext['configs'][$configId] ?? null;
        $provider = $providerContext['providers'][$configId] ?? null;
        $providerName = $config?->getTranslatedName($locale) ?? '';
        if ($providerName === '') {
            $providerName = $provider?->getTranslatedName($locale) ?? '';
        }

        $providerAlias = $config?->getTranslatedAlias($locale) ?? '';
        if ($providerAlias === '') {
            $providerAlias = $provider?->getTranslatedName($locale) ?? '';
        }

        return new ProviderModelProviderDTO(
            serviceProviderConfigId: (string) $configId,
            providerCode: $config?->getProviderCode()?->value ?? $provider?->getProviderCode()->value ?? '',
            name: $providerName,
            alias: $providerAlias,
            status: $config?->getStatus()->value ?? Status::Disabled->value,
            icon: $provider?->getIcon() ?? '',
            modelRecordId: $withModelRecord ? (string) $model->getId() : null,
            modelStatus: $withModelRecord ? ($model->getStatus()?->value ?? Status::Disabled->value) : null,
        );
    }
}
