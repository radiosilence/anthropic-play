interface RequestMetrics {
  requestId: string;
  procedure: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: string;
  input?: unknown;
  output?: unknown;
}

const activeRequests = new Map<string, RequestMetrics>();
const completedRequests: RequestMetrics[] = [];
const MAX_COMPLETED_REQUESTS = 1000;

export const createLoggingMiddleware = (
  requestId: string,
  procedure: string,
  type: string,
) => {
  const startTime = Date.now();

  console.log(`📊 [${requestId}] Starting ${type} ${procedure}`);

  // Store active request
  const metrics: RequestMetrics = {
    requestId,
    procedure,
    startTime,
    input: type !== "subscription" ? undefined : undefined,
  };
  activeRequests.set(requestId, metrics);

  return {
    onSuccess: (result?: unknown) => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      metrics.endTime = endTime;
      metrics.duration = duration;
      metrics.output = type !== "subscription" ? result : undefined;

      console.log(`✅ [${requestId}] Completed ${procedure} in ${duration}ms`);

      // Move to completed requests
      activeRequests.delete(requestId);
      completedRequests.push(metrics);

      // Maintain max size
      if (completedRequests.length > MAX_COMPLETED_REQUESTS) {
        completedRequests.shift();
      }
    },
    onError: (error: unknown) => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      metrics.endTime = endTime;
      metrics.duration = duration;
      metrics.error = error instanceof Error ? error.message : String(error);

      console.error(
        `❌ [${requestId}] Failed ${procedure} after ${duration}ms:`,
        error,
      );

      // Move to completed requests
      activeRequests.delete(requestId);
      completedRequests.push(metrics);

      // Maintain max size
      if (completedRequests.length > MAX_COMPLETED_REQUESTS) {
        completedRequests.shift();
      }
    },
  };
};

export const trackPerformance = async (
  procedure: string,
  fn: () => Promise<any>,
) => {
  const warnings: string[] = [];
  const startMemory = process.memoryUsage();
  const startCpu = process.cpuUsage();

  const result = await fn();

  const endMemory = process.memoryUsage();
  const endCpu = process.cpuUsage();

  const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
  const cpuDelta = {
    user: endCpu.user - startCpu.user,
    system: endCpu.system - startCpu.system,
  };

  console.log(`🔍 Performance metrics for ${procedure}:`, {
    memory: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
    cpu: `${(cpuDelta.user / 1000).toFixed(2)}ms user, ${(cpuDelta.system / 1000).toFixed(2)}ms system`,
    warnings,
  });

  return result;
};

// Export metrics functions
export function getActiveRequests() {
  return Array.from(activeRequests.values());
}

export function getCompletedRequests(limit = 100) {
  return completedRequests.slice(-limit);
}

export function getRequestMetrics() {
  const now = Date.now();
  const recentRequests = completedRequests.filter(
    (req) => req.endTime && now - req.endTime < 60000,
  );

  const averageDuration =
    recentRequests.length > 0
      ? recentRequests.reduce((sum, req) => sum + (req.duration || 0), 0) /
        recentRequests.length
      : 0;

  const errorRate =
    recentRequests.length > 0
      ? recentRequests.filter((req) => req.error).length / recentRequests.length
      : 0;

  return {
    activeRequests: activeRequests.size,
    completedRequests: completedRequests.length,
    requestsPerMinute: recentRequests.length,
    averageDuration,
    errorRate,
    slowestRequests: [...completedRequests]
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10),
  };
}
