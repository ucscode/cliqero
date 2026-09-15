export interface AuditRecordInput {
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  previousState: object | null;
  newState: object;
}

export interface AuditRecorder {
  record(input: AuditRecordInput): Promise<void>;
}
