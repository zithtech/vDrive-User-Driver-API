// src/utilities/tripTransactionLogger.ts

import { ActorType, TransactionStatus, TripEventType } from '../../enums/triptransaction.enums';
import { logger } from '../../shared/logger';
import { Trip } from '../trip/trip.model';
import { resolveEvents } from './tripStateMachine';
import { EventMetadata, LogEventParams, TripSnapshot } from './triptransaction.model';
import { TripTransactionService } from './triptransaction.service';

export interface LogTripEventParams {
  trip: Trip;
  previousSnapshot?: Trip | null;
  changedData?: Partial<Trip>;
  event_type?: TripEventType; // optional — auto-resolved from changedData
  actor_type: ActorType;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_ip?: string | null;
  actor_device?: string | null;
  notes?: string | null;
  metadata?: EventMetadata | null;
  status?: TransactionStatus;
  failure_reason?: string | null;
  parent_transaction_id?: string | null;
  event_at?: Date | null;
}

export const tripTransactionLogger = {
  async logAll(params: LogTripEventParams): Promise<void> {
    const {
      trip,
      previousSnapshot = null,
      changedData = {},
      actor_type,
      actor_id = null,
      notes = null,
      metadata = null,
      status = TransactionStatus.Success,
      actor_ip = null,
      actor_device = null,
    } = params;

    if (!trip.trip_id) {
      logger.warn('logAll skipped — trip_id is missing');
      return;
    }

    const resolvedEvents = resolveEvents(previousSnapshot ?? {}, trip, changedData);

    logger.info(
      `[TripTransaction] trip_id=${trip.trip_id} | ` +
        `actor=${actor_type} | ` +
        `changed_fields=${Object.keys(changedData).join(', ')} | ` +
        `resolved_events=${resolvedEvents.map((e) => e.event_type).join(' → ')}`
    );

    let parentId: string | null = null;

    for (const resolved of resolvedEvents) {
      try {
        const result = await TripTransactionService.logEvent({
          trip_id: trip.trip_id,
          event_type: resolved.event_type,
          actor_type: actor_type ?? resolved.actor_type,
          actor_id,
          actor_ip,
          actor_device,
          currentSnapshot: trip as unknown as TripSnapshot,
          previousSnapshot: (previousSnapshot as unknown as TripSnapshot) ?? null,
          notes: notes ?? resolved.description,
          metadata: {
            ...metadata,
            changed_field: resolved.field,
            old_value: resolved.oldVal,
            new_value: resolved.newVal,
            changed_keys: Object.keys(changedData),
          },
          status,
          parent_transaction_id: parentId,
        });

        if (!parentId) parentId = result.id;
      } catch (err: any) {
        logger.error(
          `[TripTransaction] Failed [${resolved.event_type}] ` +
            `trip_id=${trip.trip_id}: ${err.message}`
        );
      }
    }
  },

  async log(params: LogTripEventParams): Promise<void> {
    const {
      trip,
      previousSnapshot = null,
      changedData = {},
      event_type,
      actor_type,
      actor_id = null,
      notes = null,
      metadata = null,
      status = TransactionStatus.Success,
      actor_ip = null,
      actor_device = null,
      parent_transaction_id = null,
    } = params;

    if (!trip.trip_id) {
      logger.warn('log skipped — trip_id is missing');
      return;
    }

    // Use provided event_type or resolve from changedData
    const resolvedEvents = resolveEvents(previousSnapshot ?? {}, trip, changedData);
    const resolved = resolvedEvents[0];
    const final_event = event_type ?? resolved?.event_type;

    if (!final_event) {
      logger.warn(`log skipped — could not resolve event_type for trip_id=${trip.trip_id}`);
      return;
    }

    try {
      await TripTransactionService.logEvent({
        trip_id: trip.trip_id,
        event_type: final_event,
        actor_type: actor_type ?? resolved?.actor_type,
        actor_id,
        actor_ip,
        actor_device,
        currentSnapshot: trip as unknown as TripSnapshot,
        previousSnapshot: (previousSnapshot as unknown as TripSnapshot) ?? null,
        notes: notes ?? resolved?.description ?? null,
        metadata: {
          ...metadata,
          changed_keys: Object.keys(changedData),
        },
        status,
        parent_transaction_id,
      });
    } catch (err: any) {
      logger.error(
        `[TripTransaction] Failed [${final_event}] ` + `trip_id=${trip.trip_id}: ${err.message}`
      );
    }
  },
};
