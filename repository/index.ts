import { FirestoreRepository, createFirestoreClient } from './firestoreRepository';
import { createDemoRepository } from './memoryRepository';
import type { ActivityRepository } from '../types';

/**
 * Composition root for the persistence layer.
 *
 * Selects a concrete {@link ActivityRepository} once, lazily: Firestore when a
 * client can be created, otherwise an in-memory demo repository. Routes call
 * {@link getRepository} and never know which backend they got — this is the
 * dependency-injection seam for the whole app.
 */
let instance: ActivityRepository | null = null;

export function getRepository(): ActivityRepository {
  if (instance) return instance;
  const db = createFirestoreClient();
  instance = db ? new FirestoreRepository(db) : createDemoRepository();
  return instance;
}

/** Inject a specific repository (used by tests to supply a fake). */
export function setRepository(repo: ActivityRepository): void {
  instance = repo;
}

/** Clear the cached repository so the next getRepository() re-selects. */
export function resetRepository(): void {
  instance = null;
}
