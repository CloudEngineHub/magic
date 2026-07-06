<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity\ValueObject\Query;

class SlidesTemplateCategoryQuery
{
    private ?string $keyword = null;

    private ?string $code = null;

    private ?int $status = null;

    public function getKeyword(): ?string
    {
        return $this->keyword;
    }

    public function setKeyword(?string $keyword): void
    {
        $keyword = trim((string) $keyword);
        $this->keyword = $keyword === '' ? null : $keyword;
    }

    public function getCode(): ?string
    {
        return $this->code;
    }

    public function setCode(?string $code): void
    {
        $code = trim((string) $code);
        $this->code = $code === '' ? null : $code;
    }

    public function getStatus(): ?int
    {
        return $this->status;
    }

    public function setStatus(null|int|string $status): void
    {
        $this->status = $status === null || $status === '' ? null : (int) $status;
    }
}
