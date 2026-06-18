import { Router } from 'express';
import { celebrate, Joi, Segments } from 'celebrate';
import { S3Controller } from './s3.controller';
import { isAuthenticatedOrService } from '../../shared/serviceAuthentication';

const router = Router();

router.post(
  '/presigned-url',
  isAuthenticatedOrService,
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      key: Joi.string().required().messages({
        'any.required': 'Key is required for pre-signed URL',
      }),
      contentType: Joi.string().required().messages({
        'any.required': 'ContentType is required for pre-signed URL',
      }),
    }),
  }),
  S3Controller.getPresignedUrl
);

export default router;
