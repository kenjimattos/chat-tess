import type { Database } from '../../../shared/database/database';
import type { Prisma } from '../../../generated/prisma/client';
import { compactPayload } from '../../audit/domain/audit-payload';
import type { ToolCallLog, ToolCallRecord, ToolCatalog } from '../domain/tool-call-log';

export class PrismaToolCallLog implements ToolCallLog, ToolCatalog {
  constructor(private readonly database: Database) {}

  async record(call: ToolCallRecord): Promise<void> {
    await this.database.toolCall.create({
      data: {
        userId: call.userId,
        conversationId: call.conversationId,
        callId: call.callId,
        toolName: call.toolName,
        input: call.input as Prisma.InputJsonValue,
        // Resultados podem ser páginas inteiras: guarda uma versão compacta.
        output: compactPayload(call.output) as Prisma.InputJsonValue,
        status: call.isError ? 'FAILED' : 'SUCCEEDED',
        errorMessage: call.isError ? String(call.output).slice(0, 1000) : null,
        durationMs: call.durationMs,
        createdAt: call.occurredAt,
      },
    });
  }

  async sync(tools: Parameters<ToolCatalog['sync']>[0]): Promise<void> {
    await this.database.$transaction(
      tools.map(({ name, description, inputSchema, source }) => {
        const data = {
          description,
          inputSchema: inputSchema as Prisma.InputJsonValue,
          source: source === 'built_in' ? ('BUILT_IN' as const) : ('CONNECTOR' as const),
        };
        return this.database.tool.upsert({
          where: { name },
          create: { name, ...data },
          update: data,
        });
      }),
    );
  }
}
