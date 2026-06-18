// src/repositories/simulationRepository.ts
import { query } from '../../shared/database';

export const simulationRepository = {
  async updateDriverLocation(tripId: string, lat: number, lng: number, heading: number) {
    const sql = `
            UPDATE trips 
            SET current_lat = $1, 
                current_lng = $2, 
                current_heading = $3 
            WHERE trip_id = $4
            RETURNING *; -- Returns the updated row so the service knows it succeeded
        `;

    // Match the variables to the parameters exactly:
    // $1 -> lat, $2 -> lng, $3 -> heading, $4 -> tripId
    const { rows } = await query(sql, [lat, lng, heading, tripId]);

    return rows[0];
  },
};
