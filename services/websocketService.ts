import { Platform, AppState, AppStateStatus } from 'react-native';
import { useNewsStore } from '@/store/newsStore';
import { NewsItem, WebSocketError } from '@/types/news';
import { notificationService } from '@/services/notificationService';
import { decodeHtmlEntities, cleanupTweetContent } from '@/utils/textUtils';
import { fetchTreeNews, fetchPhoenixNews } from '@/services/apiService';

// Keep track of global WebSocket instances to prevent duplicate connections
let globalInstanceCount = 0;

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private url: string = '';
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10; // Increased from 5
  private lastPingTime: number = 0;
  private heartbeatIntervalMs: number = 30000; // 30 seconds
  private sourceType: 'tree' | 'phoenix';
  private authToken: string | null = null;
  private wasConnectedBefore: boolean = false;
  private instanceId: number;
  private isCleaned: boolean = false;
  private isHandlingErrorOrClose: boolean = false;
  private isCleanDisconnect: boolean = false;

  // Set up WebSockets and ensure they're not destroyed during hot reload
  private static treeInstance: WebSocketService | null = null;
  private static phoenixInstance: WebSocketService | null = null;
  
  // Factory method to ensure singleton instances
  static getInstance(type: 'tree' | 'phoenix'): WebSocketService {
    if (type === 'tree') {
      if (!WebSocketService.treeInstance || WebSocketService.treeInstance.isCleaned) {
        WebSocketService.treeInstance = new WebSocketService('tree');
      }
      return WebSocketService.treeInstance;
    } else {
      if (!WebSocketService.phoenixInstance || WebSocketService.phoenixInstance.isCleaned) {
        WebSocketService.phoenixInstance = new WebSocketService('phoenix');
      }
      return WebSocketService.phoenixInstance;
    }
  }

  constructor(sourceType: 'tree' | 'phoenix') {
    this.sourceType = sourceType;
    this.instanceId = ++globalInstanceCount;
    console.log(`[${this.sourceType}] Creating WebSocket service instance ${this.instanceId}`);
    
    // Set up AppState listener when service is created
    this.setupAppStateListener();
    
    // Initialize notification service
    if (Platform.OS !== 'web') {
      notificationService.initialize().catch(err => {
        console.error(`[${this.sourceType}] Error initializing notification service:`, err);
      });
    }
  }

  private setupAppStateListener() {
    // Remove existing subscription if any
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }

    // Subscribe to AppState changes
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    console.log(`[${this.sourceType}] App state changed to:`, nextAppState);
    
    if (nextAppState === 'active') {
      // App came to foreground
      console.log(`[${this.sourceType}] App is now active, checking connection...`);
      
      // Check if we need to reconnect
      if (!this.isConnected() && this.url) {
        console.log(`[${this.sourceType}] Connection lost while in background, reconnecting...`);
        this.connect(this.url, this.authToken);
      } else if (this.isConnected()) {
        // Send a ping to verify connection is still alive
        this.sendPing();
        
        // Fetch latest news to ensure we didn't miss anything while in background
        this.fetchLatestNews();
      }
    } else if (nextAppState === 'background') {
      // App went to background
      console.log(`[${this.sourceType}] App is now in background, maintaining connection...`);
      
      // Send a ping before going to background
      this.sendPing();
    }
  };

  connect(url: string, token: string | null = null) {
    // Skip if already cleaned up
    if (this.isCleaned) {
      console.warn(`[${this.sourceType}] Attempted to connect to a cleaned-up WebSocket service instance ${this.instanceId}`);
      return;
    }
    
    if (this.isConnecting) {
      return;
    }

    if (this.socket && this.isConnected()) {
      console.log(`[${this.sourceType}] Already connected, no need to reconnect`);
      return;
    }

    this.url = url;
    this.authToken = token;
    this.isConnecting = true;
    
    try {
      useNewsStore.getState().setIsLoading(true);
      useNewsStore.getState().setError(null);
      
      // Add a timeout to prevent hanging connections
      const connectionTimeout = setTimeout(() => {
        if (this.isConnecting) {
          useNewsStore.getState().setError(`[${this.sourceType}] Connection timeout - server not responding`);
          this.setConnectionStatus(false);
          this.isConnecting = false;
          this.scheduleReconnect();
        }
      }, 15000);

      // Cleanup any existing socket before creating a new one
      this.closeExistingSocket();
      
      console.log(`[${this.sourceType}] Attempting to connect to WebSocket:`, url);
      this.socket = new WebSocket(url);
      
      this.socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.handleOpen();
        
        // If we have a token, send login message
        if (token) {
          this.sendLoginMessage(token);
        }
      };
      
      this.socket.onmessage = this.handleMessage;
      
      this.socket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        this.handleError(error);
      };
      
      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.handleClose(event);
      };
    } catch (error) {
      this.isConnecting = false;
      const errorMessage = this.getReadableErrorMessage(error);
      useNewsStore.getState().setError(`[${this.sourceType}] Failed to connect: ${errorMessage}`);
      this.setConnectionStatus(false);
      useNewsStore.getState().setIsLoading(false);
      this.scheduleReconnect();
    }
  }

  // Helper to properly close an existing socket before creating a new one
  private closeExistingSocket() {
    if (this.socket) {
      try {
        // Remove event handlers to prevent callbacks
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        
        // Only call close() if the socket isn't already closed or closing
        if (this.socket.readyState !== WebSocket.CLOSED && this.socket.readyState !== WebSocket.CLOSING) {
          this.socket.close();
        }
      } catch (error) {
        console.warn(`[${this.sourceType}] Error closing existing socket:`, error);
      }
      
      this.socket = null;
    }
  }

  disconnect() {
    // Skip if already cleaned up
    if (this.isCleaned) {
      console.warn(`[${this.sourceType}] Attempted to disconnect a cleaned-up service instance ${this.instanceId}`);
      return Promise.resolve();
    }
    
    // Stop heartbeat and reconnection attempts
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Already disconnected
    if (!this.socket) {
      return Promise.resolve();
    }
    
    return new Promise<void>((resolve) => {
      try {
        // Mark this as a clean disconnect so we don't auto-reconnect
        this.isCleanDisconnect = true;
        
        // Reset reconnect attempts since this is an intentional disconnect
        this.reconnectAttempts = 0;
        
        if (this.socket) {
          // Only try to close if socket exists and is not already closing/closed
          if (this.socket.readyState !== WebSocket.CLOSING && 
              this.socket.readyState !== WebSocket.CLOSED) {
            
            // Set a timeout to resolve in case the close event doesn't fire
            const timeoutId = setTimeout(() => {
              console.log(`[${this.sourceType}] Close event didn't fire, forcing resolution`);
              this.socket = null;
              this.setConnectionStatus(false);
              resolve();
            }, 1000);
            
            // Set up a one-time close handler to clean up
            const onClose = () => {
              clearTimeout(timeoutId);
              this.socket = null;
              resolve();
            };
            
            // Add a listener for the close event
            this.socket.addEventListener('close', onClose, { once: true });
            
            // Close the socket
            this.socket.close(1000, 'User initiated disconnect');
          } else {
            // Socket already closing or closed
            this.socket = null;
            resolve();
          }
        } else {
          resolve();
        }
      } catch (e) {
        console.error(`[${this.sourceType}] Error during disconnect:`, e);
        this.socket = null;
        resolve();
      }
    });
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  private sendLoginMessage(token: string) {
    if (!this.isConnected()) {
      console.log(`[${this.sourceType}] Cannot send login: not connected`);
      return;
    }
    
    try {
const loginMessage = `login ${token}`;
console.log(`[${this.sourceType}] Sending login message: ${loginMessage}`);
      this.socket?.send(loginMessage);
      console.log(`[${this.sourceType}] Sent login message`);
    } catch (error) {
      console.error(`[${this.sourceType}] Error sending login message:`, error);
    }
  }

  private handleOpen = () => {
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.setConnectionStatus(true);
    useNewsStore.getState().setIsLoading(false);
    useNewsStore.getState().setError(null);
    console.log(`[${this.sourceType}] WebSocket connected successfully`);
    
    // Start heartbeat to keep connection alive
    this.startHeartbeat();
    
    // If we were connected before and reconnected, fetch latest news to catch up
    if (this.wasConnectedBefore) {
      console.log(`[${this.sourceType}] Reconnected after disconnect, fetching latest news...`);
      this.fetchLatestNews();
    }
    
    this.wasConnectedBefore = true;
  };

  private fetchLatestNews(retryCount = 0) {
    // Fetch latest news from API to ensure we didn't miss anything during disconnection
    try {
      if (this.sourceType === 'tree') {
        fetchTreeNews().catch(err => {
          console.log(`[${this.sourceType}] Error fetching news after reconnect:`, err);
          this.retryFetchNews(retryCount);
        });
      } else if (this.sourceType === 'phoenix') {
        fetchPhoenixNews().catch(err => {
          console.log(`[${this.sourceType}] Error fetching news after reconnect:`, err);
          this.retryFetchNews(retryCount);
        });
      }
    } catch (error) {
      console.error(`[${this.sourceType}] Error fetching news after reconnect:`, error);
      this.retryFetchNews(retryCount);
    }
  }
  
  private retryFetchNews(retryCount: number) {
    if (retryCount < 3) { // Max 3 retry attempts
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff with max 10s
      console.log(`[${this.sourceType}] Retrying fetch latest news in ${delay/1000}s (attempt ${retryCount + 1}/3)`);
      
      setTimeout(() => {
        this.fetchLatestNews(retryCount + 1);
      }, delay);
    } else {
      console.log(`[${this.sourceType}] Max retry attempts reached for fetching latest news`);
    }
  }

  private handleMessage = (event: WebSocketMessageEvent) => {
    try {
      // Check if it's a pong response to our ping
      if (event.data === 'pong') {
        console.log(`[${this.sourceType}] Received pong from server`);
        return;
      }
      
      // Parse the message
      const data = JSON.parse(event.data);
      
      // Handle Phoenix format
      if (this.sourceType === 'phoenix') {
        // Phoenix might send an array or a single object
        const items = Array.isArray(data) ? data : [data];
        
        items.forEach(item => {
          const newsItem: NewsItem = this.convertPhoenixFormat(item);
          this.processNewsItem(newsItem);
        });
      } 
      // Handle Tree format
      else {
        const newsItem: NewsItem = this.convertTreeFormat(data);
        this.processNewsItem(newsItem);
      }
    } catch (error) {
      console.error(`[${this.sourceType}] Error parsing message:`, error);
    }
  };

  private convertTreeFormat(item: any): NewsItem {
    try {
      // Validate required fields
      if (!item || typeof item !== 'object') {
        throw new Error('Invalid news item: not an object');
      }
      
      if (!item._id) {
        item._id = `tree-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      }
      
      // Determine if this is a Twitter/X post using the same isTwitterOrXPost check used elsewhere
      const isTwitterOrXPost = 
        item.source === 'X' || 
        item.source === 'Twitter' ||
        (item.info?.twitterId && item.title?.includes('@'));
      
      // Decode HTML entities in title and body
      let title = decodeHtmlEntities(item.title || '');
      let body = decodeHtmlEntities(item.body || '');
      
      // For Twitter posts, clean up the title to remove duplicate quoted content and URLs
      if (isTwitterOrXPost && title) {
        // Clean up the title - remove URLs and quoted content
        title = cleanupTweetContent(title);
      }
      
      // Set source to X for Twitter posts
      if (isTwitterOrXPost) {
        item.source = 'X';
      }
      
      // Decode HTML entities in quoted content
      if (item.info?.quotedUser?.text) {
        item.info.quotedUser.text = decodeHtmlEntities(item.info.quotedUser.text);
      }
      
      // Create the news item
      const newsItem: NewsItem = {
        _id: item._id,
        title: title,
        body: body,
        source: item.source || (isTwitterOrXPost ? 'X' : 'News'),
        url: item.url || item.link,
        time: item.time || Date.now(),
        suggestions: Array.isArray(item.suggestions) ? item.suggestions : [],
        icon: item.icon,
        image: item.image,
        info: item.info,
        isHighlighted: item.isHighlighted,
        requireInteraction: item.requireInteraction,
        type: item.type,
        coin: item.coin,
        newsSource: 'tree'
      };
      
      return newsItem;
    } catch (error) {
      console.error(`[${this.sourceType}] Error converting Tree format:`, error);
      // Return a minimal valid NewsItem to prevent crashes
      return {
        _id: `error-tree-${Date.now()}`,
        title: 'Error processing news item',
        source: 'Error',
        time: Date.now(),
        newsSource: 'tree'
      };
    }
  }

  private convertPhoenixFormat(item: any): NewsItem {
    try {
      // Validate required fields
      if (!item || typeof item !== 'object') {
        throw new Error('Invalid news item: not an object');
      }
      
      // Generate a unique ID if needed
      const id = item._id || `phoenix-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Determine if this is a Twitter/X post using the same isTwitterOrXPost check as elsewhere
      const isTwitterOrXPost = 
        item.source === 'X' || 
        item.source === 'Twitter' ||
        (item.twitterId && item.username);
      
      // Format title and body
      let title = item.title || '';
      let body = item.body || '';
      let quotedText = null;
      let quotedUser = null;
      
      // For Twitter posts from Phoenix, use the body as the title
      if (isTwitterOrXPost && body) {
        try {
          // Check if this is a quoted tweet (contains "&gt;&gt;QUOTE")
          const quoteMarker = "&gt;&gt;QUOTE ";
          const quoteIndex = body.indexOf(quoteMarker);
          
          if (quoteIndex !== -1) {
            // Extract the main tweet content
            const mainContent = body.substring(0, quoteIndex).trim();
            
            // Extract the quoted content
            const quoteContent = body.substring(quoteIndex + quoteMarker.length);
            
            // Find the username in the quoted part
            const usernameEndIndex = quoteContent.indexOf(")");
            if (usernameEndIndex !== -1 && usernameEndIndex < quoteContent.length) {
              const quotedUserInfo = quoteContent.substring(0, usernameEndIndex + 1);
              const quotedContent = quoteContent.substring(usernameEndIndex + 1).trim();
              
              try {
                // Extract username from format like "Username (@handle)"
                const usernameMatch = quotedUserInfo.match(/(.*?)\s*\((.*?)\)/);
                if (usernameMatch && usernameMatch.length >= 3) {
                  const name = usernameMatch[1].trim();
                  const screenName = usernameMatch[2].trim().replace('@', '');
                  
                  quotedUser = {
                    name,
                    screen_name: screenName,
                    text: quotedContent,
icon: undefined, // Change null to undefined to match expected type
                    image: null
                  };
                } else {
                  // Fallback if we can't parse the username format
                  quotedUser = {
                    name: quotedUserInfo,
                    screen_name: '',
                    text: quotedContent,
                    icon: null,
                    image: null
                  };
                }
              } catch (parseError) {
                console.error(`[${this.sourceType}] Error parsing quoted username:`, parseError);
                quotedUser = {
                  name: 'Unknown User',
                  screen_name: '',
                  text: quotedContent,
                  icon: null,
                  image: null
                };
              }
              
              // Use only the main content as the title
              title = mainContent;
            } else {
              // If we can't parse the quoted content properly, just use everything
              title = body;
            }
          } else {
            // No quote, use the whole body as title
            title = body;
          }
          
          // Clear body since we're using it as title
          body = '';
        } catch (quoteParseError) {
          console.error(`[${this.sourceType}] Error parsing quote in tweet:`, quoteParseError);
          // On error, just use the entire body as title
          title = body;
          body = '';
        }
      }
      
      // Decode HTML entities in title and body
      title = decodeHtmlEntities(title);
      body = decodeHtmlEntities(body);
      
      // Clean up URLs from tweet content
      if (isTwitterOrXPost) {
        title = cleanupTweetContent(title);
      }
      
      // Get timestamp or fallback to current time
      const timestamp = item.time || 
        (item.createdAt ? new Date(item.createdAt).getTime() : 
          (item.receivedAt ? new Date(item.receivedAt).getTime() : Date.now()));
      
      // Convert Phoenix format to our standard NewsItem format
      const newsItem: NewsItem = {
        _id: id,
        title: title,
        body: body,
        source: isTwitterOrXPost ? 'X' : (item.sourceName || item.source || 'Unknown'),
        url: item.url || '',
        time: timestamp,
        suggestions: Array.isArray(item.suggestions) ? item.suggestions : [],
        icon: item.icon,
        image: item.image,
        newsSource: 'phoenix'
      };
      
      // Handle Twitter info
      if (isTwitterOrXPost) {
        // Add Twitter info
        newsItem.info = {
          twitterId: item.twitterId || item.tweetId || '',
          isReply: Boolean(item.isReply),
          isRetweet: Boolean(item.isRetweet),
          isQuote: Boolean(item.isQuote),
          isSelfReply: Boolean(item.isSelfReply),
          username: item.username || '',
          name: item.name || ''
        };
        
        // Add quoted content if we extracted it
        if (item.isQuote) {
          if (quotedUser) {
            // Use our extracted quoted content
            newsItem.info.quotedUser = quotedUser;
          } else if (item.quotedUser) {
            // Use Phoenix's quoted user if available
            newsItem.info.quotedUser = {
              name: item.quotedUser.name || '',
              screen_name: item.quotedUser.screen_name || '',
              icon: item.quotedUser.icon,
              text: decodeHtmlEntities(item.quotedUser.text || ''),
              image: item.quotedUser.image
            };
          }
        }
      }
      
      return newsItem;
    } catch (error) {
      console.error(`[${this.sourceType}] Error converting Phoenix format:`, error);
      // Return a minimal valid NewsItem to prevent crashes
      return {
        _id: `error-phoenix-${Date.now()}`,
        title: 'Error processing news item',
        source: 'Error',
        time: Date.now(),
        newsSource: 'phoenix'
      };
    }
  }

  private handleError(error: Event) {
    if (this.isCleaned) {
      console.log(`[${this.sourceType}] Error received after cleanup, ignoring`);
      return;
    }
    
    // Prevent multiple error handlers from running concurrently
    if (this.isHandlingErrorOrClose) {
      console.log(`[${this.sourceType}] Error handler already running, queuing`);
      
      // Add to the queue after the current handler finishes
      setTimeout(() => {
        this.handleError(error);
      }, 100);
      return;
    }
    
    this.isHandlingErrorOrClose = true;
    
    try {
      console.error(`[${this.sourceType}] WebSocket error:`, error);
      
      useNewsStore.getState().setError(`[${this.sourceType}] WebSocket error`);
      
      // Set connection status to disconnected
      this.setConnectionStatus(false);
      
      // Don't try to close the socket here, let onclose handle it
      // Just schedule a reconnect
      this.isConnecting = false;
      this.scheduleReconnect();
    } finally {
      this.isHandlingErrorOrClose = false;
    }
  }
  
private handleClose(event: WebSocketCloseEvent) {
    if (this.isCleaned) {
      console.log(`[${this.sourceType}] Close event received after cleanup, ignoring`);
      return;
    }
    
    // Prevent multiple close handlers from running concurrently
    if (this.isHandlingErrorOrClose) {
      console.log(`[${this.sourceType}] Close handler already running, queuing`);
      
      // Add to the queue after the current handler finishes
      setTimeout(() => {
        this.handleClose(event);
      }, 100);
      return;
    }
    
    this.isHandlingErrorOrClose = true;
    
    try {
      let reason = 'Unknown reason';
      
      // Parse close event for more details
      if (event) {
        if (event.code === 1000) {
          reason = 'Normal closure';
        } else if (event.code === 1001) {
          reason = 'Server going down or client navigating away';
        } else if (event.code === 1006) {
          reason = 'Abnormal closure, connection lost';
        } else if (event.code === 1008) {
          reason = 'Policy violation';
        } else if (event.code === 1011) {
          reason = 'Server error';
        } else if (event.code === 1012) {
          reason = 'Server restarting';
        } else if (event.code === 1013) {
          reason = 'Try again later';
        }
        
        if (event.reason) {
          reason += `: ${event.reason}`;
        }
      }
      
      console.log(`[${this.sourceType}] WebSocket closed: ${reason} (code: ${event?.code || 'none'})`);
      
      // Skip error UI if this was a clean disconnect initiated by the user
      if (!this.isCleanDisconnect) {
        useNewsStore.getState().setError(`[${this.sourceType}] Connection closed: ${reason}`);
      }
      
      // Set connection status to disconnected
      this.setConnectionStatus(false);
      
      // Null out the socket reference
      this.socket = null;
      
      // Only reconnect if not a clean disconnect
      if (!this.isCleanDisconnect) {
        this.isConnecting = false;
        this.scheduleReconnect();
      }
      
      this.isCleanDisconnect = false;
      useNewsStore.getState().setIsLoading(false);
    } finally {
      this.isHandlingErrorOrClose = false;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing interval
    
    this.heartbeatInterval = setInterval(() => {
      this.sendPing();
    }, this.heartbeatIntervalMs);
    
    console.log(`[${this.sourceType}] Started heartbeat interval`);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log(`[${this.sourceType}] Stopped heartbeat interval`);
    }
  }

  private sendPing() {
    if (!this.isConnected()) {
      console.log(`[${this.sourceType}] Cannot send ping: not connected`);
      return;
    }
    
    try {
      // Some WebSocket servers accept a ping frame, others expect a message
      // We'll try to send a ping message first
      this.socket?.send('ping');
      this.lastPingTime = Date.now();
      console.log(`[${this.sourceType}] Sent ping to server`);
    } catch (error) {
      console.error(`[${this.sourceType}] Error sending ping:`, error);
      
      // If sending ping fails, the connection might be dead
      if (this.socket) {
        this.socket.close();
        this.handleClose({ code: 1006 } as WebSocketCloseEvent);
      }
    }
  }

  private getReadableErrorMessage(error: any): string {
    if (!error) {
      return 'Unknown error';
    }
    
    // Handle network errors
    if (typeof error === 'object') {
      if ('message' in error) {
        const message = error.message as string;
        
        // Handle common network errors
        if (message.includes('kCFErrorDomainCFNetwork')) {
          return 'Network connection error. Please check your internet connection.';
        }
        
        if (message.includes('timeout')) {
          return 'Connection timed out. Server may be unavailable.';
        }
        
        if (message.includes('ECONNREFUSED')) {
          return 'Connection refused. Server may be down or unreachable.';
        }
        
        if (message.includes('certificate')) {
          return 'SSL certificate error. Connection not secure.';
        }
        
        return message;
      }
      
      if ('code' in error) {
        return `Error code: ${error.code}`;
      }
    }
    
    return String(error);
  }

  // Reset reconnect attempts counter (for sync with background service)
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
    this.lastPingTime = Date.now(); // Reset ping time to avoid false positive disconnections
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    console.log(`[${this.sourceType}] Reset reconnection attempt counter`);
  }

  private scheduleReconnect() {
    if (!this.reconnectTimeout && this.url) {
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        console.log(`[${this.sourceType}] Max reconnect attempts reached, but will keep trying with longer intervals`);
        this.reconnectAttempts = this.maxReconnectAttempts; // Cap at max to maintain the max delay
      }
      
      // Exponential backoff with a cap
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 60000); // Cap at 1 minute
      
      console.log(`[${this.sourceType}] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay/1000} seconds...`);
      
      this.reconnectTimeout = setTimeout(() => {
        console.log(`[${this.sourceType}] Attempting to reconnect (attempt ${this.reconnectAttempts})...`);
        this.connect(this.url, this.authToken);
        this.reconnectTimeout = null;
      }, delay);
    }
  }

  private setConnectionStatus(isConnected: boolean) {
    if (this.sourceType === 'tree') {
      useNewsStore.getState().setTreeConnected(isConnected);
    } else {
      useNewsStore.getState().setPhoenixConnected(isConnected);
    }
  }

  // Process and add a news item, triggering notifications if needed
  private processNewsItem(newsItem: NewsItem) {
    try {
      // Get current store state once
      const store = useNewsStore.getState();
      
      // Check for filter keyword matches
      const { filterKeywords, showTwitterPosts } = store;
      
      // Skip Twitter/X posts if twitter toggle filter is enabled
      // Check both source field and other Twitter indicators
      const isTwitterOrXPost = 
        newsItem.source === 'X' || 
        newsItem.source === 'Twitter' ||
        (newsItem.info?.twitterId && newsItem.title?.includes('@'));
        
      if (!showTwitterPosts && isTwitterOrXPost) {
        console.log('Skipping Twitter/X post based on user preferences:', newsItem.title);
        return;
      }
      
      // Find matched keyword but don't trigger notification here (let the store handle it)
      let matchedKeyword: string | undefined = undefined;
      if (filterKeywords.length > 0) {
        const titleLower = newsItem.title?.toLowerCase() || '';
        const bodyLower = newsItem.body?.toLowerCase() || '';
        
        for (const filter of filterKeywords) {
          if (titleLower.includes(filter.keyword) || bodyLower.includes(filter.keyword)) {
            console.log(`Matched keyword "${filter.keyword}" in news item:`, newsItem.title);
            matchedKeyword = filter.keyword;
            break;
          }
        }
      }
      
      // Set matched keyword
      if (matchedKeyword) {
        newsItem.matchedKeyword = matchedKeyword;
      }
      
      // Add news to store (store will handle notification)
      store.addNews(newsItem);
    } catch (error) {
      console.error(`[${this.sourceType}] Error processing news item:`, error);
    }
  }

  // Call this when the app is being unmounted
  cleanup() {
    console.log(`[${this.sourceType}] Cleaning up WebSocket service instance ${this.instanceId}`);
    
    // Mark as cleaned to prevent further actions
    this.isCleaned = true;
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Remove AppState listener
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    
    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Synchronize with background service by resetting reconnect attempts
    try {
      // Import only when needed to avoid circular dependencies
      const { backgroundService } = require('./backgroundService');
      
      if (this.sourceType === 'tree') {
        const reconnectAttempts = require('./backgroundService').reconnectAttempts;
        if (reconnectAttempts) reconnectAttempts.tree = 0;
      } else if (this.sourceType === 'phoenix') {
        const reconnectAttempts = require('./backgroundService').reconnectAttempts;
        if (reconnectAttempts) reconnectAttempts.phoenix = 0;
      }
    } catch (error) {
      console.warn(`[${this.sourceType}] Error syncing with background service:`, error);
    }
    
    // Disconnect from WebSocket
    this.disconnect();
    
    // Reset variables
    this.url = '';
    this.authToken = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.wasConnectedBefore = false;
    
    console.log(`[${this.sourceType}] WebSocket service cleanup complete`);
  }

  // Get current global WebSocket URLs
  private getGlobalWebSocketUrls() {
    try {
      // Try to get from the store first
      const { useNewsStore } = require('@/store/newsStore');
      const { serverConfig } = useNewsStore.getState();
      
      const urls = {
        treeWebsocketUrl: serverConfig.treeWebsocketUrl || globalThis.treeWebsocketUrl,
        treeToken: serverConfig.treeToken || globalThis.treeToken,
        phoenixWebsocketUrl: serverConfig.phoenixWebsocketUrl || globalThis.phoenixWebsocketUrl,
        phoenixToken: serverConfig.phoenixToken || globalThis.phoenixToken
      };
      
      return urls;
    } catch (error) {
      // Fallback to global variables if store is not accessible
      return {
        treeWebsocketUrl: globalThis.treeWebsocketUrl,
        treeToken: globalThis.treeToken,
        phoenixWebsocketUrl: globalThis.phoenixWebsocketUrl,
        phoenixToken: globalThis.phoenixToken
      };
    }
  }

  // Trigger a global reconnection for both websocket services
  static reconnectAll() {
    console.log('Triggering global reconnection for all WebSocket services');
    
    try {
      // Disconnect first to ensure clean reconnection
      if (WebSocketService.treeInstance) {
        WebSocketService.treeInstance.disconnect().then(() => {
          const urls = WebSocketService.treeInstance?.getGlobalWebSocketUrls();
          if (urls && urls.treeWebsocketUrl) {
            setTimeout(() => {
              WebSocketService.treeInstance?.connect(urls.treeWebsocketUrl, urls.treeToken || null);
            }, 300);
          }
        });
      }
      
      if (WebSocketService.phoenixInstance) {
        WebSocketService.phoenixInstance.disconnect().then(() => {
          const urls = WebSocketService.phoenixInstance?.getGlobalWebSocketUrls();
          if (urls && urls.phoenixWebsocketUrl) {
            setTimeout(() => {
              WebSocketService.phoenixInstance?.connect(urls.phoenixWebsocketUrl, urls.phoenixToken || null);
            }, 300);
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error during global reconnection:', error);
      return false;
    }
  }

  // Clean up all instances on app exit
  static cleanupAll() {
    console.log('Cleaning up all WebSocket services');
    
    try {
      if (WebSocketService.treeInstance) {
        WebSocketService.treeInstance.cleanup();
      }
      
      if (WebSocketService.phoenixInstance) {
        WebSocketService.phoenixInstance.cleanup();
      }
      
      return true;
    } catch (error) {
      console.error('Error during global cleanup:', error);
      return false;
    }
  }
}

// Create instances for each service
export const treeWebsocketService = WebSocketService.getInstance('tree');
export const phoenixWebsocketService = WebSocketService.getInstance('phoenix');

// Helper function to create a WebSocketError
export function createWebSocketError(
  type: 'connection' | 'message' | 'close',
  message: string,
  code?: number
): WebSocketError {
  return {
    type,
    message,
    code,
    timestamp: Date.now()
  };
}