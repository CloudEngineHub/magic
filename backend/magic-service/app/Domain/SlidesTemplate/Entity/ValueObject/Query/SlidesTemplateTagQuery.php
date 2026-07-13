<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity\ValueObject\Query;

use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagMatch;

class SlidesTemplateTagQuery
{
    private ?string $keyword = null;

    private ?string $code = null;

    private ?int $status = null;

    private ?int $parentId = null;

    private ?string $nodeType = null;

    private bool $onlyWithTemplates = false;

    private ?string $templateKeyword = null;

    private ?string $templateCategoryCode = null;

    private array $templateTagCodes = [];

    private SlidesTemplateTagMatch $templateTagMatch = SlidesTemplateTagMatch::Any;

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

    public function getParentId(): ?int
    {
        return $this->parentId;
    }

    public function setParentId(null|int|string $parentId): void
    {
        $this->parentId = $parentId === null || $parentId === '' ? null : (int) $parentId;
    }

    public function getNodeType(): ?string
    {
        return $this->nodeType;
    }

    public function setNodeType(?string $nodeType): void
    {
        $nodeType = trim((string) $nodeType);
        $this->nodeType = $nodeType === '' ? null : $nodeType;
    }

    public function isOnlyWithTemplates(): bool
    {
        return $this->onlyWithTemplates;
    }

    public function setOnlyWithTemplates(bool $onlyWithTemplates): void
    {
        $this->onlyWithTemplates = $onlyWithTemplates;
    }

    public function getTemplateKeyword(): ?string
    {
        return $this->templateKeyword;
    }

    public function setTemplateKeyword(?string $templateKeyword): void
    {
        $templateKeyword = trim((string) $templateKeyword);
        $this->templateKeyword = $templateKeyword === '' ? null : $templateKeyword;
    }

    public function getTemplateCategoryCode(): ?string
    {
        return $this->templateCategoryCode;
    }

    public function setTemplateCategoryCode(?string $templateCategoryCode): void
    {
        $templateCategoryCode = trim((string) $templateCategoryCode);
        $this->templateCategoryCode = $templateCategoryCode === '' ? null : $templateCategoryCode;
    }

    public function getTemplateTagCodes(): array
    {
        return $this->templateTagCodes;
    }

    public function setTemplateTagCodes(array $templateTagCodes): void
    {
        $result = [];
        foreach ($templateTagCodes as $tagCode) {
            if (! is_string($tagCode)) {
                continue;
            }
            $tagCode = trim($tagCode);
            if ($tagCode !== '') {
                $result[$tagCode] = $tagCode;
            }
        }
        $this->templateTagCodes = array_values($result);
    }

    public function getTemplateTagMatch(): SlidesTemplateTagMatch
    {
        return $this->templateTagMatch;
    }

    public function setTemplateTagMatch(null|SlidesTemplateTagMatch|string $templateTagMatch): void
    {
        if ($templateTagMatch instanceof SlidesTemplateTagMatch) {
            $this->templateTagMatch = $templateTagMatch;
            return;
        }

        $this->templateTagMatch = SlidesTemplateTagMatch::tryFrom((string) $templateTagMatch) ?? SlidesTemplateTagMatch::Any;
    }
}
