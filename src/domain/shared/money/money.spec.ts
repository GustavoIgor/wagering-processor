import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('should add monetary values correctly', () => {
    const a = Money.from('10.50', 'BRL');
    const b = Money.from('5.25', 'BRL');

    expect(a.add(b).toDecimalString()).toBe('15.75');
  });

  it('should subtract monetary values correctly', () => {
    const a = Money.from('10.00', 'BRL');
    const b = Money.from('3.50', 'BRL');

    expect(a.subtract(b).toDecimalString()).toBe('6.50');
  });

  it('should preserve decimal precision', () => {
    const a = Money.from('0.10', 'BRL');
    const b = Money.from('0.20', 'BRL');

    expect(a.add(b).toDecimalString()).toBe('0.30');
  });

  it('should reject different currencies', () => {
    const a = Money.from('10.00', 'BRL');
    const b = Money.from('10.00', 'USD');

    expect(() => a.add(b)).toThrow('Currency mismatch');
  });

  it('should reject invalid monetary values', () => {
    expect(() => Money.from('10.999', 'BRL')).toThrow();
  });

  it('should reject invalid currencies', () => {
    expect(() => Money.from('10.00', 'BR')).toThrow();
  });
});
