import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, Platform, ScrollView, Linking } from 'react-native';
import { X, Plus, AlertCircle, Bell, BellOff } from 'lucide-react-native';
import { useNewsStore } from '@/store/newsStore';
import { notificationService } from '@/services/notificationService';
import Colors from '@/constants/colors';
import * as Notifications from 'expo-notifications';

export const FilterKeywords: React.FC = () => {
  const [newKeyword, setNewKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { filterKeywords, addFilterKeyword, removeFilterKeyword } = useNewsStore();
  
  // Check notification permission status on mount
  useEffect(() => {
    checkNotificationPermission();
  }, []);
  
  const checkNotificationPermission = async () => {
    if (Platform.OS === 'web') {
      setNotificationsEnabled('Notification' in window && Notification.permission === 'granted');
    } else {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setNotificationsEnabled(status === 'granted');
      } catch (error) {
        console.error('Error checking notification permission:', error);
        setNotificationsEnabled(false);
      }
    }
  };
  
  const handleAddKeyword = () => {
    const keyword = newKeyword.trim();
    
    if (!keyword) {
      setError('Keyword cannot be empty');
      return;
    }
    
    if (keyword.length < 2) {
      setError('Keyword must be at least 2 characters');
      return;
    }
    
    // Check if keyword already exists
    if (filterKeywords.some(k => k.keyword === keyword.toLowerCase())) {
      setError('This keyword already exists');
      return;
    }
    
    setError(null);
    addFilterKeyword(keyword);
    setNewKeyword('');
  };
  
  const handleRemoveKeyword = (id: string) => {
    if (Platform.OS === 'web') {
      removeFilterKeyword(id);
    } else {
      Alert.alert(
        'Remove Keyword',
        'Are you sure you want to remove this filter keyword?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeFilterKeyword(id) }
        ]
      );
    }
  };
  
  const handleRequestNotificationPermission = async () => {
    const granted = await notificationService.requestPermissions();
    setNotificationsEnabled(granted);
    
    if (!granted) {
      if (Platform.OS === 'ios') {
        // On iOS, after the first rejection, the user must go to Settings
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'denied') {
          Alert.alert(
            'Enable Notifications',
            'To receive alerts for keywords, please enable notifications in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Open Settings', 
                onPress: () => {
                  try {
                    // Use Linking to open settings on iOS - more reliable than presentPermissionRequestAsync
                    Linking.openSettings();
                  } catch (error) {
                    console.error('Error opening settings:', error);
                    // Fallback to the older method if Linking fails
                    try {
                      Notifications.presentPermissionRequestAsync();
                    } catch (secondError) {
                      console.error('Failed to open settings using fallback method:', secondError);
                    }
                  }
                }
              }
            ]
          );
        }
      } else if (Platform.OS === 'android') {
        Alert.alert(
          'Notification Permission',
          'Please enable notifications to receive alerts for your filter keywords.',
          [{ text: 'OK' }]
        );
      }
    }
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Filter Keywords</Text>
        
        <Pressable 
          style={styles.notificationButton}
          onPress={handleRequestNotificationPermission}
        >
          {notificationsEnabled ? (
            <Bell size={20} color={Colors.dark.accent} />
          ) : (
            <BellOff size={20} color={Colors.dark.secondaryText} />
          )}
        </Pressable>
      </View>
      
      <Text style={styles.description}>
        Add keywords to filter news. You will receive notifications when news containing these keywords arrives.
      </Text>
      
      {!notificationsEnabled && (
        <View style={styles.notificationWarning}>
          <AlertCircle size={16} color={Colors.dark.secondaryText} />
          <Text style={styles.notificationWarningText}>
            Notifications are disabled. Tap the bell icon to enable.
          </Text>
        </View>
      )}
      
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          value={newKeyword}
          onChangeText={(text) => {
            setNewKeyword(text);
            setError(null);
          }}
          placeholder="Add keyword..."
          placeholderTextColor={Colors.dark.secondaryText}
          returnKeyType="done"
          onSubmitEditing={handleAddKeyword}
        />
        <Pressable 
          style={styles.addButton} 
          onPress={handleAddKeyword}
        >
          <Plus color={Colors.dark.text} size={20} />
        </Pressable>
      </View>
      
      {error && (
        <View style={styles.errorContainer}>
          <AlertCircle size={16} color={Colors.dark.negative} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      
      {/* Use ScrollView instead of FlatList to avoid VirtualizedList warnings */}
      <ScrollView 
        contentContainerStyle={styles.keywordsList}
        horizontal={false}
        showsVerticalScrollIndicator={false}
      >
        {filterKeywords.length > 0 ? (
          <View style={styles.keywordsContainer}>
            {filterKeywords.map((item) => (
              <View key={item.id} style={styles.keywordItem}>
                <Text style={styles.keywordText}>{item.keyword}</Text>
                <Pressable 
                  style={styles.removeButton}
                  onPress={() => handleRemoveKeyword(item.id)}
                >
                  <X color={Colors.dark.text} size={16} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No filter keywords added yet</Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  notificationButton: {
    padding: 8,
  },
  description: {
    color: Colors.dark.secondaryText,
    fontSize: 14,
    marginBottom: 16,
  },
  notificationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(170, 170, 170, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  notificationWarningText: {
    color: Colors.dark.secondaryText,
    fontSize: 14,
    marginLeft: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 12,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inputError: {
    borderColor: Colors.dark.negative,
  },
  addButton: {
    backgroundColor: Colors.dark.highlight,
    borderRadius: 8,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    color: Colors.dark.negative,
    fontSize: 12,
    marginLeft: 8,
  },
  keywordsList: {
    paddingBottom: 8,
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.highlight,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  keywordText: {
    color: Colors.dark.text,
    marginRight: 8,
  },
  removeButton: {
    padding: 2,
  },
  emptyText: {
    color: Colors.dark.secondaryText,
    fontStyle: 'italic',
  },
});