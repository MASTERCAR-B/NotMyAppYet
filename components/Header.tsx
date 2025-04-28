import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Settings, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useNewsStore } from '@/store/newsStore';
import Colors from '@/constants/colors';
import { TwitterToggle } from './TwitterToggle';
import { treeWebsocketService, phoenixWebsocketService } from '@/services/websocketService';

interface HeaderProps {
  showSettings?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ showSettings = true }) => {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const treeConnected = useNewsStore(state => state.treeConnected);
  const phoenixConnected = useNewsStore(state => state.phoenixConnected);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  // Start/stop the timer based on AppState for better battery efficiency
  useEffect(() => {
    // Function to start the timer
    const startTimer = () => {
      // Clear any existing timer first
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Set a new timer
      timerRef.current = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
    };
    
    // Function to stop the timer
    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    
    // Start the timer initially
    startTimer();
    
    // Set up AppState listener if on mobile
    if (Platform.OS !== 'web') {
      const { AppState } = require('react-native');
      
      const handleAppStateChange = (nextAppState: string) => {
        if (nextAppState === 'active') {
          // App came to foreground, update time immediately and restart timer
          setCurrentTime(new Date());
          startTimer();
        } else if (nextAppState === 'background' || nextAppState === 'inactive') {
          // App went to background, stop the timer to save battery
          stopTimer();
        }
      };
      
      const subscription = AppState.addEventListener('change', handleAppStateChange);
      
      // Clean up the subscription when component unmounts
      return () => {
        subscription.remove();
        stopTimer();
      };
    }
    
    // Clean up the interval on component unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
  
  const formattedDate = `${currentTime.toLocaleString('default', { month: 'short' })} ${currentTime.getDate()} ${currentTime.getFullYear().toString().slice(2)}`;
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  
  const handleSettingsPress = () => {
    router.push('/settings');
  };
  
  const handleBackPress = () => {
    router.back();
  };
  
  // Handle reconnection attempt
  const handleReconnectPress = async () => {
    if (isReconnecting) return;
    
    setIsReconnecting(true);
    
    try {
      // Get the current URLs from the store
      const { serverConfig } = useNewsStore.getState();
      
      // Disconnect first
      await Promise.all([
        treeWebsocketService.disconnect(),
        phoenixWebsocketService.disconnect()
      ]);
      
      // Short delay to ensure clean disconnect
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reconnect
      if (!treeConnected && serverConfig.treeWebsocketUrl) {
        treeWebsocketService.connect(
          serverConfig.treeWebsocketUrl, 
          serverConfig.treeToken || null
        );
      }
      
      if (!phoenixConnected && serverConfig.phoenixWebsocketUrl) {
        phoenixWebsocketService.connect(
          serverConfig.phoenixWebsocketUrl,
          serverConfig.phoenixToken || null
        );
      }
      
      // Success feedback
      Alert.alert('Reconnecting', 'Attempting to reconnect to WebSocket servers...');
    } catch (error) {
      console.error('Error reconnecting:', error);
      Alert.alert('Reconnection Error', 'Failed to reconnect. Please try again or check your connection.');
    } finally {
      // Reset reconnecting state after a delay
      setTimeout(() => {
        setIsReconnecting(false);
      }, 3000);
    }
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable 
          style={styles.leftSection}
          onPress={handleReconnectPress}
          disabled={isReconnecting || (treeConnected && phoenixConnected)}
        >
          <View style={styles.logoContainer}>
            <Image
              source={{ uri: "https://news.treeofalpha.com/static/images/community.png" }}
              style={styles.logo}
              contentFit="contain"
              onError={() => console.warn('Failed to load Tree logo')}
            />
            <View 
              style={[
                styles.statusIndicator, 
                { backgroundColor: treeConnected ? Colors.dark.accent : Colors.dark.negative }
              ]} 
            />
          </View>
          
          <View style={styles.logoContainer}>
            <Image
              source={{ uri: "https://phoenixnews.io/static/media/phoenixnews_io.ea89d541ed48f1414075.png" }}
              style={styles.logo}
              contentFit="contain"
              onError={() => console.warn('Failed to load Phoenix logo')}
            />
            <View 
              style={[
                styles.statusIndicator, 
                { backgroundColor: phoenixConnected ? Colors.dark.accent : Colors.dark.negative }
              ]} 
            />
          </View>
          
          {/* Twitter toggle */}
          <TwitterToggle />
          
          {/* Reconnect button visible when either connection is down */}
          {(!treeConnected || !phoenixConnected) && (
            <RefreshCw 
              size={16} 
              color={isReconnecting ? Colors.dark.secondaryText : Colors.dark.accent} 
              style={[styles.reconnectIcon, isReconnecting && styles.spinningIcon]}
            />
          )}
        </Pressable>
        
        <View style={styles.dateTimeContainer}>
          <Text style={styles.dateText}>{formattedDate}</Text>
          <Text style={styles.timeText}>{formattedTime}</Text>
        </View>
        
        {showSettings ? (
          <Pressable onPress={handleSettingsPress}>
            <Settings color={Colors.dark.text} size={24} />
          </Pressable>
        ) : (
          <Pressable onPress={handleBackPress}>
            <Text style={styles.backButton}>Back</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 24,
    height: 24,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  dateTimeContainer: {
    alignItems: 'center',
  },
  dateText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  timeText: {
    color: Colors.dark.accent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    color: Colors.dark.accent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  reconnectIcon: {
    marginLeft: 4,
  },
  spinningIcon: {
    opacity: 0.6,
  },
});