import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { sql } from "kysely";
import { Observable, firstValueFrom, from } from "rxjs";
import type { AuthPrincipal } from "../../auth/principal";
import { KYSELY, type DB } from "../../database/database.module";
import { runInTransaction } from "../../database/transaction.context";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function setAuditGucs(
  tx: DB,
  user: AuthPrincipal | undefined,
): Promise<void> {
  if (!user) return;
  await sql`SELECT set_config('app.current_user_id', ${String(user.id)}, true)`.execute(
    tx,
  );
  await sql`SELECT set_config('app.current_role_code', ${user.roles[0] ?? ""}, true)`.execute(
    tx,
  );
  await sql`SELECT set_config('app.source', ${"API"}, true)`.execute(tx);
}

/**
 * Pins a single connection + transaction for state-changing requests and sets
 * audit session GUCs (D-9 / 003 / 005 R5).
 */
@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      user?: AuthPrincipal;
    }>();

    if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
      return next.handle();
    }

    return from(
      this.db.transaction().execute(async (tx) => {
        await setAuditGucs(tx, request.user);
        return runInTransaction(tx, () => firstValueFrom(next.handle()));
      }),
    );
  }
}
