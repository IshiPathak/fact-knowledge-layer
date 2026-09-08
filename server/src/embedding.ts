import { pipeline } from '@xenova/transformers';

let extractorPromise: Promise<any> | null = null;

export async function getEmbedding(text: string): Promise<Float32Array> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const extractor = await extractorPromise;
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}
