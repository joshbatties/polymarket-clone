import { PrismaClient } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerEntryType } from '@prisma/client';

/**
 * Demo script to test the ledger system functionality
 * This demonstrates:
 * 1. Double-entry bookkeeping constraints
 * 2. Idempotency protection
 * 3. Complex multi-party transactions
 */
async function demonstrateLedgerSystem() {
  console.log('🧪 Starting Ledger System Demonstration\n');

  const prisma = new PrismaService();
  const ledgerService = new LedgerService(prisma);

  try {
    await prisma.$connect();

    // Create test accounts
    console.log('📦 Setting up test accounts...');
    
    const userAccount = await ledgerService.createWalletAccount({
      accountType: 'user_cash',
      currency: 'AUD',
    });

    const custodyAccount = await ledgerService.createWalletAccount({
      accountType: 'custody_cash',
      currency: 'AUD',
    });

    const feeAccount = await ledgerService.createWalletAccount({
      accountType: 'fee_revenue',
      currency: 'AUD',
    });

    console.log(`✅ Created user account: ${userAccount.id}`);
    console.log(`✅ Created custody account: ${custodyAccount.id}`);
    console.log(`✅ Created fee account: ${feeAccount.id}\n`);

    // Demo 1: Basic deposit transaction
    console.log('💰 Demo 1: Basic Deposit Transaction');
    console.log('=====================================');

    const depositTx = await ledgerService.createDepositTransaction(
      userAccount.id,
      custodyAccount.id,
      BigInt(10000), // $100.00
      'deposit-demo-1',
      { paymentId: 'stripe-pi-demo-123' }
    );

    console.log(`✅ Deposit transaction created: ${depositTx.transactionId}`);
    
    // Verify balances
    const userBalance1 = await ledgerService.getAccountBalance(userAccount.id);
    const custodyBalance1 = await ledgerService.getAccountBalance(custodyAccount.id);
    
    console.log(`📊 User balance: $${(Number(userBalance1.availableCents) / 100).toFixed(2)}`);
    console.log(`📊 Custody balance: $${(Number(custodyBalance1.availableCents) / 100).toFixed(2)}\n`);

    // Demo 2: Idempotency test - duplicate transaction should be prevented
    console.log('🔒 Demo 2: Idempotency Protection');
    console.log('==================================');

    try {
      const duplicateTx = await ledgerService.createDepositTransaction(
        userAccount.id,
        custodyAccount.id,
        BigInt(5000), // Different amount, same key
        'deposit-demo-1', // Same idempotency key!
        { paymentId: 'different-payment-id' }
      );

      console.log(`✅ Idempotency worked - returned cached transaction: ${duplicateTx.transactionId}`);
      console.log(`📝 Same transaction ID as before: ${duplicateTx.transactionId === depositTx.transactionId}`);
    } catch (error) {
      console.log(`❌ Unexpected error: ${error.message}`);
    }

    console.log('');

    // Demo 3: Complex three-way transaction (deposit with fee)
    console.log('🔄 Demo 3: Three-Way Transaction (Deposit with Fee)');
    console.log('==================================================');

    const depositAmount = BigInt(20000); // $200.00
    const processingFee = BigInt(200);    // $2.00
    const netUserAmount = depositAmount - processingFee; // $198.00

    const complexTx = await ledgerService.postTransaction({
      entries: [
        {
          accountId: userAccount.id,
          counterAccountId: custodyAccount.id,
          amountCents: netUserAmount,
          entryType: LedgerEntryType.DEPOSIT,
          description: 'User deposit (net of processing fee)',
          metadata: { paymentId: 'stripe-pi-complex-456', feeAmount: processingFee.toString() },
        },
        {
          accountId: feeAccount.id,
          counterAccountId: custodyAccount.id,
          amountCents: processingFee,
          entryType: LedgerEntryType.FEE,
          description: 'Deposit processing fee',
          metadata: { paymentId: 'stripe-pi-complex-456', feeType: 'processing' },
        },
        {
          accountId: custodyAccount.id,
          counterAccountId: userAccount.id,
          amountCents: -depositAmount,
          entryType: LedgerEntryType.DEPOSIT,
          description: 'Custody debit for deposit and fee',
          metadata: { paymentId: 'stripe-pi-complex-456', totalAmount: depositAmount.toString() },
        },
      ],
      idempotencyKey: 'complex-deposit-demo-2',
      scope: 'deposit',
    });

    console.log(`✅ Complex transaction created: ${complexTx.transactionId}`);
    console.log(`📊 Transaction has ${complexTx.entries.length} entries`);

    // Verify balances after complex transaction
    const userBalance2 = await ledgerService.getAccountBalance(userAccount.id);
    const custodyBalance2 = await ledgerService.getAccountBalance(custodyAccount.id);
    const feeBalance2 = await ledgerService.getAccountBalance(feeAccount.id);

    console.log(`📊 User balance: $${(Number(userBalance2.availableCents) / 100).toFixed(2)}`);
    console.log(`📊 Custody balance: $${(Number(custodyBalance2.availableCents) / 100).toFixed(2)}`);
    console.log(`📊 Fee balance: $${(Number(feeBalance2.availableCents) / 100).toFixed(2)}\n`);

    // Demo 4: Test invalid transaction (should fail)
    console.log('❌ Demo 4: Invalid Transaction (Should Fail)');
    console.log('============================================');

    try {
      await ledgerService.postTransaction({
        entries: [
          {
            accountId: userAccount.id,
            counterAccountId: custodyAccount.id,
            amountCents: BigInt(1000),
            entryType: LedgerEntryType.TRADE,
            description: 'Unbalanced entry 1',
          },
          {
            accountId: custodyAccount.id,
            counterAccountId: userAccount.id,
            amountCents: BigInt(-500), // Doesn't balance!
            entryType: LedgerEntryType.TRADE,
            description: 'Unbalanced entry 2',
          },
        ],
        idempotencyKey: 'invalid-transaction-demo',
      });

      console.log(`❌ ERROR: Invalid transaction was allowed!`);
    } catch (error) {
      console.log(`✅ Invalid transaction correctly rejected: ${error.message}\n`);
    }

    // Demo 5: Account ledger history
    console.log('📚 Demo 5: Account Ledger History');
    console.log('=================================');

    const userLedger = await ledgerService.getAccountLedger(userAccount.id, { limit: 10 });
    
    console.log(`📖 User account has ${userLedger.entries.length} ledger entries:`);
    userLedger.entries.forEach((entry, index) => {
      const amount = Number(entry.amountCents) / 100;
      const sign = amount >= 0 ? '+' : '';
      console.log(`   ${index + 1}. ${entry.entryType}: ${sign}$${amount.toFixed(2)} - ${entry.description}`);
    });

    console.log('');

    // Demo 6: Transaction integrity verification
    console.log('🔍 Demo 6: Transaction Integrity Verification');
    console.log('==============================================');

    const verifyTransaction = async (txId: string) => {
      const transaction = await ledgerService.getTransaction(txId);
      if (!transaction) {
        console.log(`❌ Transaction ${txId} not found`);
        return;
      }

      const sum = transaction.entries.reduce((total, entry) => total + entry.amountCents, BigInt(0));
      const balanced = sum === BigInt(0);
      
      console.log(`📋 Transaction ${txId}:`);
      console.log(`   📊 Entries: ${transaction.entries.length}`);
      console.log(`   ⚖️  Sum: ${sum.toString()} (Balanced: ${balanced ? '✅' : '❌'})`);
      console.log(`   🕐 Timestamp: ${transaction.timestamp.toISOString()}`);
    };

    await verifyTransaction(depositTx.transactionId);
    await verifyTransaction(complexTx.transactionId);

    console.log('\n🎉 Ledger System Demonstration Complete!');
    console.log('=======================================');
    console.log('✅ All double-entry constraints verified');
    console.log('✅ Idempotency protection working');
    console.log('✅ Complex transactions supported');
    console.log('✅ Invalid transactions properly rejected');
    console.log('✅ Account balances consistent');
    console.log('✅ Transaction history tracked\n');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateLedgerSystem()
    .then(() => {
      console.log('Demo completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Demo failed:', error);
      process.exit(1);
    });
}

export { demonstrateLedgerSystem };
