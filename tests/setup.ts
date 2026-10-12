import { vi } from 'vitest';
import { NOW_H } from './helpers';

// runSimulation() reads Date.now() to decide how far into the future the curve
// runs, so the clock is frozen at a fixed instant for every test.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(NOW_H * 3600 * 1000);
