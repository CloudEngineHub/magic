<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Provider\Entity\ValueObject\Query;

use App\Domain\Provider\Entity\ValueObject\Category;
use App\Domain\Provider\Entity\ValueObject\ModelType;
use App\Domain\Provider\Entity\ValueObject\ProviderModelType;
use App\Domain\Provider\Entity\ValueObject\Status;

class ProviderModelQuery extends Query
{
    /** 模型 ID 或名称关键字。 */
    protected ?string $keyword = null;

    /** 单个模型状态筛选。 */
    protected ?Status $status = null;

    /** @var null|Status[] 多个模型状态筛选。 */
    protected ?array $statuses = null;

    /** 单个模型分类筛选。 */
    protected ?Category $category = null;

    /** @var null|Category[] 多个模型分类筛选。 */
    protected ?array $categories = null;

    /** 单个模型类型筛选。 */
    protected ?ModelType $modelType = null;

    /** @var null|ModelType[] 多个模型类型筛选。 */
    protected ?array $modelTypes = null;

    /** 是否只查询 Super Magic 展示模型。 */
    protected ?bool $superMagicDisplay = null;

    /** @var null|int[] 服务商配置 ID 筛选。 */
    protected ?array $providerConfigIds = null;

    /** 是否只查询官方模型。 */
    protected bool $isOffice = false;

    /** 是否启用 model_id 精确列表筛选。 */
    protected bool $isModelIdFilter = false;

    /** @var null|string[] 模型 ID 列表筛选。 */
    protected ?array $modelIds = null;

    /** @var null|int[] 服务商配置 ID 列表筛选。 */
    protected ?array $serviceProviderConfigIds = null;

    /** @var null|string[] 服务商编码列表筛选。 */
    protected ?array $providerCodes = null;

    /** 模型来源类型筛选。 */
    protected ?ProviderModelType $providerModelType = null;

    public function getKeyword(): ?string
    {
        return $this->keyword;
    }

    public function setKeyword(null|int|string $keyword): void
    {
        $keyword = trim((string) $keyword);
        $this->keyword = $keyword === '' ? null : $keyword;
    }

    public function getModelIds(): ?array
    {
        return $this->modelIds;
    }

    public function setModelIds(?array $modelIds): void
    {
        $this->modelIds = $this->normalizeStringList($modelIds);
    }

    public function getSuperMagicDisplay(): ?bool
    {
        return $this->superMagicDisplay;
    }

    public function setSuperMagicDisplay(?bool $superMagicDisplay): void
    {
        $this->superMagicDisplay = $superMagicDisplay;
    }

    public function getProviderConfigIds(): ?array
    {
        return $this->providerConfigIds;
    }

    public function setProviderConfigIds(?array $providerConfigIds): void
    {
        $this->providerConfigIds = $this->normalizeIntList($providerConfigIds);
    }

    public function getCategory(): ?Category
    {
        return $this->category;
    }

    public function setCategory(null|Category|string $category): void
    {
        if (is_null($category)) {
            return;
        }
        $this->category = $category instanceof Category ? $category : Category::from($category);
    }

    /** @return null|Category[] */
    public function getCategories(): ?array
    {
        return $this->categories;
    }

    public function setCategories(?array $categories): void
    {
        $list = [];
        $hasFilterValue = false;
        foreach ($categories ?? [] as $category) {
            if ($category instanceof Category) {
                $hasFilterValue = true;
                $list[] = $category;
                continue;
            }
            if ($category === null || $category === '') {
                continue;
            }
            $hasFilterValue = true;
            $categoryEnum = Category::tryFrom((string) $category);
            if ($categoryEnum !== null) {
                $list[] = $categoryEnum;
            }
        }
        $this->categories = $list === [] ? ($hasFilterValue ? [] : null) : array_values(array_unique($list, SORT_REGULAR));
    }

    public function getStatus(): ?Status
    {
        return $this->status;
    }

    public function setStatus(null|int|Status $status): self
    {
        if (is_null($status)) {
            return $this;
        }
        $this->status = $status instanceof Status ? $status : Status::from($status);
        return $this;
    }

    /** @return null|Status[] */
    public function getStatuses(): ?array
    {
        return $this->statuses;
    }

    public function setStatuses(?array $statuses): void
    {
        $list = [];
        $hasFilterValue = false;
        foreach ($statuses ?? [] as $status) {
            if ($status instanceof Status) {
                $hasFilterValue = true;
                $list[] = $status;
                continue;
            }
            if ($status === null || $status === '') {
                continue;
            }
            $hasFilterValue = true;
            if (! is_numeric($status)) {
                continue;
            }
            $statusEnum = Status::tryFrom((int) $status);
            if ($statusEnum !== null) {
                $list[] = $statusEnum;
            }
        }
        $this->statuses = $list === [] ? ($hasFilterValue ? [] : null) : array_values(array_unique($list, SORT_REGULAR));
    }

    public function getModelType(): ?ModelType
    {
        return $this->modelType;
    }

    public function setModelType(?ModelType $modelType): void
    {
        $this->modelType = $modelType;
    }

    /** @return null|ModelType[] */
    public function getModelTypes(): ?array
    {
        return $this->modelTypes;
    }

    /** @param ModelType[] $modelTypes */
    public function setModelTypes(?array $modelTypes): void
    {
        $list = [];
        $hasFilterValue = false;
        foreach ($modelTypes ?? [] as $modelType) {
            if ($modelType instanceof ModelType) {
                $hasFilterValue = true;
                $list[] = $modelType;
                continue;
            }
            if ($modelType === null || $modelType === '') {
                continue;
            }
            $hasFilterValue = true;
            if (! is_numeric($modelType)) {
                continue;
            }
            $modelTypeEnum = ModelType::tryFrom((int) $modelType);
            if ($modelTypeEnum !== null) {
                $list[] = $modelTypeEnum;
            }
        }
        $this->modelTypes = $list === [] ? ($hasFilterValue ? [] : null) : array_values(array_unique($list, SORT_REGULAR));
    }

    public function isOffice(): bool
    {
        return $this->isOffice;
    }

    public function setIsOffice(bool $isOffice): void
    {
        $this->isOffice = $isOffice;
    }

    public function isModelIdFilter(): bool
    {
        return $this->isModelIdFilter;
    }

    public function setIsModelIdFilter(bool $isModelIdFilter): void
    {
        $this->isModelIdFilter = $isModelIdFilter;
    }

    public function getProviderModelType(): ?ProviderModelType
    {
        return $this->providerModelType;
    }

    public function setProviderModelType(?ProviderModelType $providerModelType): void
    {
        $this->providerModelType = $providerModelType;
    }

    public function getServiceProviderConfigIds(): ?array
    {
        return $this->serviceProviderConfigIds;
    }

    public function setServiceProviderConfigIds(?array $serviceProviderConfigIds): void
    {
        $this->serviceProviderConfigIds = $this->normalizeIntList($serviceProviderConfigIds);
    }

    public function getProviderCodes(): ?array
    {
        return $this->providerCodes;
    }

    public function setProviderCodes(?array $providerCodes): void
    {
        $this->providerCodes = $this->normalizeStringList($providerCodes);
    }

    private function normalizeStringList(?array $values): ?array
    {
        $list = [];
        foreach ($values ?? [] as $value) {
            $value = trim((string) $value);
            if ($value !== '') {
                $list[] = $value;
            }
        }
        return $list === [] ? null : array_values(array_unique($list));
    }

    private function normalizeIntList(?array $values): ?array
    {
        $list = [];
        foreach ($values ?? [] as $value) {
            if (is_numeric($value)) {
                $list[] = (int) $value;
            }
        }
        return $list === [] ? null : array_values(array_unique($list));
    }
}
