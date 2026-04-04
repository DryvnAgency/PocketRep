import type { PageContent, ScanResult, AuthState, FormField, DeepScanResult, DeepReviewResult } from './types';

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

// ── Deep Scan Messages ──────────────────────────────────────────────────────

export interface DeepScanMessage {
  type: 'DEEP_SCAN';
}

export interface CancelDeepScanMessage {
  type: 'CANCEL_DEEP_SCAN';
}

export interface FindClickableMessage {
  type: 'FIND_CLICKABLE';
}

export interface ClickAndExtractMessage {
  type: 'CLICK_AND_EXTRACT';
  payload: { selector: string };
}

export interface DeepScanProgressMessage {
  type: 'DEEP_SCAN_PROGRESS';
  payload: { current: number; total: number; name: string };
}

export interface DeepScanCompleteMessage {
  type: 'DEEP_SCAN_COMPLETE';
  payload: DeepScanResult;
}

// ── Deep Review (Agent Mode) ──────────────────────────────────────────────

export interface ClickElementMessage {
  type: 'CLICK_ELEMENT';
  payload: { selector: string; text?: string };
}

export interface WaitAndExtractMessage {
  type: 'WAIT_AND_EXTRACT';
}

export interface GoBackMessage {
  type: 'GO_BACK';
}

export interface DeepReviewMessage {
  type: 'DEEP_REVIEW';
}

export interface CancelDeepReviewMessage {
  type: 'CANCEL_DEEP_REVIEW';
}

export interface DeepReviewProgressMessage {
  type: 'DEEP_REVIEW_PROGRESS';
  payload: { current: number; total: number; name: string };
}

export interface DeepReviewCompleteMessage {
  type: 'DEEP_REVIEW_COMPLETE';
  payload: DeepReviewResult;
}

// ── Side Panel ↔ Service Worker ──────────────────────────────────────────────

export interface AnalyzePageMessage {
  type: 'ANALYZE_PAGE';
}

export interface ScanResultsMessage {
  type: 'SCAN_RESULTS';
  payload: ScanResult;
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
  | ScanResultsMessage
  | ChatMessage
  | ChatResponseMessage
  | ConfirmInsertMessage
  | AuthStateMessage
  | ErrorMessage
  | StatusMessage
  | DeepScanMessage
  | CancelDeepScanMessage
  | FindClickableMessage
  | ClickAndExtractMessage
  | DeepScanProgressMessage
  | DeepScanCompleteMessage
  | ClickElementMessage
  | WaitAndExtractMessage
  | GoBackMessage
  | DeepReviewMessage
  | CancelDeepReviewMessage
  | DeepReviewProgressMessage
  | DeepReviewCompleteMessage;
