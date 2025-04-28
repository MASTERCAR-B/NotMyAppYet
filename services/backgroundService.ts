import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { Platform, Linking } from 'react-native';
import * as Constants from 'expo-constants';
import { treeWebsocketService, phoenixWebsocketService } from './websocketService';

// Define task names
const LOCATION_TASK_NAME = 'background-location-task';
const BACKGROUND_FETCH_TASK_NAME = 'background-fetch-task';

// Reconnection tracking
export const reconnectAttempts = {
  tree: 0,
  phoenix: 0
};
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 60000; // Maximum 1 minute delay

// For handling permission listeners
type PermissionListener = (hasPermission: boolean) => void;

// Define task handlers if not already defined
if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('Background location task error:', error);
      
      if (error.code === 'ERR_LOCATION_UNAUTHORIZED') {
        console.log('Location permissions have been revoked');
        // Consider notifying the user here
      } else if (error.code === 'ERR_LOCATION_UNAVAILABLE') {
        console.log('Location service is unavailable or disabled');
      } else if (error.code === 'ERR_LOCATION_TIMEOUT') {
        console.log('Location request timed out');
      }
      
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
    
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      console.log(`[${new Date().toISOString()}] Background location update received`);
      
      // Check and reconnect WebSockets if needed
      checkAndReconnectWebSockets();
    }
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  });
}

// Register the background fetch task if not already defined
if (!TaskManager.isTaskDefined(BACKGROUND_FETCH_TASK_NAME)) {
  TaskManager.defineTask(BACKGROUND_FETCH_TASK_NAME, async () => {
    console.log(`[${new Date().toISOString()}] Background fetch task executed`);
    
    // Check and reconnect WebSockets if needed
    checkAndReconnectWebSockets();
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  });
}

// Helper function to check and reconnect WebSockets
function checkAndReconnectWebSockets() {
  try {
    // Import dynamically to avoid circular dependency
    const { useNewsStore } = require('@/store/newsStore');
    const { treeWebsocketUrl, treeToken, phoenixWebsocketUrl, phoenixToken } = useNewsStore.getState().serverConfig;
    
    // Use globalThis as fallback if store is not accessible
    const treeWsUrl = treeWebsocketUrl || globalThis.treeWebsocketUrl;
    const treeAuthToken = treeToken || globalThis.treeToken;
    const phoenixWsUrl = phoenixWebsocketUrl || globalThis.phoenixWebsocketUrl;
    const phoenixAuthToken = phoenixToken || globalThis.phoenixToken;
    
    if (!treeWsUrl || !phoenixWsUrl) {
      console.warn('WebSocket URLs not available, skipping reconnection');
      return;
    }
    
    // Check if WebSockets are connected, reconnect if needed
    if (!treeWebsocketService.isConnected() && treeWebsocketService && treeWsUrl) {
      console.log(`Tree WebSocket disconnected, attempting to reconnect (attempt ${reconnectAttempts.tree})...`);
      
      if (reconnectAttempts.tree < MAX_RECONNECT_ATTEMPTS) {
        // Calculate delay before incrementing counter
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts.tree),
          MAX_RECONNECT_DELAY
        );
        
        // Increment counter after calculating delay
        reconnectAttempts.tree++;
        
        setTimeout(() => {
          // Ensure we're using the latest WebSocket service instance
          const { treeWebsocketService: latestTreeService } = require('./websocketService');
          
          // Sync with WebSocket service's internal counter
          latestTreeService.resetReconnectAttempts();
          latestTreeService.connect(treeWsUrl, treeAuthToken || null);
        }, delay);
      } else {
        console.log('Max tree WebSocket reconnect attempts reached');
      }
    } else if (treeWebsocketService.isConnected()) {
      // Reset reconnect attempts on successful connection
      reconnectAttempts.tree = 0;
    }
    
    if (!phoenixWebsocketService.isConnected() && phoenixWebsocketService && phoenixWsUrl) {
      console.log(`Phoenix WebSocket disconnected, attempting to reconnect (attempt ${reconnectAttempts.phoenix})...`);
      
      if (reconnectAttempts.phoenix < MAX_RECONNECT_ATTEMPTS) {
        // Calculate delay before incrementing counter
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts.phoenix),
          MAX_RECONNECT_DELAY
        );
        
        // Increment counter after calculating delay
        reconnectAttempts.phoenix++;
        
        setTimeout(() => {
          // Ensure we're using the latest WebSocket service instance
          const { phoenixWebsocketService: latestPhoenixService } = require('./websocketService');
          
          // Sync with WebSocket service's internal counter
          latestPhoenixService.resetReconnectAttempts();
          latestPhoenixService.connect(phoenixWsUrl, phoenixAuthToken || null);
        }, delay);
      } else {
        console.log('Max phoenix WebSocket reconnect attempts reached');
      }
    } else if (phoenixWebsocketService.isConnected()) {
      // Reset reconnect attempts on successful connection
      reconnectAttempts.phoenix = 0;
    }
  } catch (error) {
    console.error('Error in checkAndReconnectWebSockets:', error);
  }
}

class BackgroundService {
  private isRunning = false;
  private locationSubscription: Location.LocationSubscription | null = null;
  private permissionListeners: PermissionListener[] = [];
  private lastPermissionCheck: number = 0;
  private checkInterval: NodeJS.Timer | null = null;

  constructor() {
    // No need to set up tasks here since they're set up above
  }

  // Check if running in Expo Go
  isRunningInExpoGo(): boolean {
    try {
      return Constants.default.appOwnership !== 'standalone';
    } catch (e) {
      // If we can't determine, assume we're in a production build to be safe
      console.warn('Could not determine if running in Expo Go:', e);
      return false;
    }
  }

  // Start background service
  async startBackgroundService() {
    // Skip this in Expo Go (can't run background tasks)
    if (this.isRunningInExpoGo()) {
      console.log('Running in Expo Go, some background features will be limited');
    }
    
    try {
      // Check and request permissions
      const hasPermissions = await this.checkPermissions();
      if (!hasPermissions) {
        const granted = await this.requestPermissions();
        if (!granted) {
          console.log('Location permissions not granted');
          return false;
        }
      }
      
      // Register background fetch
      if (Platform.OS !== 'web') {
        try {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK_NAME, {
            minimumInterval: 900, // 15 minutes (in seconds)
            stopOnTerminate: false,
            startOnBoot: true,
          });
          console.log('Background fetch registered');
        } catch (error) {
          console.warn('Error registering background fetch:', error);
          // Continue anyway as location might still work
        }
      }
      
      // Start location updates
      await this.startLocationUpdates();
      
      // Start permission check interval
      this.startPermissionChecks();
      
      // Store WebSocket URLs globally for background access
      try {
        const { useNewsStore } = require('@/store/newsStore');
        const { 
          treeWebsocketUrl, 
          treeToken, 
          phoenixWebsocketUrl, 
          phoenixToken 
        } = useNewsStore.getState().serverConfig;
        
        globalThis.treeWebsocketUrl = treeWebsocketUrl;
        globalThis.treeToken = treeToken;
        globalThis.phoenixWebsocketUrl = phoenixWebsocketUrl;
        globalThis.phoenixToken = phoenixToken;
      } catch (error) {
        console.warn('Failed to store WebSocket URLs globally:', error);
      }
      
      return true;
    } catch (error) {
      console.error('Error starting background service:', error);
      
      // Try to recover - stop any partial services that might be running
      try {
        await this.stopBackgroundService();
      } catch (cleanupError) {
        console.error('Error during cleanup after failed start:', cleanupError);
      }
      
      return false;
    }
  }

  // Check for required permissions
  async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const hasPermission = status === 'granted';
      
      // Record the time of this check
      this.lastPermissionCheck = Date.now();
      
      // Notify any listeners if this is a change
      if (!hasPermission) {
        this.notifyPermissionListeners(hasPermission);
      }
      
      return hasPermission;
    } catch (error) {
      console.error('Error checking location permissions:', error);
      return false;
    }
  }
  
  // Request location permissions
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        console.log('Foreground location permission not granted');
        return false;
      }
      
      // For background, we need additional permissions
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      const hasPermission = backgroundStatus === 'granted';
      
      // Notify listeners of the new permission state
      this.notifyPermissionListeners(hasPermission);
      
      return hasPermission;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }
  
  // Open app settings
  async openSettings() {
    try {
      await Linking.openSettings();
      return true;
    } catch (error) {
      console.error('Error opening settings:', error);
      return false;
    }
  }
  
  // Add a permission listener
  addPermissionListener(listener: PermissionListener) {
    this.permissionListeners.push(listener);
    
    // Return an object with a remove method
    return {
      remove: () => {
        this.permissionListeners = this.permissionListeners.filter(l => l !== listener);
      }
    };
  }
  
  // Notify all permission listeners
  private notifyPermissionListeners(hasPermission: boolean) {
    this.permissionListeners.forEach(listener => {
      try {
        listener(hasPermission);
      } catch (error) {
        console.error('Error in permission listener:', error);
      }
    });
  }
  
  // Start periodic permission checks
  private startPermissionChecks() {
    // Stop any existing interval
    this.stopPermissionChecks();
    
    // Check permissions every 30 seconds
    this.checkInterval = setInterval(async () => {
      // Only check if it's been more than 30 seconds since last check
      if (Date.now() - this.lastPermissionCheck > 30000) {
        await this.checkPermissions();
      }
    }, 30000);
  }
  
  // Stop permission checks
  private stopPermissionChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Start location updates
  private async startLocationUpdates() {
    try {
      // Start foreground location updates
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 100, // meters
          timeInterval: 60000, // 1 minute
        },
        (location) => {
          console.log('Location update:', location.coords.latitude, location.coords.longitude);
          // This callback helps keep the app alive
          this.keepWebSocketsAlive();
        }
      );
      
      // Start background location task if not in Expo Go
      if (!this.isRunningInExpoGo()) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 100, // meters
          timeInterval: 60000, // 1 minute
          foregroundService: {
            notificationTitle: 'News Alerts Active',
            notificationBody: 'Keeping you updated with real-time crypto news',
            notificationColor: '#6200ee',
          },
          // Only available on Android
          activityType: Platform.OS === 'android' ? Location.ActivityType.OTHER : undefined,
        });
        
        console.log('Background location updates started');
      }
      
      this.isRunning = true;
      console.log('Background service started successfully');
      
      // Make an initial WebSocket check
      this.keepWebSocketsAlive();
      
      return true;
    } catch (error) {
      console.error('Error starting location updates:', error);
      throw error;
    }
  }

  // Keep WebSockets alive - used by the watched position callback
  private keepWebSocketsAlive() {
    // Call the global helper function to avoid code duplication
    checkAndReconnectWebSockets();
  }

  // Stop background service
  async stopBackgroundService() {
    if (!this.isRunning) return;
    
    try {
      // Unregister background tasks
      try {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK_NAME);
        console.log('Background fetch unregistered');
      } catch (error) {
        // This is expected if task was never registered
        console.log('Background fetch was not registered:', error);
      }
      
      try {
        if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          console.log('Background location updates stopped');
        }
      } catch (error) {
        console.warn('Error stopping background location:', error);
      }
      
      // Stop location subscription
      if (this.locationSubscription) {
        this.locationSubscription.remove();
        this.locationSubscription = null;
      }
      
      // Stop permission checks
      this.stopPermissionChecks();
      
      this.isRunning = false;
      console.log('Background service stopped');
      
      return true;
    } catch (error) {
      console.error('Error stopping background service:', error);
      return false;
    }
  }

  // Check if background service is running
  isBackgroundServiceRunning() {
    return this.isRunning;
  }
  
  // Manually trigger a WebSocket reconnect from the background
  async triggerReconnect() {
    this.keepWebSocketsAlive();
    return true;
  }
}

export const backgroundService = new BackgroundService();