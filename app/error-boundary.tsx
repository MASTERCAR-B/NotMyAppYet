import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, SafeAreaView } from 'react-native';
import { WebSocketService } from '@/services/websocketService';
import Colors from '@/constants/colors';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });
    
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    
    // Call onError prop if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }
  
  handleRestart = () => {
    try {
      // Track reconnection attempts and timeout
      let reconnectAttempts = 0;
      const maxReconnectAttempts = 3;
      let reconnectTimeout: NodeJS.Timeout | null = null;
      
      const attemptReconnect = () => {
        reconnectAttempts++;
        console.log(`Attempting to reconnect (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
        
        try {
          // First try to reconnect all WebSockets
          const success = WebSocketService.reconnectAll();
          
          if (success) {
            console.log('WebSocket reconnection initiated successfully');
            
            // Reset the error state after a short delay to allow connections to establish
            setTimeout(() => {
              this.setState({
                hasError: false,
                error: null,
                errorInfo: null
              });
            }, 1000);
          } else if (reconnectAttempts < maxReconnectAttempts) {
            // Try again with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 5000);
            console.log(`Reconnection attempt failed, retrying in ${delay}ms...`);
            
            reconnectTimeout = setTimeout(attemptReconnect, delay);
          } else {
            console.log('Max reconnection attempts reached, resetting app state anyway');
            
            // Reset the state even if reconnection failed
            this.setState({
              hasError: false,
              error: null,
              errorInfo: null
            });
          }
        } catch (error) {
          console.error('Error during reconnection attempt:', error);
          
          if (reconnectAttempts < maxReconnectAttempts) {
            // Try again with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 5000);
            console.log(`Error in reconnection, retrying in ${delay}ms...`);
            
            reconnectTimeout = setTimeout(attemptReconnect, delay);
          } else {
            console.log('Max reconnection attempts reached after errors, resetting app state anyway');
            
            // Reset the state even if reconnection failed
            this.setState({
              hasError: false,
              error: null,
              errorInfo: null
            });
          }
        }
      };
      
      // Start the reconnection process
      attemptReconnect();
      
      // Clean up function in case component unmounts during reconnection
      return () => {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
      };
    } catch (error) {
      console.error('Fatal error in restart process:', error);
      
      // If all else fails, just reset the error state
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null
      });
    }
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'An unknown error occurred';
      const errorStack = this.state.error?.stack || '';
      
      // Check if it's a WebSocket related error
      const isWebSocketError = 
        errorMessage.includes('WebSocket') || 
        errorStack.includes('WebSocket') ||
        errorMessage.includes('network') ||
        errorMessage.includes('connection');
      
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Something went wrong</Text>
            
            <Text style={styles.message}>{errorMessage}</Text>
            
            {isWebSocketError ? (
              <Text style={styles.hint}>
                This appears to be a network connection issue. Please check your internet connection and try again.
              </Text>
            ) : (
              <Text style={styles.hint}>
                The app encountered an unexpected error and needs to restart.
              </Text>
            )}
            
            {Platform.OS === 'web' && (
              <View style={styles.codeContainer}>
                <Text style={styles.code}>{errorStack}</Text>
              </View>
            )}
            
            <Pressable 
              style={styles.button}
              onPress={this.handleRestart}
            >
              <Text style={styles.buttonText}>
                {isWebSocketError ? 'Reconnect' : 'Restart App'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.dark.text,
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: Colors.dark.negative,
    textAlign: 'center',
    marginBottom: 20,
  },
  hint: {
    fontSize: 14,
    color: Colors.dark.secondaryText,
    textAlign: 'center',
    marginBottom: 30,
  },
  codeContainer: {
    backgroundColor: '#111',
    padding: 10,
    borderRadius: 4,
    marginBottom: 20,
    maxHeight: 200,
    width: '100%',
    overflow: 'auto',
  },
  code: {
    color: '#f0f0f0',
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    fontSize: 12,
  },
  button: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 

export default ErrorBoundary;