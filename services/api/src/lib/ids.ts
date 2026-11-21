import { ulid } from 'ulid';

/** Time-sortable ids: orders and users list in creation order by id. */
export const newOrderId = () => `ord_${ulid()}`;
export const newUserId = () => `usr_${ulid()}`;
