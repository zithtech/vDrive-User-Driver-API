import cron from 'node-cron';
import { NotificationRepository } from './notification-management.repository';
import { sendToMultipleDevices } from '../../config/firebase';

export const NotificationService = {
  async queueNewNotification(payload: any) {
    // 1. Create the notification record
    const notification = await NotificationRepository.createNotification({
      title: payload.title,
      body: payload.body,
      target_type: payload.target_type,
      target_audience: payload.target_audience,
      coupon_code: payload.coupon_code || null,
      promo_code: payload.promo_code || null,
      specific_user_id: payload.specific_user_id,
    });

    return notification;
  },

  async queueDispatchOnly(payload: any) {
    const userIds = Array.isArray(payload.specific_user_id)
      ? payload.specific_user_id
      : payload.specific_user_id
        ? [payload.specific_user_id]
        : [];

    if (userIds.length > 0 && payload.target_audience === 'SPECIFIC') {
      const results = [];
      for (const userId of userIds) {
        const res = await NotificationRepository.queueDispatch({
          notification_id: payload.notificationId,
          target_type: payload.target_type,
          target_audience: payload.target_audience,
          specific_user_id: userId,
        });
        results.push(res);
      }
      return results;
    } else {
      return await NotificationRepository.queueDispatch({
        notification_id: payload.notificationId,
        target_type: payload.target_type,
        target_audience: payload.target_audience,
        specific_user_id: null as any,
      });
    }
  },

  async getAllNotifications(target_type?: string) {
    return await NotificationRepository.getAllNotifications(target_type);
  },

  async updateNotification(id: string, data: any) {
    return await NotificationRepository.updateNotification(id, data);
  },

  async deleteNotification(id: string) {
    return await NotificationRepository.deleteNotification(id);
  },

  async processQueue() {
    const pendingTasks = await NotificationRepository.getPendingDispatches();
    if (pendingTasks.length === 0) return;

    for (const task of pendingTasks) {
      try {
        await NotificationRepository.updateDispatchStatus(task.id!, 'PROCESSING');

        let offset = 0;
        const batchSize = 500;
        let totalSentInThisRun = 0;
        let hasMoreUsers = true;

        const content = await NotificationRepository.getNotificationContent(task.notification_id);
        if (!content) {
          await NotificationRepository.updateDispatchStatus(
            task.id!,
            'FAILED',
            'Notification content not found'
          );
          continue;
        }

        while (hasMoreUsers && totalSentInThisRun < 5000) {
          // Safety limit per cron run
          let users: { userId: string; token: string }[] = [];

          // Resolve Target Tokens in batches
          if (task.target_type === 'CUSTOMER') {
            switch (task.target_audience) {
              case 'ALL':
                users = await NotificationRepository.getCustomerTokensAll(batchSize, offset);
                break;
              case 'TOP_RIDE':
                users = await NotificationRepository.getCustomerTokensTop(batchSize, offset);
                break;
              case 'LOW_RIDE':
                users = await NotificationRepository.getCustomerTokensLow(batchSize, offset);
                break;
              case 'SPECIFIC':
                users = await NotificationRepository.getCustomerTokenSpecific(
                  task.specific_user_id!
                );
                hasMoreUsers = false;
                break;
            }
          } else if (task.target_type === 'DRIVER') {
            switch (task.target_audience) {
              case 'ALL':
                users = await NotificationRepository.getDriverTokensAll(batchSize, offset);
                break;
              case 'TOP_RIDE':
                users = await NotificationRepository.getDriverTokensTop(batchSize, offset);
                break;
              case 'LOW_RIDE':
                users = await NotificationRepository.getDriverTokensLow(batchSize, offset);
                break;
              case 'SPECIFIC':
                users = await NotificationRepository.getDriverTokenSpecific(task.specific_user_id!);
                hasMoreUsers = false;
                break;
            }
          }

          if (users.length === 0) {
            hasMoreUsers = false;
            break;
          }

          // Filter for duplicates in bulk
          const userIds = users.map((u) => u.userId);
          const filteredIds = await NotificationRepository.filterExistingRecipients(
            task.notification_id,
            userIds,
            task.target_type
          );

          const toSend = users.filter((u) => filteredIds.includes(u.userId));

          if (toSend.length > 0) {
            const tokens = toSend.map((u) => u.token);
            try {
              const payloadData: Record<string, string> = {};
              if (content.coupon_code) payloadData.coupon_code = content.coupon_code;
              if (content.promo_code) payloadData.promo_code = content.promo_code;

              await sendToMultipleDevices(tokens, {
                title: content.title,
                body: content.body,
                type: 'PROMOTIONAL_NOTIFICATION',
                data: Object.keys(payloadData).length > 0 ? payloadData : undefined,
              });

              // Log bulk sends
              await NotificationRepository.logBulkSends(
                task.notification_id,
                task.target_type,
                filteredIds,
                'SENT'
              );
              totalSentInThisRun += filteredIds.length;
            } catch (error: any) {
              console.error(`Batch send failed for dispatch ${task.id}:`, error);
              // In case of full batch failure, log as failed
              for (const user of toSend) {
                await NotificationRepository.logNotificationSend(
                  task.notification_id,
                  task.target_type,
                  user.userId,
                  'FAILED',
                  error.message
                );
              }
            }
          }

          offset += batchSize;
          if (users.length < batchSize) {
            hasMoreUsers = false;
          }
        }

        const nextStatus = hasMoreUsers ? 'PENDING' : 'COMPLETED';
        await NotificationRepository.updateDispatchStatus(
          task.id!,
          nextStatus,
          null,
          totalSentInThisRun
        );
        console.log(
          `Processed dispatch ${task.id}: Sent ${totalSentInThisRun} notifications. Status: ${nextStatus}`
        );
      } catch (error: any) {
        console.error(`Failed to process dispatch task ${task.id}:`, error);
        await NotificationRepository.updateDispatchStatus(task.id!, 'FAILED', error.message);
      }
    }
  },
};

// Initialize Cron Job (Runs every 5 minutes)
export const initNotificationCronJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running Notification Dispatch Cron Job...');
    await NotificationService.processQueue();
  });
};
