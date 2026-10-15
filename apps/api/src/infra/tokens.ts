/** Injection tokens. Every dependency is injected by token, never by reflected type. */
export const CONFIG = Symbol("CONFIG");
export const CLOCK = Symbol("CLOCK");
export const DB = Symbol("DB");
export const LOGGER = Symbol("LOGGER");
export const FIELD_CIPHER = Symbol("FIELD_CIPHER");
