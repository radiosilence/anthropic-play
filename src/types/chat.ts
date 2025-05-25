export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

export interface StreamingResponse {
  type: "delta" | "complete" | "error";
  content?: string;
  response?: any;
  error?: string;
}

export interface ChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}