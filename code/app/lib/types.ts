// Auth types from backend schemas
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  user_id: string;
  email: string;
}

// Profile types
export interface ProfileSchema {
  user_id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  bio?: string;
  resume_text?: string;
}

// Validation types
export interface ValidationResponse {
  valid: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

// Generated answer types
export interface GenerateResponse {
  answer: string;
  sources?: Array<{
    title: string;
    content: string;
    score: number;
  }>;
}

// Ingest response
export interface IngestResponse {
  status: string;
  message?: string;
  chunks_created?: number;
}

// Error response
export interface ErrorResponse {
  detail: string | Array<{ msg: string; loc: string[] }>;
}
