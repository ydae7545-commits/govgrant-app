export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: string;
  relatedGrantIds?: string[];
  suggestions?: string[];
}

export interface ChatResponse {
  keywords: string[];
  response: string;
  relatedGrantIds?: string[];
  followUpSuggestions?: string[];
}
