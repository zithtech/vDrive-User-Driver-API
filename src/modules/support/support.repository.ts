import { query } from '../../shared/database';
import { SupportFaq, SupportTicket, TicketStatus } from './support.model';

export const SupportRepository = {

  /* ======================== FAQs ======================== */

  async findAllActiveFaqs(): Promise<SupportFaq[]> {
    const sql = `
      SELECT id, question, answer, category, is_active, sort_order, created_at, updated_at
      FROM support_faqs
      WHERE is_active = true
      ORDER BY sort_order ASC, created_at ASC
    `;
    const result = await query(sql);
    return result.rows as SupportFaq[];
  },

  async findAllFaqs(): Promise<SupportFaq[]> {
    const sql = `
      SELECT id, question, answer, category, is_active, sort_order, created_at, updated_at
      FROM support_faqs
      ORDER BY sort_order ASC, created_at ASC
    `;
    const result = await query(sql);
    return result.rows as SupportFaq[];
  },

  async findFaqById(id: string): Promise<SupportFaq | null> {
    const sql = `SELECT * FROM support_faqs WHERE id = $1`;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  async insertFaq(data: { question: string; answer: string; category: string; sort_order?: number }): Promise<SupportFaq> {
    const sql = `
      INSERT INTO support_faqs (question, answer, category, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await query(sql, [data.question, data.answer, data.category, data.sort_order || 0]);
    return result.rows[0] as SupportFaq;
  },

  async updateFaq(id: string, data: Partial<{ question: string; answer: string; category: string; is_active: boolean; sort_order: number }>): Promise<SupportFaq | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.question !== undefined) { fields.push(`question = $${idx++}`); values.push(data.question); }
    if (data.answer !== undefined) { fields.push(`answer = $${idx++}`); values.push(data.answer); }
    if (data.category !== undefined) { fields.push(`category = $${idx++}`); values.push(data.category); }
    if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(data.is_active); }
    if (data.sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(data.sort_order); }

    if (fields.length === 0) return this.findFaqById(id);

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const sql = `UPDATE support_faqs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    return result.rows[0] || null;
  },

  async deleteFaq(id: string): Promise<boolean> {
    const sql = `DELETE FROM support_faqs WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount || 0) > 0;
  },

  /* ======================== TICKETS ======================== */

  async createTicket(data: { driver_id: string; subject: string; description: string; priority?: string; category?: string }): Promise<SupportTicket> {
    const sql = `
      INSERT INTO support_tickets (driver_id, subject, description, priority, category)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await query(sql, [data.driver_id, data.subject, data.description, data.priority || 'medium', data.category || 'general']);
    return result.rows[0] as SupportTicket;
  },

  async findTicketsByDriverId(driverId: string): Promise<SupportTicket[]> {
    const sql = `
      SELECT * FROM support_tickets
      WHERE driver_id = $1
      ORDER BY created_at DESC
    `;
    const result = await query(sql, [driverId]);
    return result.rows as SupportTicket[];
  },

  async findAllTickets(limit: number = 50, offset: number = 0, status?: string): Promise<{ tickets: SupportTicket[]; total: number }> {
    let countSql = `SELECT COUNT(*) FROM support_tickets`;
    let dataSql = `SELECT st.*, d.full_name as driver_name, d.phone_number as driver_phone FROM support_tickets st LEFT JOIN drivers d ON d.id = st.driver_id`;
    const params: any[] = [];
    let idx = 1;

    if (status) {
      const whereClause = ` WHERE st.status = $${idx++}`;
      countSql += ` WHERE status = $1`;
      dataSql += whereClause;
      params.push(status);
    }

    dataSql += ` ORDER BY st.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    
    const countParams = status ? [status] : [];
    const dataParams = [...params, limit, offset];

    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql, dataParams),
    ]);

    return {
      tickets: dataResult.rows as SupportTicket[],
      total: parseInt(countResult.rows[0].count, 10),
    };
  },

  async findTicketById(id: string): Promise<SupportTicket | null> {
    const sql = `
      SELECT st.*, d.full_name as driver_name, d.phone_number as driver_phone
      FROM support_tickets st
      LEFT JOIN drivers d ON d.id = st.driver_id
      WHERE st.id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  async updateTicketStatus(id: string, status: TicketStatus, adminNotes?: string): Promise<SupportTicket | null> {
    const resolvedAt = status === TicketStatus.RESOLVED ? 'CURRENT_TIMESTAMP' : 'resolved_at';
    const sql = `
      UPDATE support_tickets
      SET status = $2, admin_notes = COALESCE($3, admin_notes), resolved_at = ${status === TicketStatus.RESOLVED ? 'CURRENT_TIMESTAMP' : 'resolved_at'}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [id, status, adminNotes || null]);
    return result.rows[0] || null;
  },

  /* ======================== MESSAGES ======================== */

  async saveMessage(data: { ticket_id: string; sender_id: string; sender_type: string; message: string }): Promise<any> {
    const sql = `
      INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await query(sql, [data.ticket_id, data.sender_id, data.sender_type, data.message]);
    return result.rows[0];
  },

  async findMessagesByTicketId(ticketId: string): Promise<any[]> {
    const sql = `
      SELECT * FROM support_messages
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `;
    const result = await query(sql, [ticketId]);
    return result.rows;
  },

  /* ======================== USER TICKETS ======================== */

  async createUserTicket(data: { user_id: string; subject: string; description: string; priority?: string; category?: string }): Promise<any> {
    const sql = `
      INSERT INTO user_support_tickets (user_id, subject, description, priority, category)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await query(sql, [data.user_id, data.subject, data.description, data.priority || 'medium', data.category || 'general']);
    return result.rows[0];
  },

  async findTicketsByUserId(userId: string): Promise<any[]> {
    const sql = `
      SELECT * FROM user_support_tickets
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await query(sql, [userId]);
    return result.rows;
  },

  async findAllUserTickets(limit: number = 50, offset: number = 0, status?: string): Promise<{ tickets: any[]; total: number }> {
    let countSql = `SELECT COUNT(*) FROM user_support_tickets`;
    let dataSql = `SELECT st.*, u.full_name as user_name, u.phone_number as user_phone FROM user_support_tickets st LEFT JOIN users u ON u.id = st.user_id`;
    const params: any[] = [];
    let idx = 1;

    if (status) {
      const whereClause = ` WHERE st.status = $${idx++}`;
      countSql += ` WHERE status = $1`;
      dataSql += whereClause;
      params.push(status);
    }

    dataSql += ` ORDER BY st.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    
    const countParams = status ? [status] : [];
    const dataParams = [...params, limit, offset];

    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql, dataParams),
    ]);

    return {
      tickets: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  },

  async findUserTicketById(id: string): Promise<any | null> {
    const sql = `
      SELECT st.*, u.full_name as user_name, u.phone_number as user_phone
      FROM user_support_tickets st
      LEFT JOIN users u ON u.id = st.user_id
      WHERE st.id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  async updateUserTicketStatus(id: string, status: TicketStatus, adminNotes?: string): Promise<any | null> {
    const sql = `
      UPDATE user_support_tickets
      SET status = $2, admin_notes = COALESCE($3, admin_notes), resolved_at = ${status === TicketStatus.RESOLVED ? 'CURRENT_TIMESTAMP' : 'resolved_at'}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [id, status, adminNotes || null]);
    return result.rows[0] || null;
  },

  /* ======================== USER MESSAGES ======================== */

  async saveUserMessage(data: { ticket_id: string; sender_id: string; sender_type: string; message: string }): Promise<any> {
    const sql = `
      INSERT INTO user_support_messages (ticket_id, sender_id, sender_type, message)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await query(sql, [data.ticket_id, data.sender_id, data.sender_type, data.message]);
    return result.rows[0];
  },

  async findMessagesByUserTicketId(ticketId: string): Promise<any[]> {
    const sql = `
      SELECT * FROM user_support_messages
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `;
    const result = await query(sql, [ticketId]);
    return result.rows;
  },
};
