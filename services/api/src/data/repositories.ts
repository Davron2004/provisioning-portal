import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AccountsRepository } from './accounts-repository';
import { NumbersRepository } from './numbers-repository';
import { OrdersRepository } from './orders-repository';
import { UsersRepository } from './users-repository';

export interface Repositories {
  accounts: AccountsRepository;
  users: UsersRepository;
  numbers: NumbersRepository;
  orders: OrdersRepository;
}

export function createRepositories(doc: DynamoDBDocumentClient, tableName: string): Repositories {
  return {
    accounts: new AccountsRepository(doc, tableName),
    users: new UsersRepository(doc, tableName),
    numbers: new NumbersRepository(doc, tableName),
    orders: new OrdersRepository(doc, tableName),
  };
}
