import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, Platform, Pressable, Alert } from 'react-native';
import { MapPin, Info } from 'lucide-react-native';
import { backgroundService } from '@/services/backgroundService';
import Colors from '@/constants/colors';

export const BackgroundModeToggle: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isExpoGo, setIsExpoGo] = useState(false);
  
  // Check if we're running in Expo Go
  useEffect(() => {
    const checkExpoGo = async () => {
      try {
        const Constants = require('expo-constants').default;
        setIsExpoGo(Constants.appOwnership !== 'standalone');
      } catch (e) {
        setIsExpoGo(false);
      }
    };
    
    checkExpoGo();
  }, []);
  
  // Check if background service is running on component mount
  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        // Check if service is running
        const isRunning = backgroundService.isBackgroundServiceRunning();
        
        // If running, also verify we still have permissions
        if (isRunning) {
          const hasPermissions = await backgroundService.checkPermissions();
          if (!hasPermissions) {
            console.log('Permissions were revoked, disabling background service');
            await backgroundService.stopBackgroundService();
            setIsEnabled(false);
            return;
          }
        }
        
        setIsEnabled(isRunning);
      } catch (error) {
        console.error('Error checking background service status:', error);
        setIsEnabled(false);
      }
    };
    
    checkServiceStatus();
    
    // Set up permission change listener for iOS
    if (Platform.OS === 'ios') {
      const subscription = backgroundService.addPermissionListener((hasPermission) => {
        if (!hasPermission && isEnabled) {
          console.log('Location permission was revoked, stopping background service');
          backgroundService.stopBackgroundService();
          setIsEnabled(false);
        }
      });
      
      return () => {
        if (subscription?.remove) {
          subscription.remove();
        }
      };
    }
  }, []);
  
  const toggleBackgroundMode = async () => {
    if (isEnabled) {
      // Turn off background mode
      await backgroundService.stopBackgroundService();
      setIsEnabled(false);
    } else {
      // Turn on background mode
      if (Platform.OS === 'web') {
        Alert.alert(
          'Not Available on Web',
          'Background mode is only available on mobile devices.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Show explanation before requesting permissions
      Alert.alert(
        'Enable Background Mode',
        'This will use your location in the background to keep the app active and ensure you receive news alerts even when the app is not in focus. Your location data is not stored or shared.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Enable', 
            onPress: async () => {
              try {
                console.log('User confirmed, starting background service...');
                
                // First check for permissions
                const hasPermissions = await backgroundService.checkPermissions();
                if (!hasPermissions) {
                  const granted = await backgroundService.requestPermissions();
                  if (!granted) {
                    Alert.alert(
                      'Permission Denied',
                      Platform.OS === 'ios' 
                        ? 'Background mode requires location permission. Please go to Settings > Privacy > Location Services to enable it for this app.'
                        : 'Background mode requires location permission. Please enable it in your device settings to use this feature.',
                      [
                        { text: 'Cancel' },
                        { 
                          text: 'Open Settings', 
                          onPress: () => backgroundService.openSettings() 
                        }
                      ]
                    );
                    return;
                  }
                }
                
                // Now try to start the service
                const success = await backgroundService.startBackgroundService();
                console.log('Background service start result:', success);
                setIsEnabled(success);
                
                if (!success) {
                  // Try to recover if service fails to start
                  await backgroundService.stopBackgroundService();
                  setTimeout(async () => {
                    // Wait a moment and try again
                    const retrySuccess = await backgroundService.startBackgroundService();
                    setIsEnabled(retrySuccess);
                    
                    if (!retrySuccess) {
                      Alert.alert(
                        'Service Start Failed',
                        'Could not start background service. This may be due to system restrictions.',
                        [{ text: 'OK' }]
                      );
                    }
                  }, 1000);
                }
              } catch (error) {
                console.error('Error in background toggle:', error);
                Alert.alert(
                  'Error',
                  'Failed to start background mode: ' + (error instanceof Error ? error.message : String(error)),
                  [{ text: 'OK' }]
                );
              }
            }
          }
        ]
      );
    }
  };
  
  const showInfoAlert = () => {
    Alert.alert(
      'About Background Mode',
      'Background mode uses location services to keep the app active in the background, ensuring you receive real-time news alerts even when not using your phone. This may increase battery usage. Your location data is never stored or shared.',
      [{ text: 'OK' }]
    );
  };
  
  // Don't show on web
  if (Platform.OS === 'web') {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <MapPin size={18} color={isEnabled ? Colors.dark.accent : Colors.dark.secondaryText} />
          <Text style={styles.title}>Background Mode</Text>
        </View>
        
        <Pressable onPress={showInfoAlert} style={styles.infoButton}>
          <Info size={18} color={Colors.dark.secondaryText} />
        </Pressable>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.description}>
          Keep the app active in the background to receive real-time news alerts even when your phone is locked.
        </Text>
        
        {isExpoGo && (
          <View style={styles.expoGoWarning}>
            <Text style={styles.expoGoWarningText}>
              Note: Background functionality is limited in Expo Go. For full background support, use a development build.
            </Text>
          </View>
        )}
        
        <View style={styles.switchContainer}>
          <Text style={styles.switchLabel}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </Text>
          <Switch
            trackColor={{ false: '#333', true: 'rgba(0, 200, 83, 0.3)' }}
            thumbColor={isEnabled ? Colors.dark.accent : '#f4f3f4'}
            ios_backgroundColor="#333"
            onValueChange={toggleBackgroundMode}
            value={isEnabled}
          />
        </View>
        
        {isEnabled && (
          <Text style={styles.activeText}>
            Background mode is active. You will receive news alerts even when the app is closed.
          </Text>
        )}
        
        <Text style={styles.noteText}>
          Note: For full background functionality on iOS, this app must be built with Xcode and installed on a physical device.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  infoButton: {
    padding: 4,
  },
  content: {
    marginBottom: 8,
  },
  description: {
    color: Colors.dark.secondaryText,
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  expoGoWarning: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  expoGoWarningText: {
    color: Colors.dark.text,
    fontSize: 14,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  activeText: {
    color: Colors.dark.accent,
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
  noteText: {
    color: Colors.dark.secondaryText,
    fontSize: 12,
    marginTop: 12,
    fontStyle: 'italic',
  },
});