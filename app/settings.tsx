import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, StatusBar, SafeAreaView, Text, ActivityIndicator, Alert } from 'react-native';
import { Header } from 'components/Header';
import { FilterKeywords } from 'components/FilterKeywords';
import { ServerSettings } from 'components/ServerSettings';
// Removed import for PhoenixSettings
import { BackgroundModeToggle } from 'components/BackgroundModeToggle';
import Colors from 'constants/colors';
import { ErrorBoundary } from './error-boundary';

// Component wrapper with error boundary
const SectionWithErrorBoundary = ({ 
  children, 
  title 
}: { 
  children: React.ReactNode, 
  title: string 
}) => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    setHasError(false);
    setErrorMessage('');
  }, []);
  
  const handleError = useCallback((error: Error) => {
    console.error(`Error in section "${title}":`, error);
    setErrorMessage(error.message || 'Unknown error occurred');
    setHasError(true);
  }, [title]);
  
  if (hasError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Error in {title}</Text>
        <Text style={styles.errorText}>
          {errorMessage || 'There was an error loading this section.'}
        </Text>
        <View style={styles.retryButton}>
          <Text style={styles.retryButtonText} onPress={handleRetry}>
            Retry
          </Text>
        </View>
      </View>
    );
  }
  
  // Add key with retry count to force re-mounting of the component on retry
  return (
    <ErrorBoundary
      onError={handleError}
      key={`${title}-${retryCount}`}
    >
      {children}
    </ErrorBoundary>
  );
};

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
      <Header showSettings={false} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <SectionWithErrorBoundary title="Notification Keywords">
            <FilterKeywords />
          </SectionWithErrorBoundary>
        </View>
        
        <View style={styles.section}>
          <SectionWithErrorBoundary title="Background Mode">
            <BackgroundModeToggle />
          </SectionWithErrorBoundary>
        </View>
        
        <View style={styles.section}>
          <SectionWithErrorBoundary title="Server Settings">
            <ServerSettings />
          </SectionWithErrorBoundary>
        </View>
        
        <View style={styles.section}>
          <SectionWithErrorBoundary title="Phoenix Settings">
            {/* Removed PhoenixSettings component */}
          </SectionWithErrorBoundary>
        </View>
      </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: 'rgba(255, 0, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.2)',
  },
  errorTitle: {
    color: Colors.dark.negative,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorText: {
    color: Colors.dark.text,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.dark.card,
    padding: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  retryButtonText: {
    color: Colors.dark.accent,
    fontWeight: 'bold',
  },
});
