import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { WorkflowInput } from '../workflow/definition';
import { log } from './log';
import { readBody, send } from './rest-gateway';
import { runOrderWorkflow, type WorkflowHandlers } from './workflow-runner';

/**
 * LOCAL STAND-IN for the Step Functions API. Implements just StartExecution
 * (AWS JSON 1.0 protocol) so the REST handler's real SFNClient, pointed here
 * through SFN_ENDPOINT, starts runs of the local workflow runner. Execution
 * names behave like Step Functions: reusing one with the same input is a
 * no-op, with a different input it is ExecutionAlreadyExists.
 */
export async function startStepFunctionsStandIn(
  handlers: WorkflowHandlers,
  region: string,
): Promise<{ endpoint: string; stateMachineArn: string; server: Server }> {
  const stateMachineArn = `arn:aws:states:${region}:000000000000:stateMachine:order-workflow-local`;
  const executions = new Map<string, string>();

  const server = createServer((req, res) => {
    void (async () => {
      const target = req.headers['x-amz-target'];
      if (req.method !== 'POST' || target !== 'AWSStepFunctions.StartExecution') {
        return send(res, 400, {
          __type: 'UnknownOperationException',
          message: `${String(target)} is not emulated`,
        });
      }
      const body = JSON.parse(await readBody(req)) as { name?: string; input?: string };
      const name = body.name ?? crypto.randomUUID();
      const input = body.input ?? '{}';
      const executionArn = `${stateMachineArn.replace(':stateMachine:', ':execution:')}:${name}`;
      const headers = { 'Content-Type': 'application/x-amz-json-1.0' };

      const previous = executions.get(name);
      if (previous !== undefined && previous !== input) {
        return send(
          res,
          400,
          { __type: 'ExecutionAlreadyExists', message: `Execution ${name} already exists` },
          headers,
        );
      }
      send(res, 200, { executionArn, startDate: Date.now() / 1000 }, headers);
      if (previous !== undefined) return;

      executions.set(name, input);
      const parsed = JSON.parse(input) as WorkflowInput;
      log.info(`workflow ${name}: started`);
      runOrderWorkflow(parsed, handlers)
        .then((result) => log.info(`workflow ${name}: ${result.status}`))
        .catch((error: unknown) => log.error(`workflow ${name}: crashed`, error));
    })().catch((error: unknown) => {
      log.error('Step Functions stand-in error', error);
      if (!res.headersSent)
        send(res, 500, { __type: 'InternalFailure', message: 'stand-in error' });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { endpoint: `http://127.0.0.1:${port}`, stateMachineArn, server };
}
