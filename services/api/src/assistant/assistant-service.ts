import type { InterpretResponse, OrderPreview } from '@provisioning/contracts';
import { DEVICE_CATALOG } from '../domain/catalog';
import { previewOrder, type AccountContext } from '../domain/order-validation';
import { ValidationFailedError } from '../errors';
import { logger } from '../logger';
import { resolveIntent } from './resolve';
import type { IntentProvider } from './provider';

export interface AssistantDeps {
  provider: () => Promise<IntentProvider>;
  loadContext: (accountId: string) => Promise<AccountContext>;
}

/**
 * Plain-English order requests: provider -> OrderIntent -> deterministic
 * resolution -> the same preview as a manual order. Nothing is stored or
 * provisioned here; the client submits the previewed lines through
 * POST /orders once the person approves them.
 */
export class AssistantService {
  constructor(private readonly deps: AssistantDeps) {}

  async interpret(accountId: string, text: string): Promise<InterpretResponse> {
    const ctx = await this.deps.loadContext(accountId);
    const provider = await this.deps.provider();
    const started = Date.now();
    const intent = await provider.interpret(text, {
      accountName: ctx.account.name,
      siteNames: ctx.sites.map((s) => s.name),
      deviceNames: DEVICE_CATALOG.map((d) => d.name),
    });
    logger.info('assistant interpreted request', {
      accountId,
      provider: provider.name,
      model: provider.model,
      operations: intent.operations.length,
      unresolved: intent.unresolved.length,
      durationMs: Date.now() - started,
    });

    const { draft, notes } = resolveIntent(intent, ctx);
    let preview: OrderPreview | null = null;
    if (draft) {
      try {
        preview = previewOrder(draft, ctx);
      } catch (error) {
        // A line that cannot be resolved at all (e.g. a site with no free extensions).
        if (!(error instanceof ValidationFailedError)) throw error;
        const issues =
          (error.details as { issues?: { message: string }[] } | undefined)?.issues ?? [];
        notes.push(...issues.map((i) => `Cannot preview: ${i.message}`));
      }
    }
    // No draft needs no note of its own: the app says there is nothing to order, and
    // `intent.unresolved` holds whatever text was not understood.
    return { intent, draft, preview, notes, provider: provider.name, model: provider.model };
  }
}
