import { Platform } from 'react-native';
import { useNewsStore } from '@/store/newsStore';
import { NewsItem, FilterKeyword } from '@/types/news';
import { mockNews } from '@/mocks/news';
import { decodeHtmlEntities, cleanupTweetContent } from '@/utils/textUtils';

// Helper function to check for keyword matches
function findMatchedKeyword(newsItem: NewsItem, filterKeywords: FilterKeyword[]): string | undefined {
  if (!filterKeywords.length) return undefined;
  
  const titleLower = newsItem.title?.toLowerCase() || '';
  const bodyLower = newsItem.body?.toLowerCase() || '';
  
  for (const filter of filterKeywords) {
    if (titleLower.includes(filter.keyword) || bodyLower.includes(filter.keyword)) {
      return filter.keyword;
    }
  }
  
  return undefined;
}

// Helper function to create fetch headers
function createApiHeaders(token?: string | null): HeadersInit | undefined {
  // Create headers object conditionally to avoid CORS issues on web
  if (token) {
    return {
      'Authorization': `Bearer ${token}`
    };
  }
  return undefined;
}

// Add simple retry mechanism for API calls
async function fetchWithRetry(url: string, options?: RequestInit, retries = 2, timeout = 15000): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // If not the first attempt, add exponential backoff delay
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10s delay
        console.log(`Retry attempt ${attempt}/${retries}, waiting ${delay}ms before next attempt`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Attempt the fetch with timeout
      const response = await Promise.race([
        fetch(url, options),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ]) as Response;
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      console.warn(`Fetch attempt ${attempt + 1}/${retries + 1} failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on CORS errors as they will always fail
      if (lastError.message.includes('CORS') || lastError.message.includes('cross-origin')) {
        throw lastError;
      }
    }
  }
  
  // If we get here, all retries failed
  throw lastError || new Error('All retry attempts failed');
}

export const fetchTreeNews = async (): Promise<void> => {
  const store = useNewsStore.getState();
  const { treeApiUrl, treeToken } = store.serverConfig;
  const { filterKeywords } = store;
  
  store.setIsLoading(true);
  store.setError(null);
  
  try {
    console.log('[Tree] Fetching news from API:', treeApiUrl);
    
    // Create headers
    const headers = createApiHeaders(treeToken);
    
    // Fetch with retry
    const response = await fetchWithRetry(treeApiUrl, { headers });
    const data: NewsItem[] = await response.json();
    
    console.log(`[Tree] Received ${data.length} news items from API`);
    
    // Process the news items
    const processedNews = data.map(item => {
      // Determine if this is a Twitter/X post
      const isTwitterPost = item.title?.includes('@') && item.icon && item.info?.twitterId;
      
      // Clean up Twitter posts by removing URLs and quoted content
      if (isTwitterPost && item.title) {
        item.title = cleanupTweetContent(item.title);
      }
      
      // Convert Twitter to X
      if (item.source === 'Twitter' || isTwitterPost) {
        item.source = 'X';
      }
      
      // Decode HTML entities in title and body
      if (item.title) {
        item.title = decodeHtmlEntities(item.title);
      }
      
      if (item.body) {
        item.body = decodeHtmlEntities(item.body);
      }
      
      // Decode HTML entities in quoted content
      if (item.info?.quotedUser?.text) {
        item.info.quotedUser.text = decodeHtmlEntities(item.info.quotedUser.text);
      }
      
      // Add source identifier
      item.newsSource = 'tree';
      
      // Determine if the news should be highlighted based on source or content
      const isHighlighted = 
        item.title?.toUpperCase() === item.title || // All caps title
        item.source === 'Terminal' || // Terminal source
        (item.suggestions?.some(s => s.coin === 'BTC' || s.coin === 'ETH')); // Major coins
      
      // Check if the news matches any filter keywords
      const matchedKeyword = findMatchedKeyword(item, filterKeywords);
      
      return {
        ...item,
        isHighlighted,
        matchedKeyword
      };
    });
    
    // Add to existing news with deduplication
    const existingNews = store.news;
    const newNews = processedNews.filter(newItem => 
      !existingNews.some(existingItem => 
        // Check by ID
        existingItem._id === newItem._id ||
        // Check by URL if both have URLs
        (existingItem.url && newItem.url && existingItem.url === newItem.url) ||
        // Check by title if both have titles and they're identical
        (existingItem.title && newItem.title && existingItem.title === newItem.title)
      )
    );
    
    // Combine and sort
    const combinedNews = [...existingNews, ...newNews]
      .sort((a, b) => b.time - a.time)
      .slice(0, 100); // Limit to 100 items
    
    store.setNews(combinedNews);
    store.setIsLoading(false);
  } catch (error) {
    console.error('[Tree] API fetch error:', error);
    
    // Provide a user-friendly error message
    let errorMessage = 'Failed to fetch Tree news';
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        errorMessage = 'Tree API request timed out. Server may be unavailable.';
      } else if (error.message.includes('Network request failed')) {
        errorMessage = 'Network connection issue. Check your internet.';
      } else if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
        errorMessage = 'CORS error: Tree API not accessible from web browser. Try using the mobile app.';
      } else {
        errorMessage = `Tree API error: ${error.message}`;
      }
    }
    
    store.setError(errorMessage);
    store.setIsLoading(false);
    
    // Use mock data as fallback if no news
    if (store.news.length === 0) {
      console.log('[Tree] Using mock data as fallback');
      store.setNews(mockNews);
    }
  }
};

export const fetchPhoenixNews = async (): Promise<void> => {
  const store = useNewsStore.getState();
  const { phoenixApiUrl, phoenixToken } = store.serverConfig;
  const { filterKeywords } = store;
  
  store.setIsLoading(true);
  
  try {
    console.log('[Phoenix] Fetching news from API:', phoenixApiUrl);
    
    // Create headers
    const headers = createApiHeaders(phoenixToken);
    
    // Fetch with retry
    const response = await fetchWithRetry(phoenixApiUrl, { headers });
    const data = await response.json();
    
    console.log(`[Phoenix] Received ${data.length} news items from API`);
    
    // Process the Phoenix news items to match our format
    const processedNews = data.map((item: any) => {
      // Determine if this is a Twitter/X post
      const isTwitterPost = item.source === 'Twitter';
      
      // Format title and body
      let title = item.title;
      let body = item.body;
      let quotedText = null;
      let quotedUser = null;
      
      // For Twitter posts from Phoenix, handle quoted content
      if (isTwitterPost && body) {
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
          if (usernameEndIndex !== -1) {
            const quotedUserInfo = quoteContent.substring(0, usernameEndIndex + 1);
            const quotedContent = quoteContent.substring(usernameEndIndex + 1).trim();
            
            // Extract username from format like "Username (@handle)"
            const usernameMatch = quotedUserInfo.match(/(.*?)\s*\((.*?)\)/);
            if (usernameMatch && usernameMatch.length >= 3) {
              const name = usernameMatch[1].trim();
              const screenName = usernameMatch[2].trim().replace('@', '');
              
              quotedUser = {
                name,
                screen_name: screenName,
                text: quotedContent,
                icon: null, // Phoenix doesn't provide quoted user icon
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
      }
      
      // Decode HTML entities in title and body
      title = decodeHtmlEntities(title);
      body = decodeHtmlEntities(body);
      
      // Clean up URLs from tweet content
      if (isTwitterPost) {
        title = cleanupTweetContent(title);
      }
      
      // Convert to our standard format
      const newsItem: NewsItem = {
        _id: item._id || `phoenix-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: title,
        body: body,
        source: isTwitterPost ? 'X' : (item.sourceName || item.source),
        url: item.url,
        time: item.time || new Date(item.createdAt || item.receivedAt).getTime(),
        suggestions: item.suggestions || [],
        icon: item.icon,
        image: item.image,
        newsSource: 'phoenix'
      };
      
      // Handle Twitter info
      if (isTwitterPost) {
        // Add Twitter info
        newsItem.info = {
          twitterId: item.twitterId || item.tweetId,
          isReply: item.isReply,
          isRetweet: item.isRetweet,
          isQuote: item.isQuote,
          isSelfReply: item.isSelfReply,
          username: item.username,
          name: item.name
        };
        
        // Add quoted content if we extracted it
        if (item.isQuote) {
          if (quotedUser) {
            // Use our extracted quoted content
            newsItem.info.quotedUser = quotedUser;
          } else if (item.quotedUser) {
            // Use Phoenix's quoted user if available
            newsItem.info.quotedUser = {
              name: item.quotedUser.name,
              screen_name: item.quotedUser.screen_name,
              icon: item.quotedUser.icon,
              text: decodeHtmlEntities(item.quotedUser.text),
              image: item.quotedUser.image
            };
          }
        }
      }
      
      // Determine if the news should be highlighted
      const isHighlighted = 
        newsItem.title?.toUpperCase() === newsItem.title || 
        (newsItem.suggestions?.some(s => s.coin === 'BTC' || s.coin === 'ETH'));
      
      // Check if the news matches any filter keywords
      const matchedKeyword = findMatchedKeyword(newsItem, filterKeywords);
      
      return {
        ...newsItem,
        isHighlighted,
        matchedKeyword
      };
    });
    
    // Add to existing news with deduplication
    const existingNews = store.news;
    const newNews = processedNews.filter(newItem => 
      !existingNews.some(existingItem => 
        // Check by ID
        existingItem._id === newItem._id ||
        // Check by URL if both have URLs
        (existingItem.url && newItem.url && existingItem.url === newItem.url) ||
        // Check by title if both have titles and they're identical
        (existingItem.title && newItem.title && existingItem.title === newItem.title)
      )
    );
    
    // Combine and sort
    const combinedNews = [...existingNews, ...newNews]
      .sort((a, b) => b.time - a.time)
      .slice(0, 100); // Limit to 100 items
    
    store.setNews(combinedNews);
    store.setIsLoading(false);
  } catch (error) {
    console.error('[Phoenix] API fetch error:', error);
    
    // Provide a user-friendly error message
    let errorMessage = 'Failed to fetch Phoenix news';
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        errorMessage = 'Phoenix API request timed out. Server may be unavailable.';
      } else if (error.message.includes('Network request failed')) {
        errorMessage = 'Network connection issue. Check your internet.';
      } else if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
        errorMessage = 'CORS error: Phoenix API not accessible from web browser. Try using the mobile app.';
      } else {
        errorMessage = `Phoenix API error: ${error.message}`;
      }
    }
    
    store.setError(errorMessage);
    store.setIsLoading(false);
  }
};

export const fetchAllHistoricalNews = async (): Promise<void> => {
  // Fetch from both sources
  await Promise.all([
    fetchTreeNews(),
    fetchPhoenixNews()
  ]);
};