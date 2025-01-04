import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { ExampleEntity } from '../entities/exampleEntity';

export class ExampleClassValidatorCheck {
  constructor() {}

  public async start(): Promise<void> {
    const dataToValidate: any[] = [
      {
        name: 'John Doe',
        id: '12345',
      },
      {
        name: '',
        id: 12345,
      },
    ];

    for (const itemTovalidate of dataToValidate) {
      let data: any[] = [];
      let errorMessages: string = '';

      const example = plainToClass(ExampleEntity, itemTovalidate);
      const errors = await validate(example);

      console.log('Errors:', errors);
    }
  }
}
