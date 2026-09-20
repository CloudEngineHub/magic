<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Provider\DTO;

use App\Domain\Provider\Entity\ValueObject\ProviderConfigSearchField;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\AbstractDTO;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;

/**
 * 服务商配置搜索请求。
 */
class ProviderConfigSearchRequest extends AbstractDTO
{
    protected ?ProviderConfigSearchField $searchType = null;

    protected string $keyword = '';

    protected int $page = 1;

    protected int $pageSize = 20;

    public function __construct(array $data = [])
    {
        parent::__construct($data);
        if ($this->searchType === null) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => 'search_type']);
        }
        if ($this->keyword === '') {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => 'keyword']);
        }
        if ($this->searchType === ProviderConfigSearchField::ConfigId && ! ctype_digit($this->keyword)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => 'keyword']);
        }
    }

    public function getSearchType(): ProviderConfigSearchField
    {
        return $this->searchType;
    }

    public function setSearchType(null|ProviderConfigSearchField|string $searchType): void
    {
        if ($searchType instanceof ProviderConfigSearchField) {
            $this->searchType = $searchType;
            return;
        }

        $this->searchType = ProviderConfigSearchField::tryFrom(trim((string) $searchType));
    }

    public function getKeyword(): string
    {
        return $this->keyword;
    }

    public function setKeyword(null|int|string $keyword): void
    {
        $keyword = trim((string) $keyword);
        if ($keyword === '') {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => 'keyword']);
        }
        $this->keyword = $keyword;
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
        $this->pageSize = $pageSize > 0 ? min($pageSize, 50) : 20;
    }

    public function toPage(): Page
    {
        return new Page($this->page, $this->pageSize);
    }
}
