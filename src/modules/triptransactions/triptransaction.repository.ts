import { TripEventType, TransactionStatus, ActorType } from '../../enums/triptransaction.enums';
import { query } from '../../shared/database';
import { TripSnapshot, EventMetadata, TripTransaction } from './triptransaction.model';

export interface CreateTripTransactionInput {
  trip_id: string;
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
  event_at: Date | null;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export const TripTransactionRepository = {
  async create(data: CreateTripTransactionInput): Promise<TripTransaction> {
    const {
      trip_id,
      event_type,
      status,
      actor_type,
      actor_id,
      actor_name,
      actor_ip,
      actor_device,
      entity_snapshot,
      changed_fields,
      old_value,
      new_value,
      notes,
      metadata,
      failure_reason,
      parent_transaction_id,
      event_at,
    } = data;

    const result = await query(
      `INSERT INTO trip_transactions (
                trip_id, sequence_no, event_type, status,
                actor_type, actor_id, actor_name, actor_ip, actor_device,
                entity_snapshot, changed_fields, old_value, new_value,
                notes, metadata, failure_reason, parent_transaction_id, event_at
            ) VALUES (
                $1,
                (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM trip_transactions WHERE trip_id = $1),
                $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                COALESCE($17, CURRENT_TIMESTAMP)
            ) RETURNING *`,
      [
        trip_id,
        event_type,
        status,
        actor_type,
        actor_id,
        actor_name,
        actor_ip,
        actor_device,
        JSON.stringify(entity_snapshot),
        changed_fields,
        old_value ? JSON.stringify(old_value) : null,
        JSON.stringify(new_value),
        notes,
        metadata ? JSON.stringify(metadata) : null,
        failure_reason,
        parent_transaction_id,
        event_at,
      ]
    );

    return result.rows[0];
  },

  async findAll(pagination: PaginationInput): Promise<TripTransaction[]> {
    const result = await query(
      `SELECT tt.*
             FROM trip_transactions tt
             ORDER BY tt.event_at DESC
             LIMIT $1 OFFSET $2`,
      [pagination.limit, pagination.offset]
    );
    return result.rows || [];
  },

  async findByTripId(trip_id: string, pagination: PaginationInput): Promise<TripTransaction[]> {
    const result = await query(
      `SELECT tt.*
             FROM trip_transactions tt
             WHERE tt.trip_id = $1
             ORDER BY tt.sequence_no ASC
             LIMIT $2 OFFSET $3`,
      [trip_id, pagination.limit, pagination.offset]
    );
    return result.rows || [];
  },

  async findById(id: string): Promise<TripTransaction | null> {
    const result = await query(
      `SELECT tt.*
             FROM trip_transactions tt
             WHERE tt.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByActor(
    actor_type: ActorType,
    actor_id: string,
    pagination: PaginationInput
  ): Promise<TripTransaction[]> {
    const result = await query(
      `SELECT tt.*
             FROM trip_transactions tt
             WHERE tt.actor_type = $1
               AND tt.actor_id   = $2
             ORDER BY tt.event_at DESC
             LIMIT $3 OFFSET $4`,
      [actor_type, actor_id, pagination.limit, pagination.offset]
    );
    return result.rows || [];
  },

  async findByEventType(trip_id: string, event_type: TripEventType): Promise<TripTransaction[]> {
    const result = await query(
      `SELECT tt.*
             FROM trip_transactions tt
             WHERE tt.trip_id    = $1
               AND tt.event_type = $2
             ORDER BY tt.sequence_no ASC`,
      [trip_id, event_type]
    );
    return result.rows || [];
  },

  async countByTripId(trip_id: string): Promise<number> {
    const result = await query(`SELECT COUNT(*) FROM trip_transactions WHERE trip_id = $1`, [
      trip_id,
    ]);
    return parseInt(result.rows[0].count, 10);
  },

  async countAll(): Promise<number> {
    const result = await query(`SELECT COUNT(*) FROM trip_transactions`);
    return parseInt(result.rows[0].count, 10);
  },
};
