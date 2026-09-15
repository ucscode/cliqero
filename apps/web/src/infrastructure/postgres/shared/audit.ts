import type { AuditRecordInput, AuditRecorder } from "@/application/shared/audit";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";

export class PostgresAuditRecorder implements AuditRecorder {
  constructor(private readonly sql: QueryExecutor) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.sql.query(
      `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
       values((select id from identity_capability.accounts where uuid=$1),$2,$3,$4,$5::jsonb,$6::jsonb,gen_random_uuid())`,
      [
        input.actorId,
        input.action,
        input.subjectType,
        input.subjectId,
        input.previousState ? JSON.stringify(input.previousState) : null,
        JSON.stringify(input.newState),
      ],
    );
  }
}
