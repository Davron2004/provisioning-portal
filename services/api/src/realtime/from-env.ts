import { requireEnv } from '../config/env';
import { sharedDocumentClient } from '../data/client';
import { ConnectionsRepository } from '../data/connections-repository';
import { apiGatewaySender, type MessageSender } from './sender';

let connections: ConnectionsRepository | undefined;
let sender: MessageSender | undefined;

/** Shared per Lambda container. Reads TABLE_NAME and WS_MANAGEMENT_ENDPOINT. */
export function connectionsFromEnv(): ConnectionsRepository {
  connections ??= new ConnectionsRepository(sharedDocumentClient(), requireEnv('TABLE_NAME'));
  return connections;
}

export function senderFromEnv(): MessageSender {
  sender ??= apiGatewaySender(requireEnv('WS_MANAGEMENT_ENDPOINT'));
  return sender;
}
