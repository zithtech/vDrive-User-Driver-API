const { io } = require('socket.io-client');
const socket = io('http://localhost:3000/internal', {
    transports: ['websocket'],
    auth: { token: 'mW0w5OJFRbJNpL5QBAVWTw6RjjnHNZOMEsr5/pDAKW0=' }
});
socket.on('connect', () => console.log('Connected to admin BE'));
socket.on('SUPPORT_MESSAGE_FROM_ADMIN', (data) => console.log('RECEIVED:', data));
socket.on('connect_error', (err) => console.error('Error:', err.message));
