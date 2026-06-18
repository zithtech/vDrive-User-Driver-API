import request from 'supertest';
import app from '../../app';

describe('SOS Module Integration Tests', () => {
  const testDriver = {
    phone_number: '9876543210',
    otp: '123456',
    device_id: 'test-device-sos-123456',
  };

  let accessToken: string;
  let sosId: string;
  let contactId: number;

  beforeAll(async () => {
    // Login to get access token
    const response = await request(app).post('/api/auth/drivers/login').send(testDriver);
    if (response.body.success) {
      accessToken = response.body.data.accessToken;
    } else {
      // If driver doesn't exist, sign up first
      await request(app).post('/api/auth/drivers/signup').send({
        first_name: 'SOS',
        last_name: 'Tester',
        phone_number: testDriver.phone_number,
        email: 'sos.test@example.com',
        date_of_birth: '01-01-1990',
        gender: 'male',
        device_id: testDriver.device_id,
        role: 'driver',
      });
      const loginRes = await request(app).post('/api/auth/drivers/login').send(testDriver);
      accessToken = loginRes.body.data.accessToken;
    }
  });

  describe('Trusted Contacts', () => {
    test('should add a trusted contact', async () => {
      const response = await request(app)
        .post('/api/sos/contacts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Emergency Contact',
          phone: '9998887776',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('name', 'Emergency Contact');
      contactId = response.body.data.id;
    });

    test('should list trusted contacts', async () => {
      const response = await request(app)
        .get('/api/sos/contacts')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('SOS Operations', () => {
    test('should trigger SOS', async () => {
      const response = await request(app)
        .post('/api/sos/trigger')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          latitude: 13.0827,
          longitude: 80.2707,
          trip_id: 'test-trip-id',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      sosId = response.body.data.id;
    });

    test('should update SOS location', async () => {
      const response = await request(app)
        .post('/api/sos/location')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sos_id: sosId,
          latitude: 13.083,
          longitude: 80.271,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should resolve SOS', async () => {
      const response = await request(app)
        .post('/api/sos/resolve')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sos_id: sosId,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('should remove trusted contact', async () => {
      const response = await request(app)
        .delete(`/api/sos/contacts/${contactId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
