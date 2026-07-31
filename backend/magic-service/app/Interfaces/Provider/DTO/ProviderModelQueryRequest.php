<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Provider\DTO;

use App\Domain\Provider\Entity\ValueObject\Category;
use App\Domain\Provider\Entity\ValueObject\ModelType;
use App\Domain\Provider\Entity\ValueObject\ProviderCode;
use App\Domain\Provider\Entity\ValueObject\Query\ProviderModelQuery;
use App\Domain\Provider\Entity\ValueObject\Status;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\AbstractDTO;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;

class ProviderModelQueryRequest extends AbstractDTO
{
    protected string $keyword = '';

    protected string $modelId = '';

    protected array $categories = [];

    protected array $modelTypes = [];

    protected array $statuses = [];

    protected array $serviceProviderConfigIds = [];

    protected array $providerCodes = [];

    protected int $page = 1;

    protected int $pageSize = 20;

    public function toProviderModelQuery(): ProviderModelQuery
    {
        $query = new ProviderModelQuery();
        $query->setKeyword($this->keyword);
        if ($this->modelId !== '') {
            $query->setModelIds([$this->modelId]);
        }
        $query->setCategories($this->categories);
        $query->setModelTypes($this->modelTypes);
        $query->setStatuses($this->statuses);
        $query->setServiceProviderConfigIds($this->serviceProviderConfigIds);
        $query->setProviderCodes($this->providerCodes);
        $query->setOrder(['sort' => 'desc', 'id' => 'asc']);

        return $query;
    }

    public function toPage(): Page
    {
        return new Page($this->page, $this->pageSize);
    }

    public function getPage(): int
    {
        return $this->page;
    }

    public function setPage(null|int|string $page): void
    {
        $this->page = max(1, (int) $page);
    }

    public function getPageSize(): int
    {
        return $this->pageSize;
    }

    public function setPageSize(null|int|string $pageSize): void
    {
        $pageSize = (int) $pageSize;
        $this->pageSize = $pageSize > 0 ? min($pageSize, 200) : 20;
    }

    public function setKeyword(null|int|string $keyword): void
    {
        $this->keyword = trim((string) $keyword);
    }

    public function setModelId(null|int|string $modelId): void
    {
        $this->modelId = trim((string) $modelId);
    }

    public function setCategories(?array $categories): void
    {
        $this->categories = $this->normalizeList($categories);
        $this->validateStringEnumList($this->categories, Category::class, 'categories');
    }

    public function setModelTypes(?array $modelTypes): void
    {
        $this->modelTypes = $this->normalizeList($modelTypes);
        $this->validateIntEnumList($this->modelTypes, ModelType::class, 'model_types');
    }

    public function setStatuses(?array $statuses): void
    {
        $this->statuses = $this->normalizeList($statuses);
        $this->validateIntEnumList($this->statuses, Status::class, 'statuses');
    }

    public function setServiceProviderConfigIds(?array $serviceProviderConfigIds): void
    {
        $this->serviceProviderConfigIds = $this->normalizeList($serviceProviderConfigIds);
    }

    public function setProviderCodes(?array $providerCodes): void
    {
        $this->providerCodes = array_values(array_unique(array_map(
            fn (string $providerCode): string => $this->normalizeProviderCode($providerCode),
            $this->normalizeList($providerCodes)
        )));
    }

    private function normalizeList(?array $values): array
    {
        $list = [];
        foreach ($values ?? [] as $value) {
            $value = trim((string) $value);
            if ($value !== '') {
                $list[] = $value;
            }
        }
        return array_values(array_unique($list));
    }

    private function validateStringEnumList(array $values, string $enumClass, string $field): void
    {
        foreach ($values as $value) {
            if ($enumClass::tryFrom($value) === null) {
                ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $field]);
            }
        }
    }

    private function validateIntEnumList(array $values, string $enumClass, string $field): void
    {
        foreach ($values as $value) {
            if (! is_numeric($value) || $enumClass::tryFrom((int) $value) === null) {
                ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $field]);
            }
        }
    }

    private function normalizeProviderCode(string $providerCode): string
    {
        foreach (ProviderCode::cases() as $case) {
            if (strcasecmp($case->value, $providerCode) === 0) {
                return $case->value;
            }
        }
        ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => 'provider_codes']);
    }
}
