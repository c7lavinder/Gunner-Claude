/**
 * Setup Stripe Products and Prices for Gunner
 * 
 * This script creates the Stripe products and prices for each subscription tier,
 * then updates the database plans with the Stripe price IDs.
 * 
 * Run with: node scripts/setup-stripe-products.mjs
 */

import Stripe from 'stripe';
import mysql from 'mysql2/promise';

// Load environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!STRIPE_SECRET_KEY) {
  console.error('Error: STRIPE_SECRET_KEY environment variable is not set');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2026-01-28.clover',
});

// Plan definitions
const PLANS = [
  {
    code: 'starter',
    name: 'Gunner Starter',
    description: 'Perfect for small teams getting started with AI call coaching',
    priceMonthly: 9900, // $99
    priceYearly: 99000, // $990 (2 months free)
  },
  {
    code: 'growth',
    name: 'Gunner Growth',
    description: 'For growing teams that need more users and advanced features',
    priceMonthly: 24900, // $249
    priceYearly: 249000, // $2,490 (2 months free)
  },
  {
    code: 'scale',
    name: 'Gunner Scale',
    description: 'Enterprise-grade features for large organizations',
    priceMonthly: 49900, // $499
    priceYearly: 499000, // $4,990 (2 months free)
  },
];

async function main() {
  console.log('🚀 Setting up Stripe products and prices for Gunner...\n');

  // Parse DATABASE_URL
  const dbUrl = new URL(DATABASE_URL);
  const connection = await mysql.createConnection({
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port) || 3306,
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.slice(1),
    ssl: {
      rejectUnauthorized: false,
    },
  });

  console.log('✅ Connected to database\n');

  const results = [];

  for (const plan of PLANS) {
    console.log(`\n📦 Processing ${plan.name}...`);

    // Check if product already exists
    const existingProducts = await stripe.products.search({
      query: `name:'${plan.name}'`,
    });

    let product;
    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      console.log(`  ✓ Found existing product: ${product.id}`);
    } else {
      // Create product
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: {
          plan_code: plan.code,
        },
      });
      console.log(`  ✓ Created product: ${product.id}`);
    }

    // Check for existing prices
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
    });

    let monthlyPrice = existingPrices.data.find(
      (p) => p.recurring?.interval === 'month' && p.unit_amount === plan.priceMonthly
    );
    let yearlyPrice = existingPrices.data.find(
      (p) => p.recurring?.interval === 'year' && p.unit_amount === plan.priceYearly
    );

    // Create monthly price if not exists
    if (!monthlyPrice) {
      monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.priceMonthly,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
        metadata: {
          plan_code: plan.code,
          billing_period: 'monthly',
        },
      });
      console.log(`  ✓ Created monthly price: ${monthlyPrice.id} ($${plan.priceMonthly / 100}/mo)`);
    } else {
      console.log(`  ✓ Found existing monthly price: ${monthlyPrice.id}`);
    }

    // Create yearly price if not exists
    if (!yearlyPrice) {
      yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.priceYearly,
        currency: 'usd',
        recurring: {
          interval: 'year',
        },
        metadata: {
          plan_code: plan.code,
          billing_period: 'yearly',
        },
      });
      console.log(`  ✓ Created yearly price: ${yearlyPrice.id} ($${plan.priceYearly / 100}/yr)`);
    } else {
      console.log(`  ✓ Found existing yearly price: ${yearlyPrice.id}`);
    }

    results.push({
      code: plan.code,
      productId: product.id,
      monthlyPriceId: monthlyPrice.id,
      yearlyPriceId: yearlyPrice.id,
    });

    // Update database
    console.log(`  📝 Updating database...`);
    await connection.execute(
      `UPDATE subscription_plans 
       SET stripePriceIdMonthly = ?, stripePriceIdYearly = ?
       WHERE code = ?`,
      [monthlyPrice.id, yearlyPrice.id, plan.code]
    );
    console.log(`  ✓ Database updated for ${plan.code}`);
  }

  await connection.end();

  console.log('\n\n✅ Setup complete! Here are your Stripe IDs:\n');
  console.log('┌────────────┬────────────────────────────────┬────────────────────────────────┐');
  console.log('│ Plan       │ Monthly Price ID               │ Yearly Price ID                │');
  console.log('├────────────┼────────────────────────────────┼────────────────────────────────┤');
  for (const r of results) {
    console.log(`│ ${r.code.padEnd(10)} │ ${r.monthlyPriceId.padEnd(30)} │ ${r.yearlyPriceId.padEnd(30)} │`);
  }
  console.log('└────────────┴────────────────────────────────┴────────────────────────────────┘');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
