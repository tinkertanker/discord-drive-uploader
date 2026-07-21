import { FileStore } from '../../src/services/file-store.js';

class BlockingFileStore extends FileStore {
  constructor(initialData) {
    super();
    this.data = initialData;
    this.persistedData = structuredClone(initialData);
    this.persistCalls = 0;
    this.firstPersistReached = new Promise((resolve) => {
      this.markFirstPersistReached = resolve;
    });
    this.firstPersistBlocked = new Promise((resolve) => {
      this.releaseFirstPersist = resolve;
    });
  }

  async persist() {
    this.persistCalls += 1;
    const snapshot = structuredClone(this.data);
    if (this.persistCalls === 1) {
      this.markFirstPersistReached();
      await this.firstPersistBlocked;
    }
    this.persistedData = snapshot;
  }
}

describe('FileStore mutation ordering', () => {
  const originalTokens = {
    access_token: 'old_access_token',
    refresh_token: 'old_refresh_token'
  };
  const reconnectedTokens = {
    access_token: 'new_access_token',
    refresh_token: 'new_refresh_token'
  };

  test('a queued stale refresh cannot overwrite a reconnect that started first', async () => {
    const store = new BlockingFileStore({ google_tokens: originalTokens });
    const reconnect = store.set('google_tokens', reconnectedTokens);
    await store.firstPersistReached;

    const staleRefresh = store.updateJSONIf(
      'google_tokens',
      (tokens) => tokens.refresh_token === originalTokens.refresh_token,
      (tokens) => ({ ...tokens, access_token: 'stale_access_token' })
    );

    store.releaseFirstPersist();

    await expect(reconnect).resolves.toEqual(reconnectedTokens);
    await expect(staleRefresh).resolves.toEqual({
      updated: false,
      value: reconnectedTokens
    });
    await expect(store.get('google_tokens')).resolves.toEqual(reconnectedTokens);
    expect(store.persistedData.google_tokens).toEqual(reconnectedTokens);
  });

  test('a reconnect queued after a refresh remains the final credential set', async () => {
    const store = new BlockingFileStore({ google_tokens: originalTokens });
    const refresh = store.updateJSONIf(
      'google_tokens',
      (tokens) => tokens.refresh_token === originalTokens.refresh_token,
      (tokens) => ({ ...tokens, access_token: 'refreshed_access_token' })
    );
    await store.firstPersistReached;

    const reconnect = store.set('google_tokens', reconnectedTokens);
    store.releaseFirstPersist();

    await expect(refresh).resolves.toEqual({
      updated: true,
      value: {
        access_token: 'refreshed_access_token',
        refresh_token: 'old_refresh_token'
      }
    });
    await expect(reconnect).resolves.toEqual(reconnectedTokens);
    await expect(store.get('google_tokens')).resolves.toEqual(reconnectedTokens);
    expect(store.persistedData.google_tokens).toEqual(reconnectedTokens);
  });
});
