import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { DB_URL as DATABASE_URL } from "../utils/constants";

// Connection pooling is required for the adapter
const connectionUrl = new URL(DATABASE_URL);
const sslMode = connectionUrl.searchParams.get("sslmode");
const isLocal = ["localhost", "127.0.0.1"].includes(connectionUrl.hostname);

connectionUrl.searchParams.delete("sslmode");

const pool = new pg.Pool({
  connectionString: connectionUrl.toString(),
  ...((sslMode === "require" || (!isLocal && sslMode !== "disable")) && {
    ssl: {
      rejectUnauthorized: false,
    },
  }),
});
const prismaAdapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter: prismaAdapter,
});

export default prisma;
