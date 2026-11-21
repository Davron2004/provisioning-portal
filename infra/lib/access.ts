import { Stack } from 'aws-cdk-lib';
import type { WebSocketApi } from 'aws-cdk-lib/aws-apigatewayv2';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { IStateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { HANDLERS } from '@provisioning/api/infra';
import type { PortalConfig } from './config';
import type { HandlerName, PortalFunction } from './constructs/portal-function';
import type { Search } from './constructs/search';

type Access = (typeof HANDLERS)[HandlerName]['access'][number];

export interface AccessTargets {
  table: ITableV2;
  stateMachine: IStateMachine;
  webSocketApi: WebSocketApi;
  webSocketStage: string;
  search: Search;
  assistant: PortalConfig['assistant'];
}

/**
 * Grants each Lambda exactly the access its handler declares in
 * `@provisioning/api/infra`, so the IAM policy is generated from the same list
 * the API code documents. A new access kind fails to compile until it is
 * mapped here.
 */
export function grantDeclaredAccess(fn: PortalFunction<HandlerName>, targets: AccessTargets): void {
  const declared: readonly Access[] = HANDLERS[fn.handlerName].access;
  const canRead = declared.includes('table:read');
  const canWrite = declared.includes('table:write');
  if (canRead && canWrite) targets.table.grantReadWriteData(fn);
  else if (canRead) targets.table.grantReadData(fn);
  else if (canWrite) targets.table.grantWriteData(fn);

  for (const access of declared) grantOne(fn, access, targets);
}

function grantOne(fn: PortalFunction<HandlerName>, access: Access, targets: AccessTargets): void {
  const stack = Stack.of(fn);
  switch (access) {
    case 'table:read':
    case 'table:write':
      return; // granted together above
    case 'stream:read':
      // Granted by the DynamoDB event source mapping on this function.
      return;
    case 'states:StartExecution':
      targets.stateMachine.grantStartExecution(fn);
      return;
    case 'execute-api:ManageConnections':
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['execute-api:ManageConnections'],
          resources: [
            stack.formatArn({
              service: 'execute-api',
              resource: targets.webSocketApi.apiId,
              resourceName: `${targets.webSocketStage}/POST/@connections/*`,
            }),
          ],
        }),
      );
      return;
    case 'es:ESHttpGet/Post/Put/Delete (index only)':
      // Only the indexer writes; the REST API runs search queries.
      if (fn.handlerName === 'searchIndexer') targets.search.grantReadWrite(fn.role!);
      else targets.search.grantRead(fn.role!);
      return;
    case 'bedrock-mantle:CreateInference':
      if (targets.assistant.provider !== 'bedrock') return;
      // Claude's Messages API on Bedrock goes through the bedrock-mantle
      // endpoint; CreateInference is authorized on the account's projects.
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['bedrock-mantle:CreateInference'],
          resources: [
            stack.formatArn({
              service: 'bedrock-mantle',
              region: targets.assistant.bedrockRegion,
              resource: 'project',
              resourceName: '*',
            }),
          ],
        }),
      );
      return;
    case 'ssm:GetParameter (ANTHROPIC_API_KEY_PARAM)': {
      if (targets.assistant.provider !== 'anthropic') return;
      const name = targets.assistant.anthropicApiKeyParam.replace(/^\//, '');
      const parameterArn = stack.formatArn({
        service: 'ssm',
        resource: 'parameter',
        resourceName: name,
      });
      fn.addToRolePolicy(
        new PolicyStatement({ actions: ['ssm:GetParameter'], resources: [parameterArn] }),
      );
      // SecureString decryption through SSM, for this one parameter only.
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ['kms:Decrypt'],
          resources: [stack.formatArn({ service: 'kms', resource: 'key', resourceName: '*' })],
          conditions: {
            StringEquals: {
              'kms:ViaService': `ssm.${stack.region}.amazonaws.com`,
              'kms:EncryptionContext:PARAMETER_ARN': parameterArn,
            },
          },
        }),
      );
      return;
    }
    default: {
      const unmapped: never = access;
      throw new Error(`No IAM mapping for access "${String(unmapped)}"`);
    }
  }
}
