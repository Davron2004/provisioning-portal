import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

/** One write in a transaction, with the message to use if its condition fails. */
export interface GuardedWrite {
  item: TransactItem;
  conflict?: string;
}

/** A conditional check in a transaction failed: the resource is taken or the item moved on. */
export class WriteConflictError extends Error {
  override readonly name = 'WriteConflictError';
  constructor(
    message: string,
    /** Position of the write whose condition failed. */
    readonly index: number,
  ) {
    super(message);
  }
}

const MAX_ATTEMPTS = 6;

/**
 * Runs a TransactWriteItems call. Retries when DynamoDB cancels it because
 * another transaction touched the same item at the same time (counters on
 * the account item make that normal), and turns a failed condition into a
 * WriteConflictError carrying the message of the write that failed.
 */
export async function transactWrite(
  doc: DynamoDBDocumentClient,
  writes: GuardedWrite[],
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await doc.send(new TransactWriteCommand({ TransactItems: writes.map((w) => w.item) }));
      return;
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const reasons = error.CancellationReasons ?? [];
      const failed = reasons.findIndex((r) => r.Code === 'ConditionalCheckFailed');
      if (failed >= 0) {
        throw new WriteConflictError(
          writes[failed]?.conflict ?? 'A conflicting change was made at the same time',
          failed,
        );
      }
      const retryable = reasons.some(
        (r) => r.Code === 'TransactionConflict' || r.Code === 'ThrottlingError',
      );
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise((r) => setTimeout(r, 20 * 2 ** attempt + Math.random() * 50));
    }
  }
}
