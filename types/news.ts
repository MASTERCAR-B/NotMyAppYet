// Define enum types for better type safety
export type NewsSource = 'tree' | 'phoenix';
export type NewsSourceType = 'twitter' | 'news' | 'blog' | 'announcement' | 'exchange' | 'other';

export interface NewsItem {
  _id: string;
  title: string;
  body?: string;
  source: string;                  // Source name (e.g., "Twitter", "Binance")
  url?: string;
  time: number;                    // Unix timestamp in milliseconds since epoch
  symbols?: string[];              // Cryptocurrency symbols mentioned in the news
  suggestions?: Suggestion[];
  icon?: string;                   // URL to the source icon
  image?: string;                  // URL to the news image
  info?: TwitterInfo;              // Twitter-specific information, if source is Twitter
  isHighlighted?: boolean;         // Whether the news item should be highlighted
  requireInteraction?: boolean;    // Whether notification should require user interaction
  type?: NewsSourceType;           // Type of news source
  coin?: string;                   // Main cryptocurrency related to the news
  matchedKeyword?: string;         // Added to track which keyword matched
  newsSource: NewsSource;          // Which news provider this came from (required)
}

export interface Suggestion {
  coin: string;                    // Cryptocurrency name
  found: string[];                 // Strings that triggered the suggestion
  symbols: SymbolInfo[];           // Trading pairs for this coin
  supply?: number;                 // Cryptocurrency supply
}

export interface SymbolInfo {
  exchange: string;                // Exchange name (e.g., "Binance")
  symbol: string;                  // Trading pair (e.g., "BTCUSDT")
}

export interface TwitterInfo {
  twitterId?: string;              // Twitter/X post ID
  isReply?: boolean;               // Whether this is a reply to another post
  isRetweet?: boolean;             // Whether this is a retweet
  isQuote?: boolean;               // Whether this is a quote tweet
  isSelfReply?: boolean;           // Whether this is a reply to the user's own tweet
  username?: string;               // Twitter/X @username (handle)
  name?: string;                   // Twitter/X display name
  quotedUser?: {
    name?: string;                 // Name of the user being quoted
    screen_name?: string;          // @username of the user being quoted
    icon?: string;                 // Profile picture URL of the quoted user
    text?: string;                 // Content of the quoted tweet
    image?: string;                // Image URL from the quoted tweet
  };
}

export interface ServerConfig {
  treeWebsocketUrl: string;        // WebSocket URL for Tree of Alpha
  treeApiUrl: string;              // REST API URL for Tree of Alpha
  treeToken: string;               // Authentication token for Tree of Alpha
  phoenixWebsocketUrl: string;     // WebSocket URL for Phoenix
  phoenixApiUrl: string;           // REST API URL for Phoenix
  phoenixToken: string;            // Authentication token for Phoenix
}

export interface FilterKeyword {
  id: string;                      // Unique identifier for the keyword
  keyword: string;                 // The actual keyword text to match against
}

// Error types for WebSocket handling
export interface WebSocketError {
  type: 'connection' | 'message' | 'close';
  code?: number;
  message: string;
  timestamp: number;               // Unix timestamp in milliseconds
}

// Helper function to validate a NewsItem object
export function isValidNewsItem(item: any): item is NewsItem {
  return (
    typeof item === 'object' &&
    typeof item._id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.source === 'string' &&
    typeof item.time === 'number' &&
    (item.newsSource === 'tree' || item.newsSource === 'phoenix')
  );
}