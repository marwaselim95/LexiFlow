import { type PrismaClient } from '@prisma/client';

/**
 * Prisma transaction client type.
 * Represents the `tx` object passed to $transaction callbacks,
 * providing access to all Prisma models within a transaction scope.
 */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
