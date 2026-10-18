import "./instrument.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config/config.js";

const config = loadConfig(process.env);
const app = await createApp(config);
await app.listen(config.API_PORT, "127.0.0.1");
