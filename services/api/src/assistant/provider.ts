import type { AssistantProvider, OrderIntent } from '@provisioning/contracts';

/**
 * Turns a plain-English request into an OrderIntent. That is all a provider
 * may do: it never sees users or numbers and never writes anything.
 * Deterministic code (resolve.ts) maps the intent onto the account, and the
 * normal preview and approval flow decides what is ordered.
 */
export interface IntentProvider {
  readonly name: AssistantProvider;
  /** Model id, or null for the rules parser. */
  readonly model: string | null;
  interpret(text: string, context: PromptContext): Promise<OrderIntent>;
}

/** Vocabulary the provider may use to understand the request. Names only, no personal data. */
export interface PromptContext {
  accountName: string;
  siteNames: string[];
  deviceNames: string[];
}
