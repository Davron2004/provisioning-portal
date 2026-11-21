import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws-v3';
import { requireEnv } from '../config/env';

/**
 * OpenSearch client. In AWS every request is SigV4-signed with the Lambda's
 * role (OPENSEARCH_AUTH=sigv4, the default; OPENSEARCH_SERVICE=es for a
 * managed domain or aoss for Serverless). Locally OPENSEARCH_AUTH=none talks
 * plain HTTP to the container, which runs with security disabled.
 */
export function createSearchClient(env: NodeJS.ProcessEnv = process.env): Client {
  const node = env.OPENSEARCH_ENDPOINT ?? requireEnv('OPENSEARCH_ENDPOINT');
  if ((env.OPENSEARCH_AUTH ?? 'sigv4') === 'none') return new Client({ node });
  const region = env.AWS_REGION ?? requireEnv('AWS_REGION');
  const service = env.OPENSEARCH_SERVICE === 'aoss' ? 'aoss' : 'es';
  return new Client({
    node,
    ...AwsSigv4Signer({ region, service, getCredentials: defaultProvider() }),
  });
}

let shared: Client | undefined;
export function sharedSearchClient(): Client {
  shared ??= createSearchClient();
  return shared;
}
