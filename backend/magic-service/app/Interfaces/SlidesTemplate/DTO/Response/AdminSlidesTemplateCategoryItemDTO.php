<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

class AdminSlidesTemplateCategoryItemDTO extends SlidesTemplateCategoryItemDTO
{
    public string $organizationCode = '';

    public int $status = 0;

    public ?string $createdUid = null;

    public ?string $updatedUid = null;

    public ?string $createdAt = null;

    public ?string $updatedAt = null;

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(?string $organizationCode): void
    {
        $this->organizationCode = $organizationCode ?? '';
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function setStatus(null|int|string $status): void
    {
        $this->status = $status === null ? 0 : (int) $status;
    }

    public function getCreatedUid(): ?string
    {
        return $this->createdUid;
    }

    public function setCreatedUid(?string $createdUid): void
    {
        $this->createdUid = $createdUid;
    }

    public function getUpdatedUid(): ?string
    {
        return $this->updatedUid;
    }

    public function setUpdatedUid(?string $updatedUid): void
    {
        $this->updatedUid = $updatedUid;
    }

    public function getCreatedAt(): ?string
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?string $createdAt): void
    {
        $this->createdAt = $createdAt;
    }

    public function getUpdatedAt(): ?string
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?string $updatedAt): void
    {
        $this->updatedAt = $updatedAt;
    }
}
