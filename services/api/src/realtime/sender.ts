import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { ServerMessage } from '@provisioning/contracts';

/** Sends a message to one WebSocket connection. `gone` means the client has disconnected. */
export interface MessageSender {
  send(connectionId: string, message: ServerMessage): Promise<'sent' | 'gone'>;
}

/**
 * Pushes through the API Gateway Management API. In AWS the endpoint is
 * `https://{api-id}.execute-api.{region}.amazonaws.com/{stage}`; locally it is
 * the harness's emulation of the same API.
 */
export class ApiGatewaySender implements MessageSender {
  constructor(private readonly client: ApiGatewayManagementApiClient) {}

  async send(connectionId: string, message: ServerMessage): Promise<'sent' | 'gone'> {
    try {
      await this.client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: new TextEncoder().encode(JSON.stringify(message)),
        }),
      );
      return 'sent';
    } catch (error) {
      if (error instanceof GoneException) return 'gone';
      throw error;
    }
  }
}

export function apiGatewaySender(endpoint: string): ApiGatewaySender {
  return new ApiGatewaySender(new ApiGatewayManagementApiClient({ endpoint }));
}
