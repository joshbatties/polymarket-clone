import { Test, TestingModule } from '@nestjs/testing';
import { PositionsService } from './positions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LmsrService } from '../../markets/services/lmsr.service';
import { MarketStatus, Outcome } from '@prisma/client';
import { Decimal } from 'decimal.js';

describe('PositionsService', () => {
  let service: PositionsService;
  let prismaService: jest.Mocked<PrismaService>;
  let lmsrService: jest.Mocked<LmsrService>;

  const mockUser = {
    id: 'user-123',
    email: 'trader@example.com',
  };

  const mockMarkets = [
    {
      id: 'market-1',
      slug: 'test-market-1',
      title: 'Test Market 1',
      status: MarketStatus.OPEN,
      closesAt: new Date('2024-12-31'),
      lmsrState: {
        id: 'lmsr-1',
        marketId: 'market-1',
        liquidityParam: '100',
        quantityYes: '20',
        quantityNo: '15',
        lastPriceYes: '0.6',
        lastPriceNo: '0.4',
      },
    },
    {
      id: 'market-2',
      slug: 'test-market-2',
      title: 'Test Market 2',
      status: MarketStatus.CLOSED,
      closesAt: new Date('2024-01-01'),
      resolution: Outcome.YES,
      lmsrState: {
        id: 'lmsr-2',
        marketId: 'market-2',
        liquidityParam: '100',
        quantityYes: '30',
        quantityNo: '10',
        lastPriceYes: '1.0',
        lastPriceNo: '0.0',
      },
    },
  ];

  const mockPositions = [
    {
      id: 'pos-1',
      userId: 'user-123',
      marketId: 'market-1',
      yesShares: new Decimal(10),
      noShares: new Decimal(0),
      avgPriceYes: new Decimal(0.55),
      avgPriceNo: new Decimal(0),
      totalInvested: BigInt(550),
      realizedPnl: BigInt(0),
      updatedAt: new Date(),
      market: mockMarkets[0],
    },
    {
      id: 'pos-2',
      userId: 'user-123',
      marketId: 'market-2',
      yesShares: new Decimal(5),
      noShares: new Decimal(0),
      avgPriceYes: new Decimal(0.5),
      avgPriceNo: new Decimal(0),
      totalInvested: BigInt(250),
      realizedPnl: BigInt(0),
      updatedAt: new Date(),
      market: mockMarkets[1],
    },
  ];

  const mockTrades = [
    {
      id: 'trade-1',
      marketId: 'market-1',
      userId: 'user-123',
      side: 'BUY',
      outcome: Outcome.YES,
      shares: '5',
      costCents: BigInt(250),
      feeCents: BigInt(2),
      fillPrice: 0.5,
      timestamp: new Date('2024-01-15T10:00:00Z'),
      market: {
        title: 'Test Market 1',
        slug: 'test-market-1',
      },
    },
    {
      id: 'trade-2',
      marketId: 'market-1',
      userId: 'user-123',
      side: 'BUY',
      outcome: Outcome.YES,
      shares: '5',
      costCents: BigInt(300),
      feeCents: BigInt(3),
      fillPrice: 0.6,
      timestamp: new Date('2024-01-16T14:30:00Z'),
      market: {
        title: 'Test Market 1',
        slug: 'test-market-1',
      },
    },
    {
      id: 'trade-3',
      marketId: 'market-2',
      userId: 'user-123',
      side: 'BUY',
      outcome: Outcome.YES,
      shares: '5',
      costCents: BigInt(250),
      feeCents: BigInt(2),
      fillPrice: 0.5,
      timestamp: new Date('2024-01-10T09:00:00Z'),
      market: {
        title: 'Test Market 2',
        slug: 'test-market-2',
      },
    },
  ];

  beforeEach(async () => {
    const mockPrismaService = {
      position: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        findFirstOrThrow: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      trade: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        findFirstOrThrow: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      market: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        findFirstOrThrow: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    const mockLmsrService = {
      fromDbString: jest.fn(),
      toApiNumber: jest.fn(),
      calculatePrices: jest.fn(),
      calculateSellCost: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LmsrService, useValue: mockLmsrService },
      ],
    }).compile();

    service = module.get<PositionsService>(PositionsService);
    prismaService = module.get(PrismaService);
    lmsrService = module.get(LmsrService);

    // Setup default LMSR service mocks
    lmsrService.fromDbString.mockImplementation((value: string) => new Decimal(value));
    lmsrService.toApiNumber.mockImplementation((value: Decimal) => value.toNumber());
  });

  describe('getUserPositions', () => {
    it('should return user positions with calculated P&L', async () => {
      (prismaService.position.findMany as jest.Mock).mockResolvedValue(mockPositions);

      // Mock current market prices
      lmsrService.calculatePrices.mockReturnValue({
        priceYes: new Decimal(0.6),
        priceNo: new Decimal(0.4),
        totalProbability: new Decimal(1),
      });

      const result = await service.getUserPositions('user-123');

      expect(result.positions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.summary).toBeDefined();
      
      // Test that positions are returned with P&L data
      const firstPosition = result.positions[0];
      expect(firstPosition.position).toBeDefined();
      expect(firstPosition.market).toBeDefined();
      expect(firstPosition.pnl).toBeDefined();
      expect(firstPosition.pnl.currentValue).toBeGreaterThanOrEqual(0);
    });

    it('should return empty result when user has no positions', async () => {
      (prismaService.position.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getUserPositions('user-123');

      expect(result.positions).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getUserTrades', () => {
    it('should return user trade history', async () => {
      (prismaService.trade.findMany as jest.Mock).mockResolvedValue(mockTrades);

      const result = await service.getUserTrades('user-123');

      expect(result.trades).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter trades by market', async () => {
      const market1Trades = mockTrades.filter(t => t.marketId === 'market-1');
      (prismaService.trade.findMany as jest.Mock).mockResolvedValue(market1Trades);

      const result = await service.getUserTrades('user-123', { marketId: 'market-1' });

      expect(result.trades).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('getPortfolioSummary', () => {
    it('should calculate portfolio summary correctly', async () => {
      (prismaService.position.findMany as jest.Mock).mockResolvedValue(mockPositions);

      lmsrService.calculatePrices.mockReturnValue({
        priceYes: new Decimal(0.6),
        priceNo: new Decimal(0.4),
        totalProbability: new Decimal(1),
      });

      const result = await service.getPortfolioSummary('user-123');

      expect(result.totalPositions).toBe(2);
      expect(result.totalValue).toBeGreaterThanOrEqual(0);
      expect(result.totalPnL).toBeDefined();
      expect(result.totalPnLPercentage).toBeDefined();
      expect(result.cashBalance).toBeGreaterThanOrEqual(0);
    });

    it('should handle portfolio with no positions', async () => {
      (prismaService.position.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getPortfolioSummary('user-123');

      expect(result.totalPositions).toBe(0);
      expect(result.totalValue).toBe(0);
      expect(result.totalPnL).toBe(0);
    });
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });
});
