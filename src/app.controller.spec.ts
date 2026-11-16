import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OpenWalletUseCase } from './application/wallets/open-wallet.use-case.js';
import { GetWalletUseCase } from './application/wallets/get-wallet.use-case.js';
import { ProcessWagerUseCase } from './application/wagering/process-wager.use-case.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: OpenWalletUseCase,
          useValue: { execute: async () => ({}) },
        },
        {
          provide: GetWalletUseCase,
          useValue: { execute: async () => ({}) },
        },
        {
          provide: ProcessWagerUseCase,
          useValue: { execute: async () => ({}) },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
