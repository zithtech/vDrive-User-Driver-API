 

/**
 * Migration: Add fcm_token column to drivers table
 * For Firebase Cloud Messaging push notifications
 */

exports.up = (pgm) => {
  pgm.addColumn('drivers', {
    fcm_token: {
      type: 'text',
      default: null,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('drivers', 'fcm_token');
};
