import { query } from '../../shared/database';

export interface LocationHistoryPoint {
  trip_id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
}

export const LocationHistoryRepository = {
  /**
   * Log a single location point during an active trip.
   * Called from the socket handler on every location update
   * when the driver has an active trip.
   */
  async logPoint(point: LocationHistoryPoint) {
    const sql = `
      INSERT INTO driver_location_history 
        (trip_id, driver_id, latitude, longitude, location, speed, heading, recorded_at)
      VALUES 
        ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, NOW())
    `;
    await query(sql, [
      point.trip_id,
      point.driver_id,
      point.latitude,
      point.longitude,
      point.speed || null,
      point.heading || null,
    ]);
  },

  /**
   * Get all location points for a trip, ordered chronologically.
   * Used for trip replay and dispute resolution.
   */
  async getByTripId(tripId: string) {
    const result = await query(
      `SELECT latitude, longitude, speed, heading, recorded_at
       FROM driver_location_history
       WHERE trip_id = $1
       ORDER BY recorded_at ASC`,
      [tripId]
    );
    return result.rows;
  },

  /**
   * Get location points for a trip within a time window.
   */
  async getByTripIdInRange(tripId: string, from: Date, to: Date) {
    const result = await query(
      `SELECT latitude, longitude, speed, heading, recorded_at
       FROM driver_location_history
       WHERE trip_id = $1 AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at ASC`,
      [tripId, from, to]
    );
    return result.rows;
  },

  /**
   * Get summary stats for a trip's route (distance, duration, avg speed).
   */
  async getTripRouteSummary(tripId: string) {
    const result = await query(
      `SELECT 
         COUNT(*) as total_points,
         MIN(recorded_at) as start_time,
         MAX(recorded_at) as end_time,
         EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) as duration_seconds,
         ROUND(AVG(speed)::numeric, 2) as avg_speed_mps
       FROM driver_location_history
       WHERE trip_id = $1`,
      [tripId]
    );
    return result.rows[0];
  },

  /**
   * Delete location history older than N days (cleanup job).
   */
  async deleteOlderThan(days: number) {
    const result = await query(
      `DELETE FROM driver_location_history 
       WHERE recorded_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [days]
    );
    return result.rowCount;
  },
};
