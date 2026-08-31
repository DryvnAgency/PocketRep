export type SecureStoreLike = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

type ChunkManifest = {
  version: 1;
  generation: string;
  chunks: number;
};

const DEFAULT_CHUNK_SIZE = 1800;

function manifestKey(key: string): string {
  return `${key}.manifest`;
}

function chunkKey(key: string, generation: string, index: number): string {
  return `${key}.chunk.${generation}.${index}`;
}

function parseManifest(raw: string | null): ChunkManifest | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ChunkManifest>;
    if (value.version !== 1 || typeof value.generation !== 'string' || !Number.isInteger(value.chunks) || Number(value.chunks) < 1) {
      return null;
    }
    return value as ChunkManifest;
  } catch {
    return null;
  }
}

function generationId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChunkedSecureStorage(
  secureStore: SecureStoreLike,
  chunkSize = DEFAULT_CHUNK_SIZE,
) {
  const writes = new Map<string, Promise<void>>();

  const removeGeneration = async (key: string, manifest: ChunkManifest | null) => {
    if (!manifest) return;
    await Promise.all(
      Array.from({ length: manifest.chunks }, (_, index) =>
        secureStore.deleteItemAsync(chunkKey(key, manifest.generation, index)).catch(() => undefined),
      ),
    );
  };

  const runExclusive = (key: string, operation: () => Promise<void>): Promise<void> => {
    const previous = writes.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    writes.set(key, next);
    return next.finally(() => {
      if (writes.get(key) === next) writes.delete(key);
    });
  };

  return {
    async getItem(key: string): Promise<string | null> {
      await writes.get(key)?.catch(() => undefined);
      const manifest = parseManifest(await secureStore.getItemAsync(manifestKey(key)));
      if (!manifest) return secureStore.getItemAsync(key);

      const parts = await Promise.all(
        Array.from({ length: manifest.chunks }, (_, index) =>
          secureStore.getItemAsync(chunkKey(key, manifest.generation, index)),
        ),
      );
      if (parts.some(part => part === null)) return null;
      try {
        return decodeURIComponent(parts.join(''));
      } catch {
        return null;
      }
    },

    setItem(key: string, value: string): Promise<void> {
      return runExclusive(key, async () => {
        const oldManifest = parseManifest(await secureStore.getItemAsync(manifestKey(key)));
        const generation = generationId();
        const encoded = encodeURIComponent(value);
        const chunks = encoded.match(new RegExp(`.{1,${chunkSize}}`, 'g')) ?? [''];
        const nextManifest: ChunkManifest = { version: 1, generation, chunks: chunks.length };

        try {
          await Promise.all(chunks.map((chunk, index) =>
            secureStore.setItemAsync(chunkKey(key, generation, index), chunk),
          ));
          await secureStore.setItemAsync(manifestKey(key), JSON.stringify(nextManifest));
        } catch (error) {
          await removeGeneration(key, nextManifest);
          throw error;
        }

        await secureStore.deleteItemAsync(key).catch(() => undefined);
        await removeGeneration(key, oldManifest);
      });
    },

    removeItem(key: string): Promise<void> {
      return runExclusive(key, async () => {
        const manifest = parseManifest(await secureStore.getItemAsync(manifestKey(key)));
        await removeGeneration(key, manifest);
        await Promise.all([
          secureStore.deleteItemAsync(manifestKey(key)).catch(() => undefined),
          secureStore.deleteItemAsync(key).catch(() => undefined),
        ]);
      });
    },
  };
}
