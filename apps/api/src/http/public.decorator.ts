import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "astax:public";

/**
 * Marks an endpoint that needs no authentication (health check, OpenAPI).
 * Everything else is denied unless a guard grants it (SIC-01).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
