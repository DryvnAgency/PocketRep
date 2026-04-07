import type { PageContent, AuthState, DeepReviewResult, StructuredTask } from './types';

// ── Content Script → Service Worker ──────────────────────────────────────────

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

export interface ScrollMessage {
  type: 'SCROLL';
  payload: { direction: 'up' | 'down' };
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

export interface PrepareAdapterMessage {
  type: 'PREPARE_ADAPTER';
}

// ── Side Panel ↔ Service Worker ──────────────────────────────────────────────

export interface ExtractPageContextMessage {
  type: 'EXTRACT_PAGE_CONTEXT';
}

export interface ChatMessage {
  type: 'CHAT_MESSAGE';
  payload: { content: string };
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

export interface AuthStateMessage {
  type: 'AUTH_STATE';
  payload: AuthState;
}

export interface StatusMessage {
  type: 'STATUS';
  payload: { status: string; message?: string };
}

// ── Scan (Panel → Service Worker) ───────────────────────────────────────────

export interface ScanPageMessage {
  type: 'SCAN_PAGE';
}

export interface ScanBatchMessage {
  type: 'SCAN_BATCH';
  payload: { tasks: StructuredTask[]; rawText: string };
}

export interface TogglePanelMessage {
  type: 'TOGGLE_PANEL';
}

export type ExtensionMessage =
  | InsertTextMessage
  | HighlightFieldMessage
  | ExtractPageMessage
  | DetectFieldsMessage
  | ScrollMessage
  | ClickElementMessage
  | WaitAndExtractMessage
  | GoBackMessage
  | PrepareAdapterMessage
  | ExtractPageContextMessage
  | ChatMessage
  | DeepReviewMessage
  | CancelDeepReviewMessage
  | DeepReviewProgressMessage
  | DeepReviewCompleteMessage
  | AuthStateMessage
  | StatusMessage
  | ScanPageMessage
  | ScanBatchMessage
  | TogglePanelMessage;
