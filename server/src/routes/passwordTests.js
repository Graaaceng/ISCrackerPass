import { Router } from 'express';
import { recordTest, listRanking, getByHash } from '../controllers/passwordTestController.js';

const router = Router();

router.get('/', listRanking);
router.get('/:hash', getByHash);
router.post('/', recordTest);

export default router;
