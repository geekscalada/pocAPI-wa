import * as AWS from 'aws-sdk';
import { CSVreadService } from './CSVreadService.js';
import { CSVwriterService } from './CSVwriteService.js';
import { APIGatewayProxyResult } from 'aws-lambda';
import { BUCKET_CONFIGS } from '../../../../infra/const/buckets.js';
import { writeFileSync } from 'fs';
import { readFileSync } from 'fs';

// Configuración de S3
const s3 = new AWS.S3();

export class IOservice {
  async start(): Promise<APIGatewayProxyResult> {
    try {
      const sourceBucket = BUCKET_CONFIGS.internalPrivate.name;
      const pathFile = BUCKET_CONFIGS.internalPrivate.routes.inputFolder;
      const nameFile = 'example-file.csv';
      const sourceKey = `${pathFile}/${nameFile}`;
      const destinationBucket = BUCKET_CONFIGS.internalPrivate.name;
      const destinationKey = 'processed-file.csv';

      // Download file from S3

      let s3Object;

      try {
        s3Object = await s3.getObject({ Bucket: sourceBucket, Key: sourceKey }).promise();
      } catch (error) {
        throw new Error('Error downloading file from S3');
      }

      const localSourcePath = '/tmp/source.csv';
      const localDestinationPath = '/tmp/processed.csv';

      // Store file in /tmp
      writeFileSync(localSourcePath, s3Object.Body as Buffer);

      // Leer datos del CSV
      const csvReader = new CSVreadService<{ column1: string; column2: string }>(localSourcePath, {
        encoding: 'utf-8',
        delimiter: ',',
      });
      const csvData = csvReader.getLoadedCSVData();

      // Procesar datos
      const processedData = csvData.map((record) => ({
        ...record,
        processedColumn: record.column1.toUpperCase(),
      }));

      // Escribir datos procesados en un nuevo archivo CSV
      const csvWriter = new CSVwriterService(
        [
          { id: 'column1', title: 'Column 1' },
          { id: 'column2', title: 'Column 2' },
          { id: 'processedColumn', title: 'Processed Column' },
        ],
        localDestinationPath,
        'utf-8',
        ',',
      );

      await csvWriter.writeData(processedData);

      const processedFile = readFileSync(localDestinationPath);
      await s3
        .putObject({
          Bucket: destinationBucket,
          Key: destinationKey,
          Body: processedFile,
        })
        .promise();

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'File processed and uploaded successfully!' }),
      };
    } catch (error) {
      console.error('Error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Error processing file', error }),
      };
    }
  }
}
