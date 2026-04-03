import type { PageContent, RexSuggestion, AuthState, FormField } from './types';

// ── Content Script → Service Worker ──────────────────────────────────────────

export interface PageContentMessage {
  type: 'PAGE_CONTENT';
  payload: PageContent;
}

export interface FieldDetectedMessage {
  type: 'FIELD_DETECTED';
  payload: FormField[];
}

export interface InsertDoneMessage {
  type: 'INSERT_DONE';
  payload: { selector: string; success: boolean };
}

// ── Service Worker → Content Script ──────────────────────────────────────────

export interface ScrollMessage {
  type: 'SCROLL';
  payload: { direction: 'up' | 'down' };
}

export interface InsertTextMessage {
  type: 'INSERT_TEXT';
  payload: { selector: string; text: string };
}

export interface HighlightFieldMessage {
  type: 'HIGHLIGHT_FIELD';
  payload: { selector: string; highlight: boolean };
}

export interface ExtractPageMessage {
  type: 'EXTRACT_PAGE';
}

export interface DetectFieldsMessage {
  type: 'DETECT_FIELDS';
}

// ── Side Panel ↔ Service Worker ──────────────────────────────────────────────

export interface AnalyzePageMessage {
  type: 'ANALYZE_PAGE';
}

export interface SuggestionsReadyMessage {
  type: 'SUGGESTIONS_READY';
  payload: RexSuggestion;
}

export interface ChatMessage {
  type: 'CHAT_MESSAGE';
  payload: { role: 'user'; content: string };
}

export interface ChatResponseMessage {
  type: 'CHAT_RESPONSE';
  payload: { role: 'assistant'; content: string };
}

export interface ConfirmInsertMessage {
  type: 'CONFIRM_INSERT';
  payload: { selector: string; text: string };
}

export interface AuthStateMessage {
  type: 'AUTH_STATE';
  payload: AuthState;
}

export interface ErrorMessage {
  type: 'ERROR';
  payload: { message: string };
}

export interface StatusMessage {
  type: 'STATUS';
  payload: { status: 'idle' | 'scanning' | 'analyzing' | 'ready' | 'error'; message?: string };
}

export type ExtensionMessage =
  | PageContentMessage
  | FieldDetectedMessage
  | InsertDoneMessage
  | ScrollMessage
  | InsertTextMessage
  | HighlightFieldMessage
  | ExtractPageMessage
  | DetectFieldsMessage
  | AnalyzePageMessage
  | SuggestionsReadyMessage
  | ChatMessage
  | ChatResponseMessage
  | ConfirmInsertMessage
  | AuthStateMessage
  | ErrorMessage
  | StatusMessage;
