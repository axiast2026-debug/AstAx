import { loadEnv } from "@astax/shared/env";
import { defineConfig } from "prisma/config";

loadEnv(import.meta.dirname);

// Migrations always run as astax_owner; API and worker connect as astax_app.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_OWNER_URL ?? "" },
});
