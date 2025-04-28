import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Platform, Alert } from "react-native";
import { ErrorBoundary } from "./error-boundary";
import Colors from "@/constants/colors";
import { treeWebsocketService, phoenixWebsocketService, WebSocketService } from "@/services/websocketService";
import { useNewsStore } from "@/store/newsStore";
import { notificationService } from "@/services/notificationService";
import { backgroundService } from "@/services/backgroundService";

export const unstable_settings = {
  initialRouteName: "index",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });
  
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    if (error) {
      console.error(error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Set up WebSocket connections when app starts
  useEffect(() => {
    const setupApp = async () => {
      try {
        // Get server configuration
        const { 
          treeWebsocketUrl, 
          treeToken,
          phoenixWebsocketUrl, 
          phoenixToken 
        } = useNewsStore.getState().serverConfig;
        
        // Validate URLs before connecting
        const isTreeUrlValid = validateWebSocketUrl(treeWebsocketUrl);
        const isPhoenixUrlValid = validateWebSocketUrl(phoenixWebsocketUrl);
        
        if (!isTreeUrlValid || !isPhoenixUrlValid) {
          const invalidUrls = [];
          if (!isTreeUrlValid) invalidUrls.push('Tree WebSocket');
          if (!isPhoenixUrlValid) invalidUrls.push('Phoenix WebSocket');
          
          console.error(`Invalid WebSocket URLs: ${invalidUrls.join(', ')}`);
          
          if (Platform.OS !== 'web') {
            Alert.alert(
              'Configuration Error',
              `Invalid WebSocket URLs detected: ${invalidUrls.join(', ')}. Please update your settings.`,
              [{ text: 'OK' }]
            );
          }
        }
        
        // Store URLs globally for background service
        globalThis.treeWebsocketUrl = treeWebsocketUrl;
        globalThis.treeToken = treeToken;
        globalThis.phoenixWebsocketUrl = phoenixWebsocketUrl;
        globalThis.phoenixToken = phoenixToken;
        
        // Initialize notification service - wait for it to complete
        try {
          await notificationService.initialize();
        } catch (notificationError) {
          console.error('Failed to initialize notifications:', notificationError);
        }
        
        // Connect to WebSockets only if URLs are valid
        if (isTreeUrlValid) {
          treeWebsocketService.connect(treeWebsocketUrl, treeToken || null);
        }
        
        if (isPhoenixUrlValid) {
          phoenixWebsocketService.connect(phoenixWebsocketUrl, phoenixToken || null);
        }
        
        // Try to start background service if on mobile
        if (Platform.OS !== 'web') {
          try {
            // Check if permissions are already granted before starting
            const hasPermissions = await backgroundService.checkPermissions();
            if (hasPermissions) {
              await backgroundService.startBackgroundService();
            }
          } catch (bgError) {
            console.log('Failed to start background service:', bgError);
          }
        }
        
        setSetupComplete(true);
      } catch (error) {
        console.error('Failed to set up app:', error);
        setSetupComplete(true); // Still mark as complete to avoid blocking the app
      }
    };
    
    setupApp();
    
    // Set up synchronous cleanup function
    let isCleaningUp = false;
    
    return () => {
      // Prevent duplicate cleanup
      if (isCleaningUp) return;
      isCleaningUp = true;
      
      console.log('Starting app cleanup...');
      
      // Start asynchronous cleanup but don't return the promise
      (async () => {
        try {
          // Disconnect WebSockets
          try {
            await treeWebsocketService.disconnect();
          } catch (error) {
            console.error('Error disconnecting Tree service:', error);
          }
          
          try {
            await phoenixWebsocketService.disconnect();
          } catch (error) {
            console.error('Error disconnecting Phoenix service:', error);
          }
          
          // Clean up notifications
          try {
            notificationService.cleanup();
          } catch (error) {
            console.error('Error cleaning up notification service:', error);
          }
          
          // Stop background service
          if (Platform.OS !== 'web') {
            try {
              await backgroundService.stopBackgroundService();
            } catch (error) {
              console.error('Error stopping background service:', error);
            }
          }
          
          // Final cleanup
          try {
            WebSocketService.cleanupAll();
          } catch (error) {
            console.error('Error in final WebSocket cleanup:', error);
          }
          
          console.log('App cleanup completed');
        } catch (error) {
          console.error('Error during app cleanup:', error);
        }
      })();
    };
  }, []);

  // Helper function to validate WebSocket URLs
  function validateWebSocketUrl(url: string): boolean {
    if (!url) return false;
    return url.startsWith('ws://') || url.startsWith('wss://');
  }

  if (!loaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <RootLayoutNav />
    </ErrorBoundary>
  );
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.dark.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
    </Stack>
  );
}