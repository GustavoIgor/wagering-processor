import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from '../mikro-orm.config.js';
import { OpenWalletUseCase } from './application/wallets/open-wallet.use-case.js';
import { WALLET_REPOSITORY } from './application/ports/wallet.repository.js';
import { MikroOrmWalletRepository } from './infrastructure/persistence/repositories/wallet.repository.js';
import { WalletEntity } from './infrastructure/persistence/entities/wallet.entity.js';
import { GetWalletUseCase } from './application/wallets/get-wallet.use-case.js';
import { ProcessWagerUseCase } from './application/wagering/process-wager.use-case.js';
import { WAGERING_REPOSITORY } from './application/ports/wagering.repository.js';
import { MikroOrmWageringRepository } from './infrastructure/persistence/repositories/wagering.repository.js';
import { OutboxPublisherService } from './infrastructure/messaging/outbox-publisher.service.js';
import { WageringConsumerService } from './infrastructure/messaging/wagering-consumer.service.js';
import { PendingReferenceProcessorService } from './infrastructure/messaging/pending-reference-processor.service.js';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    MikroOrmModule.forFeature([WalletEntity]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    OpenWalletUseCase,
    GetWalletUseCase,
    ProcessWagerUseCase,
    OutboxPublisherService,
    WageringConsumerService,
    PendingReferenceProcessorService,
    {
      provide: WAGERING_REPOSITORY,
      useClass: MikroOrmWageringRepository,
    },
    {
      provide: WALLET_REPOSITORY,
      useClass: MikroOrmWalletRepository,
    },
  ],
})
export class AppModule {}
