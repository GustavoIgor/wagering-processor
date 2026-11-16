import {
  BadRequestException,
  Body,
  Headers,
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { AppService } from './app.service.js';
import { OpenWalletUseCase } from './application/wallets/open-wallet.use-case.js';
import { WalletAlreadyExistsError } from './application/wallets/wallet-already-exists.error.js';
import { GetWalletUseCase } from './application/wallets/get-wallet.use-case.js';
import { WalletNotFoundError } from './application/wallets/wallet-not-found.error.js';
import { ProcessWagerUseCase } from './application/wagering/process-wager.use-case.js';
import { IdempotencyConflictError } from './application/wagering/idempotency-conflict.error.js';
import type { WagerOperation } from './domain/wagering/wager-transaction.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly openWalletUseCase: OpenWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly processWagerUseCase: ProcessWagerUseCase,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('wallets')
  async openWallet(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Invalid request body');
    }

    const { playerId, currency } = body as Record<string, unknown>;

    if (
      typeof playerId !== 'string' ||
      playerId.trim().length === 0 ||
      playerId.length > 128
    ) {
      throw new BadRequestException('Invalid playerId');
    }

    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Invalid currency');
    }

    try {
      const wallet = await this.openWalletUseCase.execute(playerId, currency);

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        currency: wallet.currency,
        balance: wallet.balance.toDecimalString(),
      };
    } catch (error) {
      if (error instanceof WalletAlreadyExistsError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  @Get('wallets/:id')
  async getWallet(@Param('id') id: string) {
    try {
      const wallet = await this.getWalletUseCase.execute(id);

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        currency: wallet.currency,
        balance: wallet.balance.toDecimalString(),
      };
    } catch (error) {
      if (error instanceof WalletNotFoundError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
  @Post('wagers')
  async processWager(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body()
    body: {
      providerId: string;
      playerId: string;
      walletId: string;
      roundId: string;
      operation: WagerOperation;
      amount: string;
      currency: string;
      referenceTransactionId?: string;
    },
  ) {
    try {
      const transaction = await this.processWagerUseCase.execute(
        body,
        idempotencyKey,
      );

      return {
        id: transaction.id,
        providerId: transaction.providerId,
        playerId: transaction.playerId,
        walletId: transaction.walletId,
        roundId: transaction.roundId,
        operation: transaction.operation,
        amount: transaction.amount.toDecimalString(),
        currency: transaction.amount.currency,
        status: transaction.status,
        failureCode: transaction.failureCode,
      };
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}
