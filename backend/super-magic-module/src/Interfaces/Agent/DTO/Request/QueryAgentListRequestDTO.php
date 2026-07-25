<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\Agent\DTO\Request;

use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentListScope;

use function Hyperf\Translation\__;

class QueryAgentListRequestDTO extends QueryAgentsRequestDTO
{
    public string $scope = 'all';

    public static function getHyperfValidationRules(): array
    {
        return array_merge(parent::getHyperfValidationRules(), [
            'scope' => 'nullable|string|in:' . implode(',', AgentListScope::values()),
        ]);
    }

    public static function getHyperfValidationMessage(): array
    {
        return array_merge(parent::getHyperfValidationMessage(), [
            'scope.in' => __('super_magic.agent.scope_invalid'),
        ]);
    }

    public function getScope(): AgentListScope
    {
        return AgentListScope::tryFrom($this->scope) ?? AgentListScope::ALL;
    }
}
