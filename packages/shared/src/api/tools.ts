import { z } from 'zod';

export const toolSettingSchema = z.object({
  name: z.string(),
  description: z.string(),
  // 'connector' e 'mcp' estão reservados; a API hoje só expõe tools nativas.
  source: z.enum(['built_in', 'connector', 'mcp']),
  enabled: z.boolean(),
});
export type ToolSetting = z.infer<typeof toolSettingSchema>;

export const toolSettingListSchema = z.array(toolSettingSchema);
