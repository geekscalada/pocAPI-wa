// Import always first
import 'reflect-metadata';
import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { ExampleClassValidatorCheck } from './src/services/ExampleCValidator';

export const handler = async (context: Context, event: APIGatewayEvent) => {
  // console.log("Received event:", JSON.stringify(event, null, 2));

  // const body = event?.body ? JSON.parse(event.body) : {};

  // if (body.CVSUpdate !== true) {
  //   console.warn("Invalid or missing 'CVSUpdate' parameter");
  //   return {
  //     statusCode: 400,
  //     body: JSON.stringify({
  //       message:
  //         "Invalid or missing 'CVSUpdate' parameter. Please provide CVSUpdate: true.",
  //     }),
  //   };
  // }

  const cronService = new ExampleClassValidatorCheck();

  try {
    await cronService.start();
    console.log('Start');

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

// Just for local launch
if (require.main === module) {
  const args = process.argv.slice(2);

  const mockEvent = args[0] ? JSON.parse(args[0]) : {};
  const mockContext = args[1] ? JSON.parse(args[1]) : {};

  (async () => {
    const result = await handler(mockEvent, mockContext);
    console.log('Lambda result:', result);
  })();
}
