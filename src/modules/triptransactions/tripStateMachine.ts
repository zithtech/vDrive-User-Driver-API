// src/utilities/tripStateMachine.ts

import { TripEventType, ActorType } from '../../enums/triptransaction.enums';
import { Trip } from '../trip/trip.model';

// ─── Every possible trip state ────────────────────────────────────────────────
export enum TripStatus {
  Requested = 'REQUESTED',
  Accepted = 'ACCEPTED',
  Live = 'LIVE',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
  Expired = 'EXPIRED',
}

// ─── Full lifecycle order ─────────────────────────────────────────────────────
//
//  REQUESTED → ACCEPTED → LIVE → COMPLETED
//      ↓           ↓        ↓
//  CANCELLED   CANCELLED  CANCELLED
//      ↓
//  EXPIRED

// ─── What changed + context → which event ────────────────────────────────────
export interface FieldChangeRule {
  field: keyof Trip;
  fromValue?: unknown; // previous value (optional match)
  toValue?: unknown; // new value (optional match)
  event: TripEventType;
  actor: ActorType;
  priority: number; // higher = checked first
  description: string;
}

export const FIELD_CHANGE_RULES: FieldChangeRule[] = [
  // ── Priority 100: Status transitions (most important) ────────────────────
  {
    field: 'trip_status',
    toValue: TripStatus.Accepted,
    event: TripEventType.TripAccepted,
    actor: ActorType.Driver,
    priority: 100,
    description: 'Driver accepted the trip',
  },
  {
    field: 'trip_status',
    toValue: TripStatus.Live,
    event: TripEventType.TripStarted,
    actor: ActorType.Driver,
    priority: 100,
    description: 'Trip started — driver picked up passenger',
  },
  {
    field: 'trip_status',
    toValue: TripStatus.Completed,
    event: TripEventType.TripCompleted,
    actor: ActorType.Driver,
    priority: 100,
    description: 'Trip completed — passenger dropped off',
  },
  {
    field: 'trip_status',
    toValue: TripStatus.Cancelled,
    event: TripEventType.TripCancelled,
    actor: ActorType.System, // overridden by cancel_by field
    priority: 100,
    description: 'Trip cancelled',
  },
  {
    field: 'trip_status',
    toValue: TripStatus.Expired,
    event: TripEventType.TripExpired,
    actor: ActorType.System,
    priority: 100,
    description: 'Trip expired — no driver accepted in time',
  },

  // ── Priority 90: Driver assignment ───────────────────────────────────────
  {
    field: 'driver_id',
    fromValue: null,
    event: TripEventType.DriverAssigned,
    actor: ActorType.Admin,
    priority: 90,
    description: 'Driver assigned to trip',
  },
  {
    field: 'driver_id',
    event: TripEventType.DriverReassigned,
    actor: ActorType.Admin,
    priority: 89,
    description: 'Driver reassigned to trip',
  },

  // ── Priority 80: Arrival events ──────────────────────────────────────────
  {
    field: 'actual_pickup_time',
    fromValue: null,
    event: TripEventType.DriverArrivedPickup,
    actor: ActorType.Driver,
    priority: 80,
    description: 'Driver arrived at pickup location',
  },
  {
    field: 'actual_drop_time',
    fromValue: null,
    event: TripEventType.DriverArrivedDropoff,
    actor: ActorType.Driver,
    priority: 80,
    description: 'Driver arrived at dropoff location',
  },

  // ── Priority 70: Payment & fare ──────────────────────────────────────────
  {
    field: 'payment_status',
    event: TripEventType.PaymentStatusChanged,
    actor: ActorType.System,
    priority: 70,
    description: 'Payment status changed',
  },
  {
    field: 'total_fare',
    event: TripEventType.FareUpdated,
    actor: ActorType.Admin,
    priority: 70,
    description: 'Trip fare updated',
  },
  {
    field: 'waiting_charges',
    event: TripEventType.FareUpdated,
    actor: ActorType.System,
    priority: 69,
    description: 'Waiting charges added to fare',
  },

  // ── Priority 60: Location changes ────────────────────────────────────────
  {
    field: 'pickup_address',
    event: TripEventType.PickupLocationUpdated,
    actor: ActorType.User,
    priority: 60,
    description: 'Pickup location updated',
  },
  {
    field: 'drop_address',
    event: TripEventType.DropoffLocationUpdated,
    actor: ActorType.User,
    priority: 60,
    description: 'Dropoff location updated',
  },

  // ── Priority 50: Scheduling ──────────────────────────────────────────────
  {
    field: 'scheduled_start_time',
    event: TripEventType.TripRescheduled,
    actor: ActorType.Admin,
    priority: 50,
    description: 'Trip rescheduled',
  },

  // ── Priority 40: Post-trip ───────────────────────────────────────────────
  {
    field: 'rating',
    fromValue: null,
    event: TripEventType.RatingSubmitted,
    actor: ActorType.User,
    priority: 40,
    description: 'Rating submitted by user',
  },
  {
    field: 'cancel_reason',
    fromValue: null,
    event: TripEventType.TripCancelled,
    actor: ActorType.System,
    priority: 40,
    description: 'Cancellation reason recorded',
  },

  // ── Priority 30: Notes ───────────────────────────────────────────────────
  {
    field: 'notes',
    event: TripEventType.NoteAdded,
    actor: ActorType.Admin,
    priority: 30,
    description: 'Note added to trip',
  },
];

// ─── Core resolver ────────────────────────────────────────────────────────────
export interface ResolvedEvent {
  event_type: TripEventType;
  actor_type: ActorType;
  description: string;
  field: keyof Trip;
  oldVal: unknown;
  newVal: unknown;
}

const TERMINAL_STATES = ['CANCELLED', 'COMPLETED', 'EXPIRED'];

export function resolveEvents(
  previousTrip: Partial<Trip>,
  currentTrip: Partial<Trip>,
  changedData: Partial<Trip>
): ResolvedEvent[] {
  const resolved: ResolvedEvent[] = [];
  const seen = new Set<TripEventType>();

  // ── If trip just became terminal, only log that event ────────────────────
  const newStatus = currentTrip.trip_status as string;
  const prevStatus = previousTrip.trip_status as string;

  const justBecameTerminal =
    TERMINAL_STATES.includes(newStatus) && !TERMINAL_STATES.includes(prevStatus);

  if (justBecameTerminal) {
    const terminalRule = FIELD_CHANGE_RULES.find(
      (r) => r.field === 'trip_status' && r.toValue === newStatus
    );

    if (terminalRule) {
      return [
        {
          event_type: terminalRule.event,
          actor_type: terminalRule.actor,
          description: terminalRule.description,
          field: 'trip_status',
          oldVal: prevStatus,
          newVal: newStatus,
        },
      ];
    }
  }

  // ── If already in terminal state, only allow note_added ──────────────────
  const alreadyTerminal = TERMINAL_STATES.includes(prevStatus);

  const sorted = [...FIELD_CHANGE_RULES].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    const field = rule.field;
    const fieldChanged = field in changedData;
    if (!fieldChanged) continue;

    // Block non-note events after terminal state
    if (alreadyTerminal && rule.event !== TripEventType.NoteAdded) continue;

    const oldVal = previousTrip[field] ?? null;
    const newVal = currentTrip[field] ?? null;

    if (rule.fromValue !== undefined && oldVal !== rule.fromValue) continue;
    if (rule.toValue !== undefined && newVal !== rule.toValue) continue;
    if (seen.has(rule.event)) continue;

    seen.add(rule.event);
    resolved.push({
      event_type: rule.event,
      actor_type: rule.actor,
      description: rule.description,
      field,
      oldVal,
      newVal,
    });
  }

  if (!resolved.length) {
    resolved.push({
      event_type: TripEventType.StatusChanged,
      actor_type: ActorType.Admin,
      description: 'Trip fields updated',
      field: Object.keys(changedData)[0] as keyof Trip,
      oldVal: null,
      newVal: null,
    });
  }

  return resolved;
}
