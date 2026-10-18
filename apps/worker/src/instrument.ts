// Loaded first by main.ts (phase 8): the environment, then the telemetry,
// before any module that opens HTTP connections is evaluated.
import { loadEnv } from "@astax/shared/env";
import { startTelemetry } from "./telemetry.js";

loadEnv(import.meta.dirname);
startTelemetry("worker");
