import { Router } from 'express';
import { PromoController } from './promo.controller';
import {
  validatePromoValidator,
  createPromoValidator,
  updatePromoValidator,
} from './promo.validator';

const router = Router();

/**
 * Driver Endpoints
 */
router.post('/validate', validatePromoValidator, PromoController.validatePromo);
router.get('/available', PromoController.listAvailablePromos);

/**
 * Admin Endpoints
 */
router.get('/all', PromoController.getAllPromos);
router.post('/create', createPromoValidator, PromoController.createPromo);
router.patch('/:id', updatePromoValidator, PromoController.updatePromo);
router.delete('/:id', PromoController.deletePromo);

export default router;
