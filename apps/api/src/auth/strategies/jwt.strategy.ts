import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Env } from "../../config/config.schema";
import type { AuthPrincipal } from "../principal";

interface AccessTokenPayload {
  sub: number;
  username: string;
  roles: AuthPrincipal["roles"];
  capabilities: string[];
  territories: AuthPrincipal["territories"];
  mfa: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AuthPrincipal {
    return {
      id: payload.sub,
      username: payload.username,
      roles: payload.roles,
      capabilities: payload.capabilities,
      territories: payload.territories,
      mfa: payload.mfa,
    };
  }
}
