// src/modules/drivers/driver.validator.ts
import { celebrate, Joi, Segments } from 'celebrate';
import { TripValidation } from '../trip/trip.validator';

const addressSchema = Joi.object({
  street: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  country: Joi.string().required(),
  pincode: Joi.string().required(),
});


const documentSchema = Joi.object({
  documentType: Joi.string().required(),
  documentNumber: Joi.string().required(),
  documentUrl: Joi.object().required(),
  licenseStatus: Joi.string().optional(),
  expiryDate: Joi.string().isoDate().optional(),
});

const updateDocumentSchema = Joi.object({
  documentId: Joi.string().optional(),
  documentType: Joi.string().optional(),
  documentNumber: Joi.string().optional(),
  documentUrl: Joi.object().optional(),
  licenseStatus: Joi.string().allow(null, '').optional(),
  expiryDate: Joi.string().isoDate().allow(null, '').optional(),
});

export const createDriverValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    first_name: Joi.string().required(),
    last_name: Joi.string().required(),
    phone_number: Joi.string().required(),
    alternate_contact: Joi.string().allow(null, '').optional(),
    email: Joi.string().email().required(),
    profilePicUrl: Joi.string().uri().optional(),
    date_of_birth: Joi.string().isoDate().required(),
    gender: Joi.string().valid('male', 'female', 'other').required(),
    address: addressSchema.required(),
    role: Joi.string().required(),
    documents: Joi.array().items(documentSchema.unknown(true)).optional(),
    language: Joi.string().optional(),
    is_vibration_enabled: Joi.boolean().optional(),
  }).unknown(true),
});

export const getDriverValidator = celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
});

export const getDriversValidator = celebrate({
  [Segments.QUERY]: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
});

export const findNearbyDriversValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    // Longitude: required for PostGIS ST_MakePoint
    lng: Joi.number().min(-180).max(180).required()
      .messages({ 'any.required': 'Longitude is required for location search' }),

    // Latitude: required for PostGIS ST_MakePoint
    lat: Joi.number().min(-90).max(90).required()
      .messages({ 'any.required': 'Latitude is required for location search' }),

    newTrip: Joi.array().items(TripValidation.createTripValidation.unknown(true)).min(1).required(),
    // Radius: optional, defaults to 5km (5000 meters)
    radius: Joi.number().min(100).max(50000).default(5000)
      .messages({ 'number.max': 'Search radius cannot exceed 50km' }).optional(),
  }),
});

export const availableDriversForAssignmentValidator = celebrate({
  [Segments.BODY]: Joi.object().keys({
    lng: Joi.number().min(-180).max(180).required(),
    lat: Joi.number().min(-90).max(90).required(),
    radius: Joi.number().min(100).max(50000).optional(),
  }),
});

export const updateDriverValidator = celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),

  [Segments.BODY]: Joi.object().keys({
    driverId: Joi.string().optional(),
    first_name: Joi.string().optional(),
    last_name: Joi.string().optional(),
    phone_number: Joi.string().optional(),
    alternate_contact: Joi.string().allow(null, '').optional(),
    email: Joi.string().email().optional(),
    profilePicUrl: Joi.string().uri().optional(),
    date_of_birth: Joi.string().isoDate().optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    address: addressSchema.optional(),
    role: Joi.string().optional(),
    status: Joi.string().optional(),
    documents: Joi.array().items(updateDocumentSchema.unknown(true)).optional(),
    language: Joi.string().optional(),
    is_vibration_enabled: Joi.boolean().optional(),
    rating: Joi.number().optional(),
  }).unknown(true),
});
