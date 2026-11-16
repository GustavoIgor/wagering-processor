import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { WAGERING_REPOSITORY } from '../../application/ports/wagering.repository.js';

import type { WageringRepository } from '../../application/ports/wagering.repository.js';

@Injectable()
export class PendingReferenceProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PendingReferenceProcessorService.name);

  private stopping = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    @Inject(WAGERING_REPOSITORY)
    private readonly repository: WageringRepository,
  ) {}

  onModuleInit(): void {
    this.loopPromise = this.runLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.stopping) {
      try {
        const processed = await this.repository.processPendingReferences();

        if (processed > 0) {
          continue;
        }
      } catch (error) {
        this.logger.error(
          'Error processing pending references',
          error instanceof Error ? error.stack : String(error),
        );
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_000);
      });
    }
  }
}
