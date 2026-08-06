<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Common\Service;

use App\Domain\Contact\Entity\MagicUserEntity;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Domain\SuperMagic\Common\Entity\UserAuthorization;

class UserDomainService
{
    public function __construct(
        protected MagicUserDomainService $magicUserDomainService,
    ) {
    }

    public function getUserEntity(string $userId): ?MagicUserEntity
    {
        return $this->magicUserDomainService->getUserById($userId);
    }

    public function getUserAuthorization(string $userId): ?UserAuthorization
    {
        $magicUserEntity = $this->getUserEntity($userId);

        return UserAuthorization::fromUserEntity($magicUserEntity);
    }
}
