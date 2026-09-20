<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Command;

use App\Domain\SuperMagic\File\Repository\Facade\TaskFileRepositoryInterface;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Symfony\Component\Console\Input\InputOption;
use Throwable;

#[Command]
class InitializeMagicFSFileTreeHeadsCommand extends HyperfCommand
{
    protected ?string $name = 'magicfs:initialize-file-tree-heads';

    public function __construct(
        private readonly TaskFileRepositoryInterface $taskFileRepository,
    ) {
        parent::__construct();
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('Initialize durable MagicFS file-tree heads');
        $this->addOption(
            'batch-size',
            'b',
            InputOption::VALUE_REQUIRED,
            'Root file trees processed per batch (1-10000)',
            '1000'
        );
    }

    public function handle(): int
    {
        $batchSize = filter_var(
            $this->input->getOption('batch-size'),
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 1, 'max_range' => 10000]]
        );
        if ($batchSize === false) {
            $this->error('--batch-size must be an integer between 1 and 10000.');
            return self::FAILURE;
        }

        try {
            $result = $this->taskFileRepository->initializeFileTreeHeads($batchSize);
        } catch (Throwable $throwable) {
            $this->error(sprintf(
                'MagicFS file-tree head initialization failed: %s',
                $throwable->getMessage()
            ));
            return self::FAILURE;
        }

        $this->info(sprintf(
            'Discovered %d file trees; initialized %d file-tree heads.',
            $result['discovered_file_trees'],
            $result['initialized_file_trees']
        ));

        return self::SUCCESS;
    }
}
