import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NewsItem, FilterKeyword } from '@/types/news';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Define Android channel for important notifications
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('news-alerts', {
    name: 'News Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    description: 'Notifications for crypto news alerts',
  });
}

class NotificationService {
  private isInitialized = false;
  private webNotificationsSupported = false;
  private webNotificationsPermission = 'default';
  private initializationPromise: Promise<void> | null = null;
  private notificationReceivedListener: Notifications.Subscription | null = null;
  private notificationResponseListener: Notifications.Subscription | null = null;
  private recentNotifications: Set<string> = new Set();
  private readonly NOTIFICATION_DEDUPE_WINDOW = 60000; // 1 minute deduplication window
  private permissionMonitoringInterval: NodeJS.Timeout | null = null;
  
  // Keep track of notification stats for debugging
  private notificationStats = {
    success: 0,
    failed: 0,
    retried: 0,
    skipped: 0
  };

  async getNotificationStats() {
    return { ...this.notificationStats };
  }

  // Register app termination handler for cleanup
  constructor() {
    // Set up cleanup on app exit if possible
    if (Platform.OS !== 'web') {
      try {
        // Use AppState to detect background state 
        const { AppState } = require('react-native');
        this.setupAppStateListener(AppState);
      } catch (error) {
        console.error('Error setting up notification cleanup:', error);
      }
    }
  }
  
  private setupAppStateListener(AppState: any) {
    AppState.addEventListener('change', (nextAppState: string) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background, clear notification deduplication cache
        this.recentNotifications.clear();
        console.log('Cleared notification deduplication cache due to app state change');
      }
    });
  }

  async initialize() {
    // If already initialized, return immediately
    if (this.isInitialized) return;
    
    // If initialization is in progress, wait for it to complete
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // Start initialization and store the promise
    this.initializationPromise = this._doInitialize();
    
    try {
      await this.initializationPromise;
      
      // Start monitoring permissions if initialized successfully
      if (this.isInitialized) {
        this.startPermissionMonitoring();
      }
    } catch (error) {
      console.error('Notification initialization failed:', error);
      // Reset the promise so we can try again
      this.initializationPromise = null;
    }
  }

  private async _doInitialize() {
    if (Platform.OS === 'web') {
      // Check if browser supports notifications
      if ('Notification' in window) {
        this.webNotificationsSupported = true;
        this.webNotificationsPermission = Notification.permission;
        
        // Request permission if not already granted
        if (Notification.permission === 'default') {
          try {
            const permission = await Notification.requestPermission();
            this.webNotificationsPermission = permission;
            console.log('Web notification permission:', permission);
          } catch (error) {
            console.error('Error requesting notification permission:', error);
          }
        }
        
        this.isInitialized = true;
        console.log('Web notification service initialized, permission:', this.webNotificationsPermission);
      } else {
        console.log('Web notifications not supported in this browser');
      }
      return;
    }

    try {
      // Mobile notification setup
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get notification permissions');
        return;
      }

      // Set notification categories/actions if needed
      await Notifications.setNotificationCategoryAsync('news', [
        {
          identifier: 'view',
          buttonTitle: 'View',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);
      
      // Register for push notifications if needed (only in production builds)
      try {
        const { backgroundService } = require('./backgroundService');
        if (!backgroundService.isRunningInExpoGo()) {
          const token = await Notifications.getExpoPushTokenAsync();
          console.log('Expo push token:', token);
          // Here you would typically send this token to your server
        }
      } catch (error) {
        console.error('Error getting push token:', error);
      }

      // Remove any existing listeners to prevent memory leaks
      this.cleanup();

      // Set up notification received handler for background state
      this.notificationReceivedListener = Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification received in foreground:', notification);
        // Handle the notification data as needed
      });

      // Set up notification response handler
      this.notificationResponseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          console.log('Notification response received:', response.notification.request.content.data);
          
          // Safely extract newsItem from response data
          const data = response.notification.request.content.data;
          const newsItem = data && typeof data === 'object' && 'newsItem' in data
            ? data.newsItem as NewsItem
            : null;
            
          if (newsItem) {
            console.log('News item from notification:', newsItem.title);
            // Here you would navigate to the specific news item or handle the response
            // This will depend on your navigation setup
          } else {
            console.warn('Invalid news item data in notification response');
          }
        } catch (error) {
          console.error('Error handling notification response:', error);
        }
      });

      this.isInitialized = true;
      console.log('Mobile notification service initialized');
    } catch (error) {
      console.error('Error initializing notifications:', error);
      throw error; // Rethrow to indicate initialization failed
    }
  }

  // Cleanup method to remove notification listeners
  cleanup() {
    if (this.notificationReceivedListener) {
      this.notificationReceivedListener.remove();
      this.notificationReceivedListener = null;
    }
    
    if (this.notificationResponseListener) {
      this.notificationResponseListener.remove();
      this.notificationResponseListener = null;
    }
    
    // Clean up permission monitoring
    this.stopPermissionMonitoring();
    
    // Clear notification deduplication cache
    this.recentNotifications.clear();
  }

  async scheduleNotification(newsItem: NewsItem, matchedKeyword: string) {
    try {
      // Wait for initialization to complete
      if (!this.isInitialized) {
        await this.initialize();
        
        // Check again after initialization attempt
        if (!this.isInitialized) {
          console.log('Failed to initialize notification service, skipping notification');
          this.notificationStats.skipped++;
          return;
        }
      }

      // Skip notifications if we have no permissions
      const permissionStatus = await this.getPermissionStatus();
      if (permissionStatus !== 'granted') {
        console.log('Notification permission not granted, skipping notification');
        this.notificationStats.skipped++;
        return;
      }
      
      // Deduplicate notifications
      const notificationId = `${newsItem._id || ''}-${matchedKeyword}`;
      if (this.recentNotifications.has(notificationId)) {
        console.log('Skipping duplicate notification:', newsItem.title);
        this.notificationStats.skipped++;
        return;
      }
      
      // Add to recent notifications
      this.recentNotifications.add(notificationId);
      
      // Set a timeout to remove from recent notifications after the deduplication window
      setTimeout(() => {
        this.recentNotifications.delete(notificationId);
      }, this.NOTIFICATION_DEDUPE_WINDOW);

      // Create a notification title that highlights the matched keyword
      const title = `${newsItem.source}: ${matchedKeyword.toUpperCase()} Alert`;
      const body = newsItem.title || 'New crypto alert';
      
      if (Platform.OS === 'web') {
        await this.showWebNotification(title, body, newsItem);
      } else {
        await this.showMobileNotification(title, body, newsItem);
      }
    } catch (error) {
      console.error('Error scheduling notification:', error);
      this.notificationStats.failed++;
    }
  }
  
  private async showWebNotification(title: string, body: string, newsItem: NewsItem) {
    if (!this.webNotificationsSupported || this.webNotificationsPermission !== 'granted') {
      console.log('Web notifications not supported or permission not granted');
      this.notificationStats.skipped++;
      return;
    }
    
    try {
      const options = {
        body,
        icon: newsItem.icon || 'https://news.treeofalpha.com/static/images/community.png',
        tag: newsItem._id, // Prevent duplicate notifications
        data: newsItem,
        requireInteraction: true, // Keep notification visible until user interacts with it
      };
      
      const notification = new Notification(title, options);
      
      // Handle notification click
      notification.onclick = () => {
        // Focus on window and close notification
        window.focus();
        notification.close();
        
        // Open URL if available
        if (newsItem.url) {
          window.open(newsItem.url, '_blank');
        }
      };
      
      console.log('Web notification shown:', title);
      this.notificationStats.success++;
    } catch (error) {
      console.error('Error showing web notification:', error);
      this.notificationStats.failed++;
      // No retry for web notifications as they're likely to fail for the same reason
    }
  }
  
  private async showMobileNotification(title: string, body: string, newsItem: NewsItem, retryCount = 0) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { newsItem },
          categoryIdentifier: 'news',
          // Use correct channel ID for Android
          ...(Platform.OS === 'android' ? { channelId: 'news-alerts' } : {})
        },
        trigger: null, // Send immediately
      });
      
      console.log('Mobile notification scheduled for:', newsItem.title);
      this.notificationStats.success++;
    } catch (error) {
      console.error('Error scheduling mobile notification:', error);
      
      if (retryCount > 0) {
        this.notificationStats.retried++;
      } else {
        this.notificationStats.failed++;
      }
      
      // Retry up to 2 times with exponential backoff if it's a transient error
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        console.log(`Retrying notification in ${delay}ms (attempt ${retryCount + 1}/2)`);
        
        setTimeout(() => {
          this.showMobileNotification(title, body, newsItem, retryCount + 1);
        }, delay);
      }
    }
  }

  // Check if a news item matches any filter keywords
  checkForKeywordMatch(newsItem: NewsItem, filterKeywords: FilterKeyword[]): string | null {
    if (!filterKeywords.length) return null;
    
    // Check title and body for keyword matches
    const titleLower = newsItem.title?.toLowerCase() || '';
    const bodyLower = newsItem.body?.toLowerCase() || '';
    
    for (const filter of filterKeywords) {
      if (titleLower.includes(filter.keyword) || bodyLower.includes(filter.keyword)) {
        return filter.keyword;
      }
    }
    
    return null;
  }
  
  // Request notification permissions manually (can be called from settings)
  async requestPermissions() {
    if (Platform.OS === 'web') {
      if ('Notification' in window && Notification.permission !== 'granted') {
        try {
          const permission = await Notification.requestPermission();
          this.webNotificationsPermission = permission;
          console.log('Web notification permission:', permission);
          return permission === 'granted';
        } catch (error) {
          console.error('Error requesting notification permission:', error);
          return false;
        }
      }
      return Notification.permission === 'granted';
    } else {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
      } catch (error) {
        console.error('Error requesting notification permissions:', error);
        return false;
      }
    }
  }
  
  // Clear all notifications
  async clearAllNotifications() {
    if (Platform.OS === 'web') {
      // Nothing to do for web notifications
      return;
    }
    
    try {
      await Notifications.dismissAllNotificationsAsync();
      console.log('All notifications cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }
  
  // Get current notification permissions status
  async getPermissionStatus(): Promise<string> {
    if (Platform.OS === 'web') {
      if (!('Notification' in window)) return 'unavailable';
      return Notification.permission;
    }
    
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch (error) {
      console.error('Error getting notification permissions status:', error);
      return 'error';
    }
  }
  
  // Monitor for permission changes
  async startPermissionMonitoring() {
    if (Platform.OS === 'web') {
      // Web doesn't have a good way to monitor permission changes during runtime
      return;
    }
    
    try {
      // Stop any existing monitoring interval to prevent duplicates
      this.stopPermissionMonitoring();
      
      // Check permissions every 30 seconds
      this.permissionMonitoringInterval = setInterval(async () => {
        const currentStatus = await this.getPermissionStatus();
        if (currentStatus !== 'granted' && this.isInitialized) {
          // Permissions were revoked during runtime
          console.log('Notification permissions were revoked during runtime');
          
          // Reset initialization to force a new permission check next time
          this.isInitialized = false;
          
          // Try to re-initialize
          this.initialize().catch(err => {
            console.error('Failed to re-initialize after permission change:', err);
          });
        }
      }, 30000); // 30 seconds
    } catch (error) {
      console.error('Error setting up permission monitoring:', error);
    }
  }
  
  // Stop permission monitoring interval
  private stopPermissionMonitoring() {
    if (this.permissionMonitoringInterval) {
      clearInterval(this.permissionMonitoringInterval);
      this.permissionMonitoringInterval = null;
    }
  }
}

export const notificationService = new NotificationService();