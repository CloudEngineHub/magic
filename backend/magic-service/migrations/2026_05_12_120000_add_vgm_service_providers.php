<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Application\Provider\Official\ServiceProviderInitializer;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('service_provider') || ! Schema::hasTable('service_provider_configs')) {
            return;
        }

        $result = ServiceProviderInitializer::init();
        if (! $result['success']) {
            throw new RuntimeException($result['message']);
        }
    }

    public function down(): void
    {
    }
};
