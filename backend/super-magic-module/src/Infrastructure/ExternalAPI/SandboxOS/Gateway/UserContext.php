<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\Gateway;

/**
 * Per-call user identity forwarded to the sandbox gateway.
 *
 * SandboxGatewayService is a long-lived DI singleton in magic-service
 * and other upstream callers; storing anything per-request on the
 * service instance leaks state across requests (different users in
 * different coroutines share one instance). All three values are
 * therefore passed EXPLICITLY through the call signature on every
 * gateway method, following the same pattern as the Go-side
 * mount code (magicFSMountParams.Authorization). The companion
 * setUserContext/clearUserContext stateful API has been removed.
 *
 * Nullable semantics:
 *   - userId / organizationCode are nullable so warm-pool workers
 *     and other service-account-style callers can construct an empty
 *     UserContext and skip the magic-user-id/magic-organization-code
 *     headers entirely.
 *   - authorization is nullable so callers that legitimately have no
 *     per-user token (background tasks) can hand in null; the gateway
 *     does NOT emit User-Authorization in that case so the downstream
 *     in-pod agent's AuthMiddleware will 401 – which is intentional.
 *     Callers that DO have a per-user token must look it up via
 *     AgentDomainService::getAuthorizationByUserId($userId) (the
 *     magic_tokens stable user-token table) and forward it here.
 */
final class UserContext
{
    public function __construct(
        public readonly ?string $userId = null,
        public readonly ?string $organizationCode = null,
        public readonly ?string $authorization = null,
    ) {
    }
}
