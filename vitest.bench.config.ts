import { defineConfig } from 'vitest/config';
import base from './vitest.config';
export default defineConfig({ ...base, test: { ...base.test, include: ['benchmarks/**/*.test.ts'], fileParallelism: false, testTimeout: 30000 } });
