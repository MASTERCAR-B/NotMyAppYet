import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FilterKeyword, NewsItem, ServerConfig } from '@/types/news';
import { mockNews } from '@/mocks/news';
import { notificationService } from '@/services/notificationService';

interface NewsState {
  news: NewsItem[];
  isLoading: boolean;
  error: string | null;
  treeConnected: boolean;
  phoenixConnected: boolean;
  filterKeywords: FilterKeyword[];
  serverConfig: ServerConfig;
  showTwitterPosts: boolean;
  disableApiRequests: boolean; // Added state for disabling API requests
  
  // Actions
  setNews: (news: NewsItem[]) => void;
  addNews: (newsItem: NewsItem) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setTreeConnected: (isConnected: boolean) => void;
  setPhoenixConnected: (isConnected: boolean) => void;
  addFilterKeyword: (keyword: string) => void;
  removeFilterKeyword: (id: string) => void;
  updateServerConfig: (config: Partial<ServerConfig>) => void;
  resetNews: () => void;
  toggleTwitterPosts: () => void;
  setDisableApiRequests: (disable: boolean) => void; // Added action to control API requests
}

// Default server configuration
const DEFAULT_SERVER_CONFIG: ServerConfig = {
  treeWebsocketUrl: 'ws://35.76.194.63:4873',
  treeApiUrl: '',
  treeToken: '',
  phoenixWebsocketUrl: 'wss://wss.phoenixnews.io',
  phoenixApiUrl: '',
  phoenixToken: '',
  disableApiRequests: false, // Added default value for disableApiRequests
  servers: [
    {
      name: 'Tree of Alpha',
      websocketUrl: 'ws://35.76.194.63:4873',
      apiUrl: '',
      token: 'H&7TJx%3pL%%n!&kSmyYb'
    },
    {
      name: 'Phoenix',
      websocketUrl: 'ws://35.76.194.63:5421',
      apiUrl: '',
      token: 'H&7TJx%3pL%%n!&kSmyYb'
    }
  ]
};

export const useNewsStore = create<NewsState>()(
  persist(
    (set) => ({
      news: mockNews,
      isLoading: false,
      error: null,
      treeConnected: false,
      phoenixConnected: false,
      filterKeywords: [],
      serverConfig: DEFAULT_SERVER_CONFIG,
      showTwitterPosts: true,
      disableApiRequests: false, // Default to enabling API requests
      
      setNews: (news) => set({ news }),
      addNews: (newsItem) => set((state) => {
        // If news is coming from an API source and API requests are disabled, skip it
        if (state.disableApiRequests && newsItem.source === 'api') {
          console.log('Skipping API news item due to disableApiRequests setting:', newsItem.title);
          return state;
        }
        
        // Ensure the news item has a unique ID
        if (!newsItem._id) {
          newsItem._id = `generated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        }
        
        // Add source identifier if missing
        if (!newsItem.newsSource) {
          newsItem.newsSource = 'tree'; // Default to tree if not specified
        }
        
        // Filter Twitter/X posts based on user preference
        const isTwitterOrXPost = 
          newsItem.source === 'X' || 
          newsItem.source === 'Twitter' ||
          (newsItem.info?.twitterId && newsItem.title?.includes('@'));
          
        if (!state.showTwitterPosts && isTwitterOrXPost) {
          console.log('Skipping Twitter/X post based on user preferences:', newsItem.title);
          return state;
        }
        
        // Check if news item already exists to prevent duplicates
        const exists = state.news.some(item => 
          // Check by ID
          item._id === newsItem._id ||
          // Check by URL if both have URLs
          (item.url && newsItem.url && item.url === newsItem.url) ||
          // Check by title if both have titles and they're identical
          (item.title && newsItem.title && item.title === newsItem.title)
        );
        
        if (exists) return state;
        
        // Check if the news matches any filter keywords
        const newMatchedKeyword = notificationService.checkForKeywordMatch(newsItem, state.filterKeywords);
        
        // Determine if the news should be highlighted based on source, content, or filter match
        const isHighlighted = 
          newsItem.title?.toUpperCase() === newsItem.title || // All caps title
          newsItem.source === 'Terminal' || // Terminal source
          (newsItem.suggestions?.some(s => s.coin === 'BTC' || s.coin === 'ETH')) || // Major coins
          newMatchedKeyword !== null; // Matches filter keyword
        
        // Preserve existing matchedKeyword if available
        const matchedKeyword = newsItem.matchedKeyword || newMatchedKeyword;
        
        const enhancedNewsItem = {
          ...newsItem,
          isHighlighted: isHighlighted || newsItem.isHighlighted,
          matchedKeyword: matchedKeyword || undefined
        };
        
        // Send notification if it matches a filter keyword and not already notified
        if (newMatchedKeyword && (!newsItem.matchedKeyword || newsItem.matchedKeyword !== newMatchedKeyword)) {
          notificationService.scheduleNotification(enhancedNewsItem, newMatchedKeyword);
        }
        
        return { 
          news: [enhancedNewsItem, ...state.news]
            .sort((a, b) => b.time - a.time)
            .slice(0, 100) // Limit to 100 items to prevent memory issues
        };
      }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setTreeConnected: (isConnected) => set({ treeConnected: isConnected }),
      setPhoenixConnected: (isConnected) => set({ phoenixConnected: isConnected }),
      addFilterKeyword: (keyword) => {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (!normalizedKeyword) return;
        
        set((state) => {
          // Check if keyword already exists
          const exists = state.filterKeywords.some(k => k.keyword === normalizedKeyword);
          if (exists) return state;
          
          return {
            filterKeywords: [
              ...state.filterKeywords, 
              { id: Date.now().toString(), keyword: normalizedKeyword }
            ]
          };
        });
      },
      removeFilterKeyword: (id) => set((state) => ({
        filterKeywords: state.filterKeywords.filter((k) => k.id !== id)
      })),
      updateServerConfig: (config) => set((state) => ({
        serverConfig: { ...state.serverConfig, ...config },
        // If disableApiRequests is included in config, also update the top-level state
        ...(config.disableApiRequests !== undefined ? { disableApiRequests: config.disableApiRequests } : {}),
        error: null // Clear any previous errors when updating config
      })),
      resetNews: () => set({ news: [] }),
      toggleTwitterPosts: () => set((state) => ({
        showTwitterPosts: !state.showTwitterPosts
      })),
      setDisableApiRequests: (disable) => set((state) => ({
        disableApiRequests: disable,
        serverConfig: {
          ...state.serverConfig,
          disableApiRequests: disable
        }
      }))
    }),
    {
      name: 'news-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        filterKeywords: state.filterKeywords,
        serverConfig: state.serverConfig,
        showTwitterPosts: state.showTwitterPosts,
        disableApiRequests: state.disableApiRequests, // Persist disableApiRequests state
      }),
    }
  )
);