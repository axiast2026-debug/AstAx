import { loadEnv } from "@astax/shared/env";
import { createApp } from "./app.js";
import { loadConfig } from "./config/config.js";

loadEnv(import.meta.dirname);
const config = loadConfig(process.env);
const app = await createApp(config);
await app.listen(config.API_PORT, "127.0.0.1");
