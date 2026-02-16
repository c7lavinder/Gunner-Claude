import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.com/test',
          }),
        },
      },
    })),
  };
});

describe('Stripe Products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have subscription plans defined', async () => {
    const { SUBSCRIPTION_PLANS } = await import('./products');
    
    expect(SUBSCRIPTION_PLANS).toBeDefined();
    expect(Array.isArray(SUBSCRIPTION_PLANS)).toBe(true);
    expect(SUBSCRIPTION_PLANS.length).toBe(3);
  });

  it('should have starter, growth, and scale plans', async () => {
    const { SUBSCRIPTION_PLANS, getPlanByCode } = await import('./products');
    
    const starter = getPlanByCode('starter');
    const growth = getPlanByCode('growth');
    const scale = getPlanByCode('scale');
    
    expect(starter).toBeDefined();
    expect(growth).toBeDefined();
    expect(scale).toBeDefined();
  });

  it('should have correct pricing for each plan', async () => {
    const { getPlanByCode } = await import('./products');
    
    const starter = getPlanByCode('starter')!;
    const growth = getPlanByCode('growth')!;
    const scale = getPlanByCode('scale')!;
    
    expect(starter.priceMonthly).toBe(19900); // $199 in cents
    expect(growth.priceMonthly).toBe(49900); // $499 in cents
    expect(scale.priceMonthly).toBe(99900); // $999 in cents
  });

  it('should have correct features for starter plan', async () => {
    const { getPlanByCode } = await import('./products');
    
    const starter = getPlanByCode('starter')!;
    
    expect(starter.maxUsers).toBe(3);
    expect(starter.maxCrmIntegrations).toBe(1);
  });

  it('should have correct features for growth plan', async () => {
    const { getPlanByCode } = await import('./products');
    
    const growth = getPlanByCode('growth')!;
    
    expect(growth.maxUsers).toBe(10);
    expect(growth.maxCrmIntegrations).toBe(2);
    expect(growth.popular).toBe(true);
  });

  it('should have correct features for scale plan', async () => {
    const { getPlanByCode } = await import('./products');
    
    const scale = getPlanByCode('scale')!;
    
    expect(scale.maxUsers).toBe(999); // "unlimited"
    expect(scale.maxCrmIntegrations).toBe(5);
  });

  it('should format price correctly', async () => {
    const { formatPrice } = await import('./products');
    
    expect(formatPrice(19900)).toBe('$199');
    expect(formatPrice(49900)).toBe('$499');
    expect(formatPrice(99900)).toBe('$999');
  });

  it('should have trial days defined', async () => {
    const { TRIAL_DAYS } = await import('./products');
    
    expect(TRIAL_DAYS).toBe(14);
  });
});
