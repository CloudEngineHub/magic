<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

use App\Infrastructure\Core\AbstractDTO;

class SlidesTemplateListPageDTO extends AbstractDTO
{
    public int $page = 1;

    public int $pageSize = 20;

    public array $list = [];

    public function __construct(int $page, int $pageSize, array $list)
    {
        $this->setPage($page);
        $this->setPageSize($pageSize);
        $this->setList($list);
        parent::__construct();
    }

    public function getPage(): int
    {
        return $this->page;
    }

    public function setPage(int $page): void
    {
        $this->page = $page;
    }

    public function getPageSize(): int
    {
        return $this->pageSize;
    }

    public function setPageSize(int $pageSize): void
    {
        $this->pageSize = $pageSize;
    }

    public function getList(): array
    {
        return $this->list;
    }

    public function setList(array $list): void
    {
        $this->list = array_values($list);
    }
}
