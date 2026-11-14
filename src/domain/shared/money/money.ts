import { Decimal } from 'decimal.js';

export class Money {
  private constructor(
    private readonly amount: Decimal,
    public readonly currency: string,
  ) {}

  static from(amount: string, currency: string): Money {
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) {
      throw new Error('Invalid monetary amount');
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error('Invalid currency');
    }

    return new Money(new Decimal(amount), currency);
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);

    return Money.from(this.amount.plus(other.amount).toFixed(2), this.currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);

    return Money.from(
      this.amount.minus(other.amount).toFixed(2),
      this.currency,
    );
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  equals(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.amount.equals(other.amount);
  }

  toDecimalString(): string {
    return this.amount.toFixed(2);
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} and ${other.currency}`,
      );
    }
  }
}
