<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Core\Traits;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Qbhy\HyperfAuth\Authenticatable;

trait DataIsolationTrait
{
    /**
     * @param MagicUserAuthorization $authorization
     */
    protected function createDataIsolation(Authenticatable $authorization): DataIsolation
    {
        /* @phpstan-ignore-next-line */
        if ($authorization instanceof MagicUserAuthorization) {
            $userId = $authorization->getId();
            $dataIsolation = DataIsolation::create($authorization->getOrganizationCode(), $userId);
            $dataIsolation->setCurrentMagicId(currentMagicId: $authorization->getMagicId());
            $dataIsolation->setUserType(userType: $authorization->getUserType());
        } else {
            $dataIsolation = DataIsolation::create($authorization->getOrganizationCode());
        }
        return $dataIsolation;
    }
}
