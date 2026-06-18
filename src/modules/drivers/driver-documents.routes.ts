import { Router } from 'express';
import { celebrate, Joi, Segments } from 'celebrate';
import { DriverDocumentsController } from './driver-documents.controller';

const router = Router();

router.get('/driver/:driverId', DriverDocumentsController.getDriverDocuments);

router.post(
  '/upload-url/:driverId',
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      documentType: Joi.string().required(),
      contentType: Joi.string().required(),
    }),
  }),
  DriverDocumentsController.getUploadUrl
);

router.post(
  '/save/:driverId',
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      documentType: Joi.string().required(),
      documentUrl: Joi.object().required(),
    }),
  }),
  DriverDocumentsController.saveDocument
);

router.post('/submit/:driverId', DriverDocumentsController.submitDocuments);

router.patch('/verify/:id', DriverDocumentsController.verifyDocument);

export default router;
