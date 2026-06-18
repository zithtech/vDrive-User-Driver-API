import axios from 'axios';
import { logger } from './logger';

export const forwardRequest = async (req: any, res: any, next: any, url: string) => {
  try {
    const { body: data } = req;
    const config = {
      method: req.method,
      url: `${url}${req.originalUrl}`,
      headers: {
        'Content-Type': 'application/json',
      },
      data,
    };
    logger.info(`Forwarding Request to URL :${url}  tenant  :${req.tenant} `);

    const response = await axios(config);
    logger.info(`Request Processed Successfully :${url}  tenant  :${req.tenant} `);

    return res.status(response.status).json(response.data);
  } catch (error: any) {
    logger.error(`Error In  URL: ${url}  tenant  :${req.tenant} `);
    const responseData = {
      data: {
        message:
          error?.response?.data?.message ||
          error?.response?.data?.error?.error ||
          'something unexpected happen.',
        statustext: error?.response?.statusText || 'something unexpected happen.',
      },
    };

    if (error?.response) {
      // The request was made, but the server responded with an error status code (e.g., 404, 500).
      logger.error('Response Error:', error?.response?.data);
      return res.status(error?.response?.status || 500).json(error?.response?.data || responseData);
    } else if (error?.request) {
      // The request was made, but no response was received.
      logger.error('Request Error:', error?.request?.message);
      return res.status(error?.response?.status || 500).json(error?.request?.message || '');
    } else {
      // Something happened in setting up the request that triggered an error.
      logger.error('Axios Error:', error?.message);
      return res.status(error?.response?.status || 500).json(error?.message);
    }
  }
};
