<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\AppMenu\Entity;

use App\Domain\AppMenu\Entity\ValueObject\AppMenuIconType;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuSourceType;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use App\Domain\AppMenu\Entity\ValueObject\DisplayScope;
use App\Domain\AppMenu\Entity\ValueObject\OpenMethod;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityConfig;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\AbstractEntity;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use DateTime;

class AppMenuEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected int $sourceType = AppMenuSourceType::Official->value;

    protected array $nameI18n = [];

    protected string $icon = '';

    protected string $iconUrl = '';

    protected int $iconType = AppMenuIconType::Icon->value;

    protected string $path = '';

    protected int $openMethod = OpenMethod::CurrentWindow->value;

    protected int $sortOrder = 0;

    protected int $displayScope = DisplayScope::All->value;

    protected int $status = AppMenuStatus::Enabled->value;

    protected ?int $organizationStatus = null;

    protected ?int $organizationSortOrder = null;

    protected ?VisibilityConfig $visibilityConfig = null;

    protected string $creatorId = '';

    protected DateTime $createdAt;

    protected DateTime $updatedAt;

    public function shouldCreate(): bool
    {
        return $this->id === null;
    }

    public function prepareForCreation(): void
    {
        $this->validateRequiredForCreate();

        if (empty($this->createdAt)) {
            $this->createdAt = new DateTime();
        }

        $this->updatedAt = $this->createdAt;
        $this->id = null;
    }

    public function prepareForModification(AppMenuEntity $appMenuEntity): void
    {
        $this->validateRequiredForUpdate();

        $appMenuEntity->setNameI18n($this->nameI18n);
        $appMenuEntity->setIcon($this->icon);
        $appMenuEntity->setIconUrl($this->iconUrl);
        $appMenuEntity->setIconType($this->iconType);
        $appMenuEntity->setPath($this->path);
        $appMenuEntity->setOpenMethod($this->openMethod);
        $appMenuEntity->setSortOrder($this->sortOrder);
        $appMenuEntity->setDisplayScope($this->displayScope);
        $appMenuEntity->setStatus($this->status);
        $appMenuEntity->setUpdatedAt(new DateTime());
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(?int $id): void
    {
        $this->id = $id;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(?string $organizationCode): void
    {
        $this->organizationCode = $organizationCode ?? '';
    }

    public function getSourceType(): int
    {
        return $this->sourceType;
    }

    public function setSourceType(null|int|string $sourceType): void
    {
        if ($sourceType === null || $sourceType === '') {
            $this->sourceType = AppMenuSourceType::Official->value;
            return;
        }

        $this->sourceType = AppMenuSourceType::make((int) $sourceType)->value;
    }

    public function isOfficial(): bool
    {
        return $this->sourceType === AppMenuSourceType::Official->value;
    }

    public function isOrganization(): bool
    {
        return $this->sourceType === AppMenuSourceType::Organization->value;
    }

    public function getNameI18n(): array
    {
        return $this->nameI18n;
    }

    public function setNameI18n(array $nameI18n): void
    {
        $this->nameI18n = $nameI18n;
    }

    public function getIcon(): string
    {
        return $this->icon;
    }

    public function setIcon(string $icon): void
    {
        $this->icon = $icon;
    }

    public function getIconUrl(): string
    {
        return $this->iconUrl;
    }

    public function setIconUrl(string $iconUrl): void
    {
        $this->iconUrl = $iconUrl;
    }

    public function getIconType(): int
    {
        return $this->iconType;
    }

    public function setIconType(int $iconType): void
    {
        $this->iconType = AppMenuIconType::make($iconType)->value;
    }

    public function isIcon(): bool
    {
        return $this->iconType === AppMenuIconType::Icon->value;
    }

    public function isImageIcon(): bool
    {
        return $this->iconType === AppMenuIconType::Image->value;
    }

    public function getPath(): string
    {
        return $this->path;
    }

    public function setPath(string $path): void
    {
        $this->path = $path;
    }

    public function getOpenMethod(): int
    {
        return $this->openMethod;
    }

    public function setOpenMethod(int $openMethod): void
    {
        $this->openMethod = $openMethod;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }

    public function setSortOrder(int $sortOrder): void
    {
        $this->sortOrder = $sortOrder;
    }

    public function getDisplayScope(): int
    {
        return $this->displayScope;
    }

    public function setDisplayScope(int $displayScope): void
    {
        $this->displayScope = $displayScope;
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function setStatus(int $status): void
    {
        $this->status = $status;
    }

    public function getEffectiveStatus(): int
    {
        return $this->organizationStatus ?? $this->status;
    }

    public function getOrganizationStatus(): ?int
    {
        return $this->organizationStatus;
    }

    public function setOrganizationStatus(null|int|string $organizationStatus): void
    {
        if ($organizationStatus === null || $organizationStatus === '') {
            $this->organizationStatus = null;
            return;
        }

        $this->organizationStatus = AppMenuStatus::make((int) $organizationStatus)->value;
    }

    public function getEffectiveSortOrder(): int
    {
        return $this->organizationSortOrder ?? $this->sortOrder;
    }

    public function getOrganizationSortOrder(): ?int
    {
        return $this->organizationSortOrder;
    }

    public function setOrganizationSortOrder(null|int|string $organizationSortOrder): void
    {
        $this->organizationSortOrder = $organizationSortOrder === null || $organizationSortOrder === ''
            ? null
            : (int) $organizationSortOrder;
    }

    public function getVisibilityConfig(): ?VisibilityConfig
    {
        return $this->visibilityConfig;
    }

    public function setVisibilityConfig(?VisibilityConfig $visibilityConfig): void
    {
        $this->visibilityConfig = $visibilityConfig;
    }

    public function getCreatorId(): string
    {
        return $this->creatorId;
    }

    public function setCreatorId(string $creatorId): void
    {
        $this->creatorId = $creatorId;
    }

    public function getCreatedAt(): DateTime
    {
        return $this->createdAt;
    }

    public function setCreatedAt(DateTime $createdAt): void
    {
        $this->createdAt = $createdAt;
    }

    public function getUpdatedAt(): DateTime
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(DateTime $updatedAt): void
    {
        $this->updatedAt = $updatedAt;
    }

    private function validateRequiredForCreate(): void
    {
        $this->validateRequiredForUpdate();

        if (empty($this->creatorId)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => '创建人ID']);
        }
    }

    private function validateRequiredForUpdate(): void
    {
        $iconType = AppMenuIconType::make($this->iconType);

        if (empty($this->nameI18n)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => '应用名称（多语言）']);
        }

        if ($iconType === AppMenuIconType::Icon && empty($this->icon)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => '应用图标']);
        }

        if ($iconType === AppMenuIconType::Image && empty($this->iconUrl)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => '应用图标图片']);
        }

        if (empty($this->path)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => '应用路径']);
        }
    }
}
