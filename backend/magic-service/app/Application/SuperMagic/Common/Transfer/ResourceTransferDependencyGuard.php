<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Transfer;

use App\Application\KnowledgeBase\Service\KnowledgeBaseAppService;
use App\Application\SuperMagic\Common\Collaboration\Policy\ResourceAccessPolicyService;
use App\Domain\Contact\Entity\MagicUserEntity;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\ResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as VisibilityResourceType;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use App\Domain\SuperMagic\Agent\Service\SuperMagicAgentSkillDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Qbhy\HyperfAuth\Authenticatable;

/** Dependencies remain owned by their authors; transferring must not widen their visibility. */
class ResourceTransferDependencyGuard
{
    public function __construct(
        private readonly ResourceAccessPolicyService $policy,
        private readonly SuperMagicAgentSkillDomainService $skills,
        private readonly KnowledgeBaseAppService $knowledge,
    ) {
    }

    public function assertAgentDependencies(Authenticatable $sender, MagicUserEntity $receiver, string $code): void
    {
        $org = $sender->getOrganizationCode();
        $receiverIsolation = SuperMagicAgentDataIsolation::create($org, $receiver->getUserId());
        foreach ($this->skills->getByAgentCodeForCurrentVersion(SuperMagicAgentDataIsolation::create($org, $sender->getId()), $code) as $skill) {
            $this->policy->assertReadable($receiverIsolation, ResourceType::Skill, VisibilityResourceType::SKILL, $skill->getSkillCode());
        }
        $receiverAuthorization = MagicUserAuthorization::fromUserEntity($receiver);
        $page = 1;
        do {
            $result = $this->knowledge->queriesRaw($sender, ['agent_codes' => [$code], 'page' => $page, 'page_size' => 100]);
            $items = $result['list'] ?? [];
            foreach ($items as $item) {
                $this->knowledge->showRaw($receiverAuthorization, (string) $item['code']);
            }
            ++$page;
        } while (count($items) === 100);
    }
}
