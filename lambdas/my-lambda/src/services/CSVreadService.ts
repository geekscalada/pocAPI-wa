import * as fs from "fs";
import { parse } from "csv-parse/sync";

export interface ICSVreadService<T> {
  getLoadedCSVData(): T[];
}

export class CSVreadService<T> implements ICSVreadService<T> {
  private csvFilePath: string;
  private encoding: BufferEncoding;
  private delimiter: string;
  private columns: boolean;
  private skipEmptyLines: boolean;

  constructor(
    csvFilePath: string,
    options?: {
      encoding?: BufferEncoding;
      delimiter?: string;
      columns?: boolean;
      skipEmptyLines?: boolean;
    }
  ) {
    this.csvFilePath = csvFilePath;
    this.encoding = options?.encoding || "latin1";
    this.delimiter = options?.delimiter || ";";
    this.columns = options?.columns !== undefined ? options.columns : true;
    this.skipEmptyLines =
      options?.skipEmptyLines !== undefined ? options.skipEmptyLines : true;
  }

  public getLoadedCSVData(): T[] {
    try {
      const csvData = fs.readFileSync(this.csvFilePath, this.encoding);
      const data = parse(csvData, {
        columns: this.columns,
        delimiter: this.delimiter,
        skip_empty_lines: this.skipEmptyLines,
      });

      return data as T[];
    } catch (error) {
      throw new Error(`Error reading CSV file: ${error}`);
    }
  }
}
