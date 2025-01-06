// Import always first
import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { IOservice } from './src/services/IOservice.js';

export const handler = async (context: Context, event: APIGatewayEvent) => {
  const ioService = new IOservice();

  try {
    await ioService.start();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'successfully',
      }),
    };
  } catch (error) {
    console.error('Error :', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error ',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
