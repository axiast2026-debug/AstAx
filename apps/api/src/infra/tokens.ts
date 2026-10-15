/** Injection tokens. Every dependency is injected by token, never by reflected type. */
export const CONFIG = Symbol("CONFIG");
export const CLOCK = Symbol("CLOCK");
export const DB = Symbol("DB");
export const LOGGER = Symbol("LOGGER");
export const FIELD_CIPHER = Symbol("FIELD_CIPHER");
export const TOKEN_VERIFIER = Symbol("TOKEN_VERIFIER");
export const IDENTITY_ADMIN = Symbol("IDENTITY_ADMIN");
export const EMAIL_SENDER = Symbol("EMAIL_SENDER");
export const PLATE_LOOKUP = Symbol("PLATE_LOOKUP");
export const DOCUMENT_READER = Symbol("DOCUMENT_READER");
export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
export const SMS_SENDER = Symbol("SMS_SENDER");
