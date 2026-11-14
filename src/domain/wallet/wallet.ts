import { Money } from '../shared/money/money.js';

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private currentBalance: Money,
  ) {}

  static open(id: string, playerId: string, currency: string): Wallet {
    return new Wallet(id, playerId, currency, Money.from('0.00', currency));
  }

  get balance(): Money {
    return this.currentBalance;
  }

  credit(amount: Money): void {
    this.validateAmount(amount);

    this.currentBalance = this.currentBalance.add(amount);
  }

  debit(amount: Money): void {
    this.validateAmount(amount);

    const newBalance = this.currentBalance.subtract(amount);

    if (newBalance.isNegative()) {
      throw new Error('Insufficient funds');
    }

    this.currentBalance = newBalance;
  }

  private validateAmount(amount: Money): void {
    if (amount.currency !== this.currency) {
      throw new Error('Wallet currency mismatch');
    }

    if (amount.isNegative() || amount.isZero()) {
      throw new Error('Amount must be positive');
    }
  }
}
