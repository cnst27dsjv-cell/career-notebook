import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.SEEDING !== "true",
  },
  trustedOrigins: [
    process.env.APP_URL || "http://localhost:3040",
    "http://127.0.0.1:3040",
  ],
  rateLimit: { enabled: true, window: 60, max: 60 },
});
