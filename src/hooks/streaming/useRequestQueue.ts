import { useCallback, useEffect, useRef, useState } from "react";

export interface QueuedRequest {
  id: string;
  priority: number; // Higher number = higher priority
  timestamp: number;
  execute: () => Promise<void>;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  abortController?: AbortController;
}

export interface RequestQueueOptions {
  maxConcurrent?: number;
  maxQueueSize?: number;
  requestsPerMinute?: number;
  priorityComparator?: (a: QueuedRequest, b: QueuedRequest) => number;
}

interface QueueMetrics {
  queueLength: number;
  activeRequests: number;
  processedRequests: number;
  failedRequests: number;
  averageWaitTime: number;
  requestsPerMinute: number;
}

export function useRequestQueue(options: RequestQueueOptions = {}) {
  const {
    maxConcurrent = 3,
    maxQueueSize = 100,
    requestsPerMinute = 60,
    priorityComparator = (a, b) => {
      // Default: Higher priority first, then older requests first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.timestamp - b.timestamp;
    },
  } = options;

  const [queue, setQueue] = useState<QueuedRequest[]>([]);
  const [activeRequests, setActiveRequests] = useState<Set<string>>(new Set());
  const [metrics, setMetrics] = useState<QueueMetrics>({
    queueLength: 0,
    activeRequests: 0,
    processedRequests: 0,
    failedRequests: 0,
    averageWaitTime: 0,
    requestsPerMinute: 0,
  });

  const requestTimestamps = useRef<number[]>([]);
  const waitTimes = useRef<number[]>([]);
  const isProcessing = useRef(false);

  // Rate limiting
  const canMakeRequest = useCallback(() => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean up old timestamps
    requestTimestamps.current = requestTimestamps.current.filter(
      (timestamp) => timestamp > oneMinuteAgo,
    );

    return requestTimestamps.current.length < requestsPerMinute;
  }, [requestsPerMinute]);

  // Add request to queue
  const enqueue = useCallback(
    (request: Omit<QueuedRequest, "id" | "timestamp">) => {
      const id = crypto.randomUUID();
      const timestamp = Date.now();

      if (queue.length >= maxQueueSize) {
        const error = new Error(`Queue is full (max size: ${maxQueueSize})`);
        request.onError?.(error);
        return null;
      }

      const queuedRequest: QueuedRequest = {
        ...request,
        id,
        timestamp,
      };

      setQueue((prev) => {
        const newQueue = [...prev, queuedRequest];
        // Sort by priority
        newQueue.sort(priorityComparator);
        return newQueue;
      });

      console.log(
        `📥 Request ${id} added to queue with priority ${request.priority}`,
      );
      return id;
    },
    [queue.length, maxQueueSize, priorityComparator],
  );

  // Remove request from queue
  const dequeue = useCallback(
    (requestId: string) => {
      setQueue((prev) => prev.filter((req) => req.id !== requestId));

      // Also abort if active
      const activeReq = Array.from(activeRequests).find(
        (id) => id === requestId,
      );
      if (activeReq) {
        // Find the request and abort it
        const request = queue.find((req) => req.id === requestId);
        request?.abortController?.abort();
        setActiveRequests((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }

      console.log(`🗑️ Request ${requestId} removed from queue`);
    },
    [activeRequests, queue],
  );

  // Process queue
  const processQueue = useCallback(async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    try {
      while (
        queue.length > 0 &&
        activeRequests.size < maxConcurrent &&
        canMakeRequest()
      ) {
        const request = queue[0];
        if (!request) break;

        // Remove from queue
        setQueue((prev) => prev.slice(1));

        // Add to active requests
        setActiveRequests((prev) => new Set(prev).add(request.id));

        // Track wait time
        const waitTime = Date.now() - request.timestamp;
        waitTimes.current.push(waitTime);
        if (waitTimes.current.length > 100) {
          waitTimes.current = waitTimes.current.slice(-100);
        }

        // Track request timestamp for rate limiting
        requestTimestamps.current.push(Date.now());

        console.log(
          `🚀 Processing request ${request.id} (waited ${waitTime}ms, active: ${activeRequests.size + 1}/${maxConcurrent})`,
        );

        // Execute request
        try {
          await request.execute();

          setMetrics((prev) => ({
            ...prev,
            processedRequests: prev.processedRequests + 1,
          }));

          request.onComplete?.();
        } catch (error) {
          console.error(`❌ Request ${request.id} failed:`, error);

          setMetrics((prev) => ({
            ...prev,
            failedRequests: prev.failedRequests + 1,
          }));

          request.onError?.(error as Error);
        } finally {
          // Remove from active requests
          setActiveRequests((prev) => {
            const next = new Set(prev);
            next.delete(request.id);
            return next;
          });
        }
      }
    } finally {
      isProcessing.current = false;
    }

    // Continue processing if there are more requests
    if (queue.length > 0 && activeRequests.size < maxConcurrent) {
      // Small delay to prevent tight loop
      setTimeout(() => processQueue(), 100);
    }
  }, [queue, activeRequests.size, maxConcurrent, canMakeRequest]);

  // Process queue when conditions change
  useEffect(() => {
    processQueue();
  }, [processQueue]);

  // Update metrics
  useEffect(() => {
    const avgWaitTime =
      waitTimes.current.length > 0
        ? waitTimes.current.reduce((a, b) => a + b, 0) /
          waitTimes.current.length
        : 0;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = requestTimestamps.current.filter(
      (timestamp) => timestamp > oneMinuteAgo,
    ).length;

    setMetrics((prev) => ({
      ...prev,
      queueLength: queue.length,
      activeRequests: activeRequests.size,
      averageWaitTime: avgWaitTime,
      requestsPerMinute: recentRequests,
    }));
  }, [queue.length, activeRequests.size]);

  // Clear queue
  const clearQueue = useCallback(() => {
    // Abort all active requests
    for (const req of queue) {
      req.abortController?.abort();
    }

    setQueue([]);
    setActiveRequests(new Set());
    console.log("🧹 Queue cleared");
  }, [queue]);

  // Get queue state
  const getQueueState = useCallback(() => {
    return {
      queue: queue.map((req) => ({
        id: req.id,
        priority: req.priority,
        waitTime: Date.now() - req.timestamp,
      })),
      activeRequests: Array.from(activeRequests),
      canAcceptMore: queue.length < maxQueueSize,
      isRateLimited: !canMakeRequest(),
    };
  }, [queue, activeRequests, maxQueueSize, canMakeRequest]);

  return {
    enqueue,
    dequeue,
    clearQueue,
    getQueueState,
    metrics,
    isProcessing: activeRequests.size > 0 || queue.length > 0,
  };
}
