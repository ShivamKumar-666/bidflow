import { describe, it, expect, vi, beforeEach } from 'vitest';

// formatCurrency depends on i18n.language — mock it at module level
vi.mock('@/i18n', () => ({
  default: { language: 'en' },
}));

import { formatCurrency, CURRENCY_SYMBOLS, CURRENCIES } from '@/utils/formatCurrency';

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1000, 'USD')).toBe('$1,000');
  });

  it('formats zero as $0', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0');
  });

  it('handles null/undefined input as zero', () => {
    expect(formatCurrency(null, 'USD')).toBe('$0');
    expect(formatCurrency(undefined, 'USD')).toBe('$0');
  });

  it('formats EUR with euro symbol', () => {
    const result = formatCurrency(500, 'EUR');
    expect(result).toContain('500');
    expect(result).toContain('€');
  });

  it('defaults to USD for unknown currency codes', () => {
    const result = formatCurrency(100, 'XYZ');
    expect(result).toContain('$');
  });

  it('formats decimal amounts correctly', () => {
    const result = formatCurrency(1234.56, 'USD');
    expect(result).toContain('1,234');
    expect(result).toContain('56');
  });

  it('CURRENCY_SYMBOLS has an entry for every currency in CURRENCIES', () => {
    CURRENCIES.forEach((c) => {
      expect(CURRENCY_SYMBOLS[c]).toBeDefined();
    });
  });
});
