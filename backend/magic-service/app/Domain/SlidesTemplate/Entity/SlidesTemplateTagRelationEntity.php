<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity;

use App\Infrastructure\Core\AbstractEntity;

class SlidesTemplateTagRelationEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected int $templateId = 0;

    protected int $tagId = 0;

    protected ?string $createdUid = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(null|int|string $id): self
    {
        $this->id = $id === null ? null : (int) $id;
        return $this;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(string $organizationCode): self
    {
        $this->organizationCode = $organizationCode;
        return $this;
    }

    public function getTemplateId(): int
    {
        return $this->templateId;
    }

    public function setTemplateId(int|string $templateId): self
    {
        $this->templateId = (int) $templateId;
        return $this;
    }

    public function getTagId(): int
    {
        return $this->tagId;
    }

    public function setTagId(int|string $tagId): self
    {
        $this->tagId = (int) $tagId;
        return $this;
    }

    public function getCreatedUid(): ?string
    {
        return $this->createdUid;
    }

    public function setCreatedUid(?string $createdUid): self
    {
        $this->createdUid = $createdUid;
        return $this;
    }
}
