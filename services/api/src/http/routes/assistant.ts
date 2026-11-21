import { InterpretRequest } from '@provisioning/contracts';
import { parseBody } from '../parse';
import type { Router } from '../router';
import type { ApiDeps } from '../deps';
import { requireAccount } from './accounts';

export function registerAssistantRoutes(router: Router, deps: ApiDeps): void {
  router.post('/accounts/{accountId}/assistant/interpret', async ({ params, body }) => {
    const request = parseBody(InterpretRequest, body);
    await requireAccount(deps, params.accountId!);
    return { status: 200, body: await deps.assistant.interpret(params.accountId!, request.text) };
  });
}
