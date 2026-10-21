import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Keep at most one disconnected client to reuse its WASM compiler constructor.
// Never retain sockets: PrismaPg(config) creates a new pool on each reconnect,
// and $disconnect() closes that pool before the client becomes reusable.
let idle: { connectionString: string; db: PrismaClient } | undefined;

export async function withRequestDatabase<T>(
  connectionString: string,
  action: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  const db =
    idle?.connectionString === connectionString
      ? idle.db
      : new PrismaClient({
          adapter: new PrismaPg({ connectionString, max: 1 }),
        });
  idle = undefined;
  let succeeded = false;
  try {
    const result = await action(db);
    succeeded = true;
    return result;
  } finally {
    await db.$disconnect();
    if (succeeded && !idle) idle = { connectionString, db };
  }
}
