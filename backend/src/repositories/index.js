import { env } from '../config/env.js';

let repos;

if (env.REPO_DRIVER === 'memory') {
  repos = await import('./memory.js');
} else {
  throw new Error(`Unknown REPO_DRIVER: ${env.REPO_DRIVER}`);
}

export const { userRepo, sessionRepo, reportRepo, overrideRepo, auditRepo, notificationRepo, chunkRepo, refreshTokenRepo, __resetStore } = repos;
