import { describe, expect, it } from 'vitest';
import { Money } from '../shared/money/money.js';
import { Wallet } from './wallet.js';

describe('Wallet', () => {
  it('should open with zero balance', () => {
    const wallet = Wallet.open('1', 'player-1', 'BRL');

    expect(wallet.balance.toDecimalString()).toBe('0.00');
  });

  it('should credit the wallet', () => {
    const wallet = Wallet.open('1', 'player-1', 'BRL');

    wallet.credit(Money.from('100.00', 'BRL'));

    expect(wallet.balance.toDecimalString()).toBe('100.00');
  });

  it('should debit the wallet', () => {
    const wallet = Wallet.open('1', 'player-1', 'BRL');

    wallet.credit(Money.from('100.00', 'BRL'));
    wallet.debit(Money.from('30.00', 'BRL'));

    expect(wallet.balance.toDecimalString()).toBe('70.00');
  });

  it('should reject insufficient funds', () => {
    const wallet = Wallet.open('1', 'player-1', 'BRL');

    expect(() => {
      wallet.debit(Money.from('10.00', 'BRL'));
    }).toThrow('Insufficient funds');
  });

  it('should reject different currencies', () => {
    const wallet = Wallet.open('1', 'player-1', 'BRL');

    expect(() => {
      wallet.credit(Money.from('10.00', 'USD'));
    }).toThrow('Wallet currency mismatch');
  });

  it('should reject zero amounts', () => {
    const wallet = Wallet.open('1', 'player-1', 'BRL');

    expect(() => {
      wallet.credit(Money.from('0.00', 'BRL'));
    }).toThrow('Amount must be positive');
  });
});
