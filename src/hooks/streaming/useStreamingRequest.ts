import type { StreamingResponseSchema } from "@/types/chat.schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";

interface UseStreamingRequestOptions {
  channelId: string;
  onDelta?: (content: string) => void;
  onComplete?: (response: any) => void;
  onError?: (error: Error) => void;
  timeout?: number; // Request timeout in milliseconds
}

interface StreamingRequestState {
  isStreaming: boolean;
  error: Error | null;
  startTime: number | null;
  endTime: number | null;
  bytesReceived: number;
  chunksReceived: number;
}

export function useStreamingRequest(options: UseStreamingRequestOptions) {
  const {
    channelId,
    onDelta,
    onComplete,
    onError,
    timeout = 60000, // 1 minute default timeout
  } = options;

  const [state, setState] = useState<StreamingRequestState>({
    isStreaming: false,
    error: null,
    startTime: null,
    endTime: null,
    bytesReceived: 0,
    chunksReceived: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Start a new streaming request
  const start = useCallback(() => {
    console.log(`🚀 Starting streaming request for channel: ${channelId}`);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    // Set up timeout
    if (timeout > 0) {
      timeoutIdRef.current = setTimeout(() => {
        console.warn(`⏱️ Request timed out after ${timeout}ms`);
        abort(new Error(`Request timed out after ${timeout}ms`));
      }, timeout);
    }

    setState({
      isStreaming: true,
      error: null,
      startTime: Date.now(),
      endTime: null,
      bytesReceived: 0,
      chunksReceived: 0,
    });
  }, [channelId, timeout]);

  // Abort the current request
  const abort = useCallback(
    (reason?: Error) => {
      console.log(`🛑 Aborting streaming request for channel: ${channelId}`);

      if (
        abortControllerRef.current &&
        !abortControllerRef.current.signal.aborted
      ) {
        abortControllerRef.current.abort(reason);
      }

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: reason || new Error("Request aborted"),
        endTime: Date.now(),
      }));

      if (reason && onError) {
        onError(reason);
      }
    },
    [channelId, onError],
  );

  // Handle incoming chunks
  const handleChunk = useCallback(
    (chunk: z.infer<typeof StreamingResponseSchema>) => {
      setState((prev) => ({
        ...prev,
        chunksReceived: prev.chunksReceived + 1,
        bytesReceived: prev.bytesReceived + (chunk.content?.length || 0),
      }));

      switch (chunk.type) {
        case "delta":
          if (chunk.content && onDelta) {
            onDelta(chunk.content);
          }
          break;

        case "complete":
          console.log(`✅ Stream completed for channel: ${channelId}`);
          if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current);
            timeoutIdRef.current = null;
          }

          setState((prev) => ({
            ...prev,
            isStreaming: false,
            endTime: Date.now(),
          }));

          if (onComplete) {
            onComplete(chunk.response);
          }
          break;

        case "error": {
          const error = new Error(chunk.error || "Unknown streaming error");
          console.error(`❌ Stream error for channel ${channelId}:`, error);
          abort(error);
          break;
        }
      }
    },
    [channelId, onDelta, onComplete, abort],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.isStreaming) {
        console.log(
          `🧹 Cleaning up streaming request on unmount for channel: ${channelId}`,
        );
        abort(new Error("Component unmounted"));
      }
    };
  }, [state.isStreaming, channelId, abort]);

  // Calculate metrics
  const getMetrics = useCallback(() => {
    const { startTime, endTime, bytesReceived, chunksReceived } = state;

    if (!startTime) return null;

    const duration = (endTime || Date.now()) - startTime;
    const throughput = bytesReceived / (duration / 1000); // bytes per second

    return {
      duration,
      bytesReceived,
      chunksReceived,
      throughput,
      averageChunkSize: chunksReceived > 0 ? bytesReceived / chunksReceived : 0,
    };
  }, [state]);

  return {
    ...state,
    start,
    abort,
    handleChunk,
    getMetrics,
    abortSignal: abortControllerRef.current?.signal,
  };
}
