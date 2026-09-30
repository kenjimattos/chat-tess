import { toolSettingListSchema, type ToolSetting } from '@chat-tess/shared';
import { requestJson, sendJson } from './http-client';

export async function listTools(): Promise<ToolSetting[]> {
  return toolSettingListSchema.parse(await requestJson('/tools'));
}

export async function setToolEnabled(toolName: string, enabled: boolean): Promise<void> {
  await sendJson(`/tools/${encodeURIComponent(toolName)}`, 'PUT', { enabled });
}
