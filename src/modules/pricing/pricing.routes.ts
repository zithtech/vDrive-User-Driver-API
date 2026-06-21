import { Router } from 'express';
import { PricingController } from './pricing.controller';

const router = Router();

router.post('/calculate-all-types', PricingController.calculateAllTypes);
router.post('/quote', PricingController.quote);

export default router;
