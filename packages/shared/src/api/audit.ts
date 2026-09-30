import { z } from 'zod';

export const auditEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  actorUserId: z.string().nullable(),
  payload: z.unknown(),
  occurredAt: z.string(),
});
export type AuditEventResponse = z.infer<typeof auditEventSchema>;

export const auditEventListSchema = z.array(auditEventSchema);

export const auditEventQuerySchema = z.object({
  actorUserId: z.string().optional(),
  type: z.string().optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
