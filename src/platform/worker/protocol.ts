import type { AnalyzeResult } from '../image/types';

export interface AnalyzeRequest {
  id: string;
  file: File;
}

export type AnalyzeResponse = { id: string; ok: true; result: AnalyzeResult } | { id: string; ok: false; error: string };
