import { z } from 'zod';

export const TREND_CATEGORIES = ['ai', 'consumer', 'life', 'invest'] as const;
export type TrendCategory = (typeof TREND_CATEGORIES)[number];

export const TrendItemSchema = z.object({
  category: z.enum(TREND_CATEGORIES),
  region: z.enum(['국내', '해외']),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),
  ideaAngle: z.string().min(1).max(200),
  sourceName: z.string().min(1).max(60),
  sourceUrl: z.string(),
  publishedAt: z.string(),
});
export type TrendItem = z.infer<typeof TrendItemSchema>;
export const TrendsResultSchema = z.object({ items: z.array(TrendItemSchema).min(1).max(12) });

const { $schema: _ignored, ...trendsJsonSchema } = z.toJSONSchema(TrendsResultSchema) as Record<string, unknown>;
export const TRENDS_JSON_SCHEMA = trendsJsonSchema as { type: string; required: string[]; [key: string]: unknown };

export interface TrendDigest {
  date: string;
  items: TrendItem[];
  model: string;
  createdAt: string;
}
export interface TrendsResponse {
  digests: TrendDigest[];
  collecting: boolean;
  error: string | null;
  hasMore: boolean;
}
