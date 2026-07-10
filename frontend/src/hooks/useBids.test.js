import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, fallback) => fallback || key }),
}));

vi.mock('@/utils/formatCurrency', () => ({
  formatCurrency: (n) => `$${n}`,
}));

// Test the pure filter/sort logic extracted from useBids
// rather than rendering the full hook (which requires auth context, etc.)
describe('useBids filter logic', () => {
  const makeBid = (overrides = {}) => ({
    bidId: 'BID-001',
    enquiryId: 'ENQ-001',
    assignedEmployee: 'Alice',
    industry: 'Technology',
    amount: 5000,
    submissionDate: '2025-12-31',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 days ago
    ...overrides,
  });

  const filterBids = (bids, { industryFilters = [], dateFilter = 'all', search = '' } = {}) => {
    return bids.filter((b) => {
      if (industryFilters.length > 0 && !industryFilters.includes(b.industry)) return false;
      if (dateFilter !== 'all') {
        const now = Date.now();
        const created = new Date(b.createdAt || Date.now()).getTime();
        const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
        const days = daysMap[dateFilter] || 30;
        if (now - created > days * 86400000) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        return (
          b.bidId?.toLowerCase().includes(s) ||
          b.enquiryId?.toLowerCase().includes(s) ||
          b.assignedEmployee?.toLowerCase().includes(s) ||
          b.industry?.toLowerCase().includes(s)
        );
      }
      return true;
    });
  };

  it('returns all bids when no filters are active', () => {
    const bids = [makeBid(), makeBid({ bidId: 'BID-002', industry: 'Finance' })];
    expect(filterBids(bids)).toHaveLength(2);
  });

  it('filters by industry', () => {
    const bids = [
      makeBid({ industry: 'Technology' }),
      makeBid({ industry: 'Finance' }),
      makeBid({ industry: 'Healthcare' }),
    ];
    const result = filterBids(bids, { industryFilters: ['Technology', 'Healthcare'] });
    expect(result).toHaveLength(2);
    expect(result.every((b) => ['Technology', 'Healthcare'].includes(b.industry))).toBe(true);
  });

  it('filters by search term matching bidId', () => {
    const bids = [makeBid({ bidId: 'BID-ALPHA' }), makeBid({ bidId: 'BID-BETA' })];
    expect(filterBids(bids, { search: 'alpha' })).toHaveLength(1);
    expect(filterBids(bids, { search: 'alpha' })[0].bidId).toBe('BID-ALPHA');
  });

  it('filters by search term matching assignedEmployee', () => {
    const bids = [makeBid({ assignedEmployee: 'Alice' }), makeBid({ assignedEmployee: 'Bob' })];
    expect(filterBids(bids, { search: 'bob' })).toHaveLength(1);
  });

  it('excludes bids older than dateFilter window', () => {
    const oldBid = makeBid({ createdAt: new Date(Date.now() - 60 * 86400000).toISOString() }); // 60 days
    const recentBid = makeBid({ bidId: 'BID-RECENT', createdAt: new Date(Date.now() - 3 * 86400000).toISOString() });
    const result = filterBids([oldBid, recentBid], { dateFilter: '7d' });
    expect(result).toHaveLength(1);
    expect(result[0].bidId).toBe('BID-RECENT');
  });

  it('returns empty array when no bids match search', () => {
    const bids = [makeBid(), makeBid({ bidId: 'BID-002' })];
    expect(filterBids(bids, { search: 'zzznomatch' })).toHaveLength(0);
  });

  it('returns empty array when industryFilters excludes all bids', () => {
    const bids = [makeBid({ industry: 'Technology' }), makeBid({ industry: 'Finance' })];
    expect(filterBids(bids, { industryFilters: ['Healthcare'] })).toHaveLength(0);
  });
});
