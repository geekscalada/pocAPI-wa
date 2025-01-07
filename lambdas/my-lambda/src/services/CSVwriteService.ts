import * as fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import { ObjectHeaderItem } from 'csv-writer/src/lib/record';
import { ObjectMap } from 'csv-writer/src/lib/lang/object';

export class CSVwriterService<T extends ObjectHeaderItem> {
  private header: T[] = [];
  private csvFilePath: string = '';
  private encoding: string;
  private fieldDelimiter: string;
  private csvWriter;
  private append;

  constructor(
    header: T[],
    csvFilePath: string,
    encoding?: string,
    fieldDelimiter?: string,
    append?: boolean,
  ) {
    this.csvFilePath = csvFilePath;
    this.header = header;
    this.encoding = encoding || 'latin1';
    this.fieldDelimiter = fieldDelimiter || ';';
    this.append = append === undefined ? true : append;

    const appendMode = fs.existsSync(this.csvFilePath) && this.append;

    this.csvWriter = createObjectCsvWriter({
      path: this.csvFilePath,
      header: this.header,
      fieldDelimiter: this.fieldDelimiter,
      encoding: this.encoding,
      append: appendMode,
    });
  }

  public async writeData(records: any) {
    try {
      await this.csvWriter.writeRecords(records);
    } catch (error) {
      throw new Error(`Error writing data to CSV file: ${error}`);
    }
  }
}
