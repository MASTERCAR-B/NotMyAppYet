import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar, SafeAreaView, ActivityIndicator, Text } from 'react-native';
import { Header } from '@/components/Header';
import { NewsList } from '@/components/NewsList';
import Colors from '@/constants/colors';
import { fetchAllHistoricalNews } from '@/services/apiService';
import { SafeText } from '@/components/FixTextNodes';

export default function NewsScreen() {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  // Fetch historical news when the screen loads
  useEffect(() => {
    let isMounted = true;
    let fetchTimeout: NodeJS.Timeout | null = null;
    
    const loadInitialData = async () => {
      try {
        // Set a timeout to prevent hanging indefinitely
        const timeoutPromise = new Promise<never>((_, reject) => {
          fetchTimeout = setTimeout(() => {
            reject(new Error('Fetching news timed out after 15 seconds'));
          }, 15000); // 15 second timeout
        });
        
        // Race between the actual fetch and the timeout
        await Promise.race([
          fetchAllHistoricalNews(),
          timeoutPromise
        ]);
      } catch (error) {
        console.error('Failed to load initial news data:', error);
        if (isMounted) {
          setInitialLoadError(error instanceof Error ? error.message : 'Failed to load news');
        }
      } finally {
        // Clear timeout if it exists
        if (fetchTimeout) {
          clearTimeout(fetchTimeout);
          fetchTimeout = null;
        }
        
        if (isMounted) {
          setIsInitialLoading(false);
        }
      }
    };
    
    loadInitialData();
    
    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isMounted = false;
      // Also clear any pending timeout
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
      <Header />
      <View style={styles.content}>
        <NewsList 
          initialLoading={isInitialLoading}
          initialError={initialLoadError}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flex: 1,
  },
});