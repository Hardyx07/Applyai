// Auth types from backend schemas
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
}

export interface User {
  user_id: string;
  email: string;
}

// Profile types
export interface ProfileData {
  name?: string;
  phone?: string;
  location?: string;
  bio?: string;
  resume_text?: string;
}

export interface ProfileResponse {
  user_id: string;
  data: ProfileData;
  ingested_at?: string | null;
}

export type ProfileSchema = ProfileData;

// Validation types
export interface ValidateKeysResponse {
  gemini_valid: boolean;
  cohere_valid: boolean;
  detail: string;
}

export interface SaveKeysResponse {
  gemini_valid: boolean;
  cohere_valid: boolean;
  saved: boolean;
  detail: string;
}

export interface SavedKeysResponse {
  gemini_api_key: string | null;
  cohere_api_key: string | null;
  has_saved_keys: boolean;
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
  processed_sections?: string[];
  parent_chunks?: number;
  child_chunks?: number;
  embedded_chunks?: number;
  ingested_at?: string;
  chunks_created?: number;
}

// Error response
export interface ErrorResponse {
  detail: string | Array<{ msg: string; loc: string[] }>;
}
