// buckets.ts
export const BUCKET_CONFIGS = {
  internalPrivate: {
    name: 'internal-private-bucket',
    routes: {
      inputFolder: 'input',
      outputFolder: 'output',
    },
  },
  exampleBucket: {
    name: 'example-bucket',
    routes: {
      imagesFolder: 'images',
      videosFolder: 'videos',
    },
  },
};

export type BucketConfigs = typeof BUCKET_CONFIGS;
export type BucketNames = keyof BucketConfigs;
