import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Opt out of the global JWT guard (login, refresh, health, …). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
