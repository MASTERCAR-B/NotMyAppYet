import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { NewsItem } from './NewsItem';
import { useNewsStore } from '@/store/newsStore';
import { treeWebsocketService, phoenixWebsocketService } from '@/services/websocketService';
import Colors from '@/constants/colors';
import { SafeText } from './FixTextNodes';

interface NewsListProps {
  initialLoading?: boolean;
  initialError?: string | null;
}

export const NewsList: React.FC<NewsListProps> = ({ 
  initialLoading = false,
  initialError = null
}) => {
  const { 
    news, 
    isLoading, 
    error, 
    treeConnected, 
    phoenixConnected, 
    serverConfig, 
    showTwitterPosts 
  } = useNewsStore();
  const [retryCount, setRetryCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  useEffect(() => {
    // Connect to WebSockets when component mounts
    connectToWebSockets();
    
    // Cleanup on unmount
    return () => {
      // Call the cleanup method instead of just disconnect to ensure proper cleanup
      treeWebsocketService.cleanup();
      phoenixWebsocketService.cleanup();
    };
  }, [
    serverConfig.treeWebsocketUrl, 
    serverConfig.treeApiUrl,
    serverConfig.treeToken,
    serverConfig.phoenixWebsocketUrl,
    serverConfig.phoenixApiUrl,
    serverConfig.phoenixToken
  ]);
  
  const connectToWebSockets = () => {
    try {
      // Connect to Tree WebSocket with token if available
      treeWebsocketService.connect(serverConfig.treeWebsocketUrl, serverConfig.treeToken || null);
      
      // Connect to Phoenix WebSocket with token if available
      phoenixWebsocketService.connect(serverConfig.phoenixWebsocketUrl, serverConfig.phoenixToken || null);
    } catch (error) {
      console.error('Failed to connect to WebSockets:', error);
    }
  };
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    setRetryCount(prev => prev + 1);
    
    // Reconnect WebSockets if not connected
    if (!treeConnected) {
      treeWebsocketService.connect(serverConfig.treeWebsocketUrl, serverConfig.treeToken || null);
    }
    
    if (!phoenixConnected) {
      phoenixWebsocketService.connect(serverConfig.phoenixWebsocketUrl, serverConfig.phoenixToken || null);
    }
    
    // Set a timeout to clear the refreshing state since we're not fetching data anymore
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };
  
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    connectToWebSockets();
  };
  
  // Generate a unique key for each news item
  const keyExtractor = (item: any) => {
    // Create a unique key by combining _id with source and time
    return `${item._id || 'unknown'}-${item.newsSource || 'unknown'}-${item.time || Date.now()}`;
  };
  
  // Filter news based on Twitter toggle
  const filteredNews = showTwitterPosts 
    ? news 
    : news.filter(item => !(item.source === 'X' || item.source === 'Twitter'));
  
  // Show loading indicator if data is still loading on initial render
  if (initialLoading || (isLoading && news.length === 0)) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.dark.accent} />
        <Text style={styles.loadingText}>Loading latest news...</Text>
      </View>
    );
  }
  
  // Show error message if there's an error and no news items
  if ((initialError || error) && news.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <AlertCircle size={48} color={Colors.dark.negative} style={styles.errorIcon} />
        <Text style={styles.errorText}>{initialError || error}</Text>
        <Pressable style={styles.retryButton} onPress={handleRetry}>
          <RefreshCw size={16} color="#000" />
          <Text style={styles.retryText}>Retry Connection</Text>
        </Pressable>
      </View>
    );
  }
  
  return (
    <FlatList
      data={filteredNews}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => <NewsItem item={item} />}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={Colors.dark.accent}
          colors={[Colors.dark.accent]}
        />
      }
      ListHeaderComponent={
        error ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color={Colors.dark.negative} />
            <Text style={styles.errorBannerText}>{error}</Text>
            <Pressable onPress={handleRetry}>
              <Text style={styles.retryLink}>Retry</Text>
            </Pressable>
          </View>
        ) : null
      }
      ListEmptyComponent={
        !isLoading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No news available</Text>
            <Text style={styles.emptySubText}>Pull down to refresh or check your connection</Text>
          </View>
        )
      }
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorText: {
    color: Colors.dark.negative,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: 16,
    marginTop: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  retryText: {
    color: '#000',
    fontWeight: 'bold',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  errorBannerText: {
    color: Colors.dark.text,
    fontSize: 14,
    flex: 1,
    marginLeft: 8,
  },
  retryLink: {
    color: Colors.dark.accent,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.dark.secondaryText,
    fontSize: 16,
    marginBottom: 8,
  },
  emptySubText: {
    color: Colors.dark.secondaryText,
    fontSize: 14,
    textAlign: 'center',
  },
});