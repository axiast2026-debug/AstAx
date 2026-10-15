import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type DbClient = PrismaClient;
export type DbTransaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Client for API and worker. Always connect as astax_app (DATABASE_URL), so
 * row level security applies; the owner URL is for migrations and seed only.
 */
export function createDbClient(connectionString: string): DbClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
