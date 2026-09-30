import { usageSummarySchema, type UsageSummaryResponse } from '@chat-tess/shared';
import { requestJson } from './http-client';

export async function fetchUsage(): Promise<UsageSummaryResponse> {
  return usageSummarySchema.parse(await requestJson('/usage'));
}
