<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\CloudFile\Kernel\Utils;

use Dtyq\CloudFile\Kernel\Exceptions\CloudFileException;

/**
 * 远程文件 URL 安全校验器，负责在下载前收敛协议、主机和连接 IP 边界。
 */
class RemoteUrlSecurityValidator
{
    private const CLOUD_METADATA_IPS = [
        '169.254.169.254',
        '100.100.100.200',
        '100.96.0.96',
    ];

    private const LOOPBACK_CIDRS = [
        '127.0.0.0/8',
        '::1/128',
    ];

    private const PRIVATE_CIDRS = [
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        'fc00::/7',
    ];

    private const LINK_LOCAL_CIDRS = [
        '169.254.0.0/16',
        'fe80::/10',
    ];

    private const RESERVED_CIDRS = [
        '0.0.0.0/8',
        '100.64.0.0/10',
        '192.0.0.0/24',
        '192.0.2.0/24',
        '198.18.0.0/15',
        '198.51.100.0/24',
        '203.0.113.0/24',
        '224.0.0.0/4',
        '240.0.0.0/4',
        '::/128',
        '::ffff:0:0/96',
        '2001:db8::/32',
    ];

    public function __construct(
        private readonly RemoteDownloadSecurityConfig $securityConfig = new RemoteDownloadSecurityConfig(),
    ) {
    }

    /**
     * 校验 URL 并返回已验证的主机、端口和固定连接 IP。
     *
     * @return array{url: string, host: string, port: int, ip: string}
     */
    public function validate(string $url): array
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            throw new CloudFileException(sprintf('Invalid remote file url: %s', $url));
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = trim((string) ($parts['host'] ?? ''), '[]');
        if ($scheme === '' || $host === '') {
            throw new CloudFileException(sprintf('Invalid remote file url: %s', $url));
        }

        if (! $this->securityConfig->allowsScheme($scheme)) {
            throw new CloudFileException(sprintf('Remote file protocol is not allowed: %s', $scheme));
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new CloudFileException('Remote file url user info is not allowed');
        }

        $port = (int) ($parts['port'] ?? $this->getDefaultPort($scheme));
        $allowedPorts = $this->securityConfig->getAllowedPorts();
        if ($allowedPorts !== [] && ! in_array($port, $allowedPorts, true)) {
            throw new CloudFileException(sprintf('Remote file port is not allowed: %d', $port));
        }

        $ips = $this->resolveHost($host);
        foreach ($ips as $ip) {
            $this->assertPublicIp($host, $ip);
        }

        return [
            'url' => $url,
            'host' => $host,
            'port' => $port,
            'ip' => $ips[0],
        ];
    }

    /**
     * 解析主机名，直接 IP 会原样返回，域名会解析 A 和 AAAA 记录。
     *
     * @return array<string>
     */
    private function resolveHost(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$host];
        }

        if (filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) {
            throw new CloudFileException(sprintf('Invalid remote file host: %s', $host));
        }

        $ips = [];
        $records = dns_get_record($host, DNS_A + DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $record) {
                $ip = $record['ip'] ?? $record['ipv6'] ?? null;
                if (is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP)) {
                    $ips[] = $ip;
                }
            }
        }

        if ($ips === []) {
            $ipv4List = gethostbynamel($host);
            if (is_array($ipv4List)) {
                $ips = array_values(array_filter($ipv4List, static fn ($ip) => filter_var($ip, FILTER_VALIDATE_IP)));
            }
        }

        $ips = array_values(array_unique($ips));
        if ($ips === []) {
            throw new CloudFileException(sprintf('Resolve remote file host failed: %s', $host));
        }

        return $ips;
    }

    /**
     * 校验 IP 必须是公网地址，拒绝回环、私网、保留地址和云元数据地址。
     */
    private function assertPublicIp(string $host, string $ip): void
    {
        if ($this->securityConfig->shouldBlockCloudMetadataIp() && in_array($ip, self::CLOUD_METADATA_IPS, true)) {
            throw new CloudFileException(sprintf('Remote file cloud metadata ip is blocked: %s', $ip));
        }

        $normalizedIp = $this->normalizeIpv4MappedIpv6($ip);

        if (in_array($normalizedIp, $this->securityConfig->getExtraBlockedIps(), true)) {
            throw new CloudFileException(sprintf('Remote file ip is blocked by config: %s', $ip));
        }

        if ($this->isIpInCidrs($normalizedIp, $this->securityConfig->getExtraBlockedCidrs())) {
            throw new CloudFileException(sprintf('Remote file ip cidr is blocked by config: %s', $ip));
        }

        if ($this->securityConfig->shouldBlockLoopbackIp() && $this->isIpInCidrs($normalizedIp, self::LOOPBACK_CIDRS)) {
            throw new CloudFileException(sprintf('Remote file loopback ip is blocked: %s', $ip));
        }

        if ($this->securityConfig->shouldBlockPrivateIp() && $this->isIpInCidrs($normalizedIp, self::PRIVATE_CIDRS)) {
            throw new CloudFileException(sprintf('Remote file private ip is blocked: %s', $ip));
        }

        if ($this->securityConfig->shouldBlockLinkLocalIp() && $this->isIpInCidrs($normalizedIp, self::LINK_LOCAL_CIDRS)) {
            throw new CloudFileException(sprintf('Remote file link-local ip is blocked: %s', $ip));
        }

        if ($this->securityConfig->shouldBlockReservedIp() && $this->isIpInCidrs($normalizedIp, self::RESERVED_CIDRS)) {
            throw new CloudFileException(sprintf('Remote file reserved ip is blocked: %s[%s]', $host, $ip));
        }
    }

    /**
     * 获取协议默认端口。
     */
    private function getDefaultPort(string $scheme): int
    {
        return match ($scheme) {
            'http' => 80,
            'https' => 443,
            default => 0,
        };
    }

    /**
     * 将 IPv4-mapped IPv6 规范化为 IPv4，避免绕过 IPv4 网段判断。
     */
    private function normalizeIpv4MappedIpv6(string $ip): string
    {
        if (str_starts_with(strtolower($ip), '::ffff:')) {
            $mapped = substr($ip, 7);
            if (filter_var($mapped, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                return $mapped;
            }
        }

        return $ip;
    }

    /**
     * 判断 IPv4 是否命中明确拒绝的内网和特殊网段。
     */
    private function isIpInCidrs(string $ip, array $cidrs): bool
    {
        foreach ($cidrs as $cidr) {
            if (! is_string($cidr) || ! str_contains($cidr, '/')) {
                continue;
            }
            if ($this->isIpInCidr($ip, $cidr)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 判断 IP 地址是否属于指定 CIDR。
     */
    private function isIpInCidr(string $ip, string $cidr): bool
    {
        [$range, $bits] = explode('/', $cidr, 2);
        $ipBinary = inet_pton($ip);
        $rangeBinary = inet_pton($range);
        if ($ipBinary === false || $rangeBinary === false || strlen($ipBinary) !== strlen($rangeBinary)) {
            return false;
        }

        $bits = (int) $bits;
        if ($bits < 0 || $bits > strlen($ipBinary) * 8) {
            return false;
        }
        $bytes = intdiv($bits, 8);
        $remainingBits = $bits % 8;

        if ($bytes > 0 && substr($ipBinary, 0, $bytes) !== substr($rangeBinary, 0, $bytes)) {
            return false;
        }

        if ($remainingBits === 0) {
            return true;
        }

        $mask = (0xFF << (8 - $remainingBits)) & 0xFF;
        return (ord($ipBinary[$bytes]) & $mask) === (ord($rangeBinary[$bytes]) & $mask);
    }
}
