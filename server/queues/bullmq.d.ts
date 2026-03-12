declare module "bullmq" {
  export class Queue {
    constructor(name: string, opts?: Record<string, unknown>);
    add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<{ id?: string }>;
    getJobCounts(): Promise<Record<string, number>>;
    getWaitingCount(): Promise<number>;
    getActiveCount(): Promise<number>;
    getCompletedCount(): Promise<number>;
    getFailedCount(): Promise<number>;
    close(): Promise<void>;
  }
  export class Worker {
    constructor(name: string, processor: (job: { id?: string; data: Record<string, unknown>; name: string }) => Promise<void>, opts?: Record<string, unknown>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, handler: (...args: any[]) => void): void;
    close(): Promise<void>;
  }
}
