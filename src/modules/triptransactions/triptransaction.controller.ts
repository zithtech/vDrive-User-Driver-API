import { Request, Response, NextFunction } from 'express';
import { TripTransactionService } from './triptransaction.service';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';
import { parseQueryInt } from '../../utilities/helper';
import { ActorType, TripEventType } from '../../enums/triptransaction.enums';

export const TripTransactionController = {

    // Admin
    // async getAllTransactions(req: Request, res: Response, next: NextFunction) {
    //     try {
    //         const limit = Math.min(parseQueryInt(req.query.limit, 100), 500);
    //         const offset = parseQueryInt(req.query.offset, 0);

    //         const result = await TripTransactionService.getAllTransactions({ limit, offset });
    //         if (!result) {
    //             throw { statusCode: 204, message: 'Transaction data is empty' };
    //         }
    //         return successResponse(res, 200, 'Transactions fetched successfully', result);
    //     } catch (err: any) {
    //         logger.error(`getAllTransactions error: ${err.message}`);
    //         next(err);
    //     }
    // },

    // Trip-scoped
    async getTripHistory(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const limit = Math.min(parseQueryInt(String(req.query.limit ?? ''), 100), 500);
            const offset = parseQueryInt(String(req.query.offset ?? ''), 0);

            const result = await TripTransactionService.getTripHistory(id as string, { limit, offset });
            logger.info(`Trip history fetch result: ${JSON.stringify(result)}`);
            if (!result) {
                throw { statusCode: 204, message: 'Trip transaction history is empty' };
            }
            return successResponse(res, 200, 'Trip history fetched successfully', result);
        } catch (err: any) {
            logger.error(`getTripHistory error: ${err.message}`);
            next(err);
        }
    },

    async getTransactionById(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const data = await TripTransactionService.getTransactionById(id as string);
            return successResponse(res, 200, 'Transaction fetched successfully', data);
        } catch (err: any) {
            logger.error(`getTransactionById error: ${err.message}`);
            next(err);
        }
    },

    async getEventsByType(req: Request, res: Response, next: NextFunction) {
        try {
            const { id, eventType } = req.params;
            const data = await TripTransactionService.getEventsByType(
                id as string,
                eventType as TripEventType,
            );
            if (!data) {
                throw { statusCode: 204, message: 'No events found for this type' };
            }
            return successResponse(res, 200, 'Events fetched successfully', data);
        } catch (err: any) {
            logger.error(`getEventsByType error: ${err.message}`);
            next(err);
        }
    },

    // Actor-scoped
    async getActivityByActor(req: Request, res: Response, next: NextFunction) {
        try {
            const { actorType, actorId } = req.params;
            const limit = Math.min(parseQueryInt(String(req.query.limit ?? ''), 50), 200);
            const offset = parseQueryInt(String(req.query.offset ?? ''), 0);

            const data = await TripTransactionService.getActivityByActor(
                actorType as ActorType,
                actorId as string,
                { limit, offset },
            );
            if (!data) {
                throw { statusCode: 204, message: 'No activity found for this actor' };
            }
            return successResponse(res, 200, 'Actor activity fetched successfully', data);
        } catch (err: any) {
            logger.error(`getActivityByActor error: ${err.message}`);
            next(err);
        }
    },

    // Create
    async logEvent(req: Request, res: Response, next: NextFunction) {
        try {
            const actor_ip = (req.ip || req.headers['x-forwarded-for'] as string) ?? null;
            const actor_device = req.headers['user-agent'] ?? null;

            const transaction = await TripTransactionService.logEvent({
                ...req.body,
                actor_ip,
                actor_device,
            });
            return successResponse(res, 201, 'Transaction logged successfully', transaction);
        } catch (err: any) {
            logger.error(`logEvent error: ${err.message}`);
            next(err);
        }
    },
};