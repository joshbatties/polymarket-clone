import { PrismaClient, UserRole, AccountStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create admin user
  console.log('👤 Creating admin user...');
  
  const adminPassword = 'AdminPass123!'; // This should be changed in production
  const hashedPassword = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 1,
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@aussie-markets.com' },
    update: {},
    create: {
      email: 'admin@aussie-markets.com',
      passwordHash: hashedPassword,
      role: UserRole.ADMIN,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      firstName: 'Admin',
      lastName: 'User',
      isActive: true,
    },
  });

  console.log(`✅ Admin user created: ${adminUser.email} (ID: ${adminUser.id})`);

  // 2. Create system wallet accounts
  console.log('💰 Creating system wallet accounts...');

  // Custody account - holds all user deposits
  const custodyAccount = await prisma.walletAccount.upsert({
    where: { 
      userId_accountType_currency: {
        userId: null as any, // System account - no user owner
        accountType: 'custody_cash',
        currency: 'AUD',
      }
    },
    update: {},
    create: {
      userId: null, // System account
      accountType: 'custody_cash',
      currency: 'AUD',
      status: AccountStatus.ACTIVE,
      availableCents: BigInt(0),
      pendingCents: BigInt(0),
    },
  });

  console.log(`✅ Custody account created: ${custodyAccount.id}`);

  // Fee revenue account - collects all platform fees
  const feeRevenueAccount = await prisma.walletAccount.upsert({
    where: { 
      userId_accountType_currency: {
        userId: null as any, // System account - no user owner
        accountType: 'fee_revenue',
        currency: 'AUD',
      }
    },
    update: {},
    create: {
      userId: null, // System account
      accountType: 'fee_revenue',
      currency: 'AUD',
      status: AccountStatus.ACTIVE,
      availableCents: BigInt(0),
      pendingCents: BigInt(0),
    },
  });

  console.log(`✅ Fee revenue account created: ${feeRevenueAccount.id}`);

  // Market liquidity pool account - holds market maker liquidity
  const liquidityPoolAccount = await prisma.walletAccount.upsert({
    where: { 
      userId_accountType_currency: {
        userId: null as any, // System account - no user owner
        accountType: 'liquidity_pool',
        currency: 'AUD',
      }
    },
    update: {},
    create: {
      userId: null, // System account
      accountType: 'liquidity_pool',
      currency: 'AUD',
      status: AccountStatus.ACTIVE,
      availableCents: BigInt(0),
      pendingCents: BigInt(0),
    },
  });

  console.log(`✅ Liquidity pool account created: ${liquidityPoolAccount.id}`);

  // Withdrawal pending account - holds funds pending withdrawal
  const withdrawalPendingAccount = await prisma.walletAccount.upsert({
    where: { 
      userId_accountType_currency: {
        userId: null as any, // System account - no user owner
        accountType: 'withdrawal_pending',
        currency: 'AUD',
      }
    },
    update: {},
    create: {
      userId: null, // System account
      accountType: 'withdrawal_pending',
      currency: 'AUD',
      status: AccountStatus.ACTIVE,
      availableCents: BigInt(0),
      pendingCents: BigInt(0),
    },
  });

  console.log(`✅ Withdrawal pending account created: ${withdrawalPendingAccount.id}`);

  // 3. Create admin user's cash account
  console.log('👤 Creating admin user cash account...');

  const adminCashAccount = await prisma.walletAccount.upsert({
    where: { 
      userId_accountType_currency: {
        userId: adminUser.id,
        accountType: 'user_cash',
        currency: 'AUD',
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      accountType: 'user_cash',
      currency: 'AUD',
      status: AccountStatus.ACTIVE,
      availableCents: BigInt(0),
      pendingCents: BigInt(0),
    },
  });

  console.log(`✅ Admin cash account created: ${adminCashAccount.id}`);

  // 4. Create a test user for development
  if (process.env.NODE_ENV === 'development') {
    console.log('🧪 Creating test user for development...');

    const testPassword = 'TestUser123!';
    const testHashedPassword = await argon2.hash(testPassword, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64MB
      timeCost: 3,
      parallelism: 1,
    });

    const testUser = await prisma.user.upsert({
      where: { email: 'test@aussie-markets.com' },
      update: {},
      create: {
        email: 'test@aussie-markets.com',
        passwordHash: testHashedPassword,
        role: UserRole.USER,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
      },
    });

    console.log(`✅ Test user created: ${testUser.email} (ID: ${testUser.id})`);

    // Create test user's cash account
    const testUserCashAccount = await prisma.walletAccount.upsert({
      where: { 
        userId_accountType_currency: {
          userId: testUser.id,
          accountType: 'user_cash',
          currency: 'AUD',
        }
      },
      update: {},
      create: {
        userId: testUser.id,
        accountType: 'user_cash',
        currency: 'AUD',
        status: AccountStatus.ACTIVE,
        availableCents: BigInt(10000), // Give test user $100 for testing
        pendingCents: BigInt(0),
      },
    });

    console.log(`✅ Test user cash account created: ${testUserCashAccount.id} with $100.00`);
  }

  // 5. Create sample markets for development
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Creating sample markets for development...');

    const sampleMarket = await prisma.market.upsert({
      where: { slug: 'aus-election-2025' },
      update: {},
      create: {
        slug: 'aus-election-2025',
        title: 'Will Labor win the 2025 Australian Federal Election?',
        description: 'This market resolves to YES if the Australian Labor Party wins the most seats in the House of Representatives in the 2025 federal election.',
        category: 'Politics',
        outcomeType: 'BINARY',
        status: 'DRAFT',
        minTradeCents: BigInt(100), // $1 minimum
        maxTradeCents: BigInt(100000), // $1,000 maximum
        totalVolumeCents: BigInt(0),
        liquidityPoolCents: BigInt(10000), // $100 initial liquidity
        openAt: new Date('2024-06-01'),
        closeAt: new Date('2025-05-01'),
        resolveAt: new Date('2025-05-15'),
        creatorId: adminUser.id,
      },
    });

    console.log(`✅ Sample market created: ${sampleMarket.title} (${sampleMarket.slug})`);

    // Create LMSR state for the market
    await prisma.lmsrState.upsert({
      where: { marketId: sampleMarket.id },
      update: {},
      create: {
        marketId: sampleMarket.id,
        liquidityParam: 100, // B parameter for LMSR
        quantityYes: 0,
        quantityNo: 0,
        lastPriceYes: 0.5, // Start at 50%
        lastPriceNo: 0.5,
      },
    });

    console.log(`✅ LMSR state created for market: ${sampleMarket.slug}`);
  }

  console.log('🎉 Database seed completed successfully!');

  // Print summary
  console.log('\n📋 Seed Summary:');
  console.log('================');
  console.log(`👤 Admin user: admin@aussie-markets.com (password: ${adminPassword})`);
  console.log(`💰 System accounts created: custody_cash, fee_revenue, liquidity_pool, withdrawal_pending`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🧪 Test user: test@aussie-markets.com (password: TestUser123!) with $100.00`);
    console.log(`📊 Sample market: aus-election-2025`);
  }
  
  console.log('\n⚠️  IMPORTANT: Change the admin password in production!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
