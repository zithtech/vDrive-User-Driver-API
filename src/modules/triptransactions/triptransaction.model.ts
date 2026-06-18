// ─── Interfaces ───────────────────────────────────────────────────────────────

import { ActorType, TransactionStatus, TripEventType } from '../../enums/triptransaction.enums';

export interface Pagination {
  limit: number;
  offset: number;
}

export interface TripSnapshot extends Record<string, unknown> {}

export interface EventMetadata extends Record<string, unknown> {}

export interface LogEventParams {
  trip_id?: string;
  event_type: TripEventType;
  actor_type: ActorType;
  actor_id?: string | null; // null for system actor
  actor_name?: string | null;
  actor_ip?: string | null;
  actor_device?: string | null;
  previousSnapshot?: TripSnapshot | null;
  currentSnapshot?: TripSnapshot;
  notes?: string | null;
  metadata?: EventMetadata | null;
  status?: TransactionStatus;
  failure_reason?: string | null;
  parent_transaction_id?: string | null;
  event_at?: Date | null;
}

export interface TripTransaction {
  id: string;
  trip_id: string;
  sequence_no: number;
  event_type: TripEventType;
  status: TransactionStatus;
  actor_type: ActorType;
  actor_id: string | null;
  actor_name: string | null;
  actor_ip: string | null;
  actor_device: string | null;
  entity_snapshot: TripSnapshot;
  changed_fields: string[] | null;
  old_value: Partial<TripSnapshot> | null;
  new_value: Partial<TripSnapshot>;
  notes: string | null;
  metadata: EventMetadata | null;
  failure_reason: string | null;
  parent_transaction_id: string | null;
  event_at: Date;
  created_at: Date;
}

export interface TripParticipant {
  id: string;
  name: string;
  phone_number: string;
}

export interface TripHistoryResult {
  total: number;
  transactions: TripTransaction[];
  user: TripParticipant | null;
  driver: TripParticipant | null;
}
