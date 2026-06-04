import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Force override any pre-existing DATABASE_URL
config({ override: true, path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
