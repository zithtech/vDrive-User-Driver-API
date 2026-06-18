import { ActorType, TransactionStatus, TripEventType } from '../../enums/triptransaction.enums';
import { DriverRepository } from '../drivers/driver.repository';
import { TripRepository } from '../trip/trip.repository';
import { UserRepository } from '../users/user.repository';
import {
  EventMetadata,
  LogEventParams,
  Pagination,
  TripHistoryResult,
  TripSnapshot,
  TripTransaction,
} from './triptransaction.model';
import { TripTransactionRepository } from './triptransaction.repository';
import { logger } from '../../shared/logger';

interface DiffResult<T extends object> {
  changedFields: (keyof T)[];
  oldValue: Partial<T>;
  newValue: Partial<T>;
}

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

function diffObjects<T extends object>(oldObj: T = {} as T, newObj: T = {} as T): DiffResult<T> {
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]) as Set<keyof T>;

  const changedFields: (keyof T)[] = [];
  const oldValue: Partial<T> = {};
  const newValue: Partial<T> = {};

  for (const key of allKeys) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changedFields.push(key);
      oldValue[key] = oldVal;
      newValue[key] = newVal;
    }
  }

  return { changedFields, oldValue, newValue };
}

export const TripTransactionService = {
  async logEvent(params: LogEventParams): Promise<TripTransaction> {
    const {
      trip_id,
      event_type,
      actor_type,
      actor_id = null,
      actor_name = null,
      actor_ip = null,
      actor_device = null,
      previousSnapshot = null,
      currentSnapshot,
      notes = null,
      metadata = null,
      status = TransactionStatus.Success,
      failure_reason = null,
      parent_transaction_id = null,
      event_at = null,
    } = params;

    const { changedFields, oldValue, newValue } = diffObjects(
      previousSnapshot ?? {},
      currentSnapshot
    );

    return TripTransactionRepository.create({
      trip_id: trip_id as string,
      event_type: event_type as TripEventType,
      status: status as TransactionStatus,
      actor_type: actor_type as ActorType,
      actor_id: actor_id as string,
      actor_name: actor_name as string,
      actor_ip: actor_ip as string,
      actor_device: actor_device as string,
      entity_snapshot: currentSnapshot as TripSnapshot,
      changed_fields: changedFields as string[],
      old_value: Object.keys(oldValue).length ? oldValue : null,
      new_value: newValue,
      notes: notes as string,
      metadata: metadata as EventMetadata,
      failure_reason: failure_reason as string,
      parent_transaction_id: parent_transaction_id as string,
      event_at: event_at as Date,
    });
  },

  async getTripHistory(trip_id: string, pagination: Pagination): Promise<TripHistoryResult> {
    const [rows, total, trip] = await Promise.all([
      TripTransactionRepository.findByTripId(trip_id, pagination),
      TripTransactionRepository.countByTripId(trip_id),
      TripRepository.findById(trip_id), // fetch trip to get user_id + driver_id
    ]);

    // Fetch user and driver details in parallel
    const [userDetails, driverDetails] = await Promise.all([
      trip?.user_id ? UserRepository.findById(trip.user_id, 'active') : null,
      trip?.driver_id ? DriverRepository.findDriverById(trip.driver_id) : null,
    ]);
    logger.info(`userDetails: ${JSON.stringify(userDetails)}`);
    logger.info(`driverDetails: ${JSON.stringify(driverDetails)}`);
    return {
      total,
      transactions: rows,
      user: userDetails
        ? {
            id: userDetails.id ?? '',
            name: userDetails.full_name ?? '',
            phone_number: userDetails.phone_number ?? '',
          }
        : null,
      driver: driverDetails
        ? {
            id: driverDetails.driverId ?? '',
            name: driverDetails.full_name ?? '',
            phone_number: driverDetails.phone_number ?? '',
          }
        : null,
    };
  },

  /** Fetch a single transaction by ID. Throws 404 if not found. */
  async getTransactionById(id: string): Promise<TripTransaction> {
    const tx = await TripTransactionRepository.findById(id);
    if (!tx) {
      const err = new Error('Transaction not found') as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return tx;
  },

  /** All transactions made by a specific actor. */
  async getActivityByActor(
    actor_type: ActorType,
    actor_id: string,
    pagination: Pagination
  ): Promise<TripTransaction[]> {
    return TripTransactionRepository.findByActor(actor_type, actor_id, pagination);
  },

  /** All events of a specific type within a trip. */
  async getEventsByType(trip_id: string, event_type: TripEventType): Promise<TripTransaction[]> {
    return TripTransactionRepository.findByEventType(trip_id, event_type);
  },
};
