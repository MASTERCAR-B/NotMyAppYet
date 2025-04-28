import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useNewsStore } from '@/store/newsStore';
import { phoenixWebsocketService } from '@/services/websocketService';
import { fetchPhoenixNews } from '@/services/apiService';
import Colors from '@/constants/colors';

export const PhoenixSettings: React.FC = () => {
  const { serverConfig, updateServerConfig } = useNewsStore();
  
  const [websocketUrl, setWebsocketUrl] = useState(serverConfig.phoenixWebsocketUrl);
  const [apiUrl, setApiUrl] = useState(serverConfig.phoenixApiUrl);
  const [token, setToken] = useState(serverConfig.phoenixToken);
  const [isSaving, setIsSaving] = useState(false);
  
  const validateUrls = () => {
    let isValid = true;
    let errorMessage = '';
    
    // Basic URL validation
    if (!websocketUrl.startsWith('ws://') && !websocketUrl.startsWith('wss://')) {
      isValid = false;
      errorMessage = 'WebSocket URL must start with ws:// or wss://';
    } else if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      isValid = false;
      errorMessage = 'API URL must start with http:// or https://';
    }
    
    return { isValid, errorMessage };
  };
  
  const handleSave = () => {
    const { isValid, errorMessage } = validateUrls();
    
    if (!isValid) {
      if (Platform.OS === 'web') {
        alert(errorMessage);
      } else {
        Alert.alert('Invalid URL', errorMessage);
      }
      return;
    }
    
    setIsSaving(true);
    
    // Update the store with new URLs
    updateServerConfig({
      phoenixWebsocketUrl: websocketUrl,
      phoenixApiUrl: apiUrl,
      phoenixToken: token
    });
    
    // Reconnect to websocket with new URL
    phoenixWebsocketService.disconnect();
    
    try {
      if (token) {
        phoenixWebsocketService.connect(websocketUrl, token);
      }
      
      // Fetch news from new API URL
      fetchPhoenixNews().finally(() => {
        setIsSaving(false);
      });
    } catch (error) {
      console.error('Error connecting to Phoenix servers:', error);
      setIsSaving(false);
    }
  };
  
  const handleReset = () => {
    // Reset to default values
    const defaultConfig = {
      phoenixWebsocketUrl: 'wss://wss.phoenixnews.io',
      phoenixApiUrl: 'https://api.phoenixnews.io/getLastNews?limit=50',
      phoenixToken: ''
    };
    
    setWebsocketUrl(defaultConfig.phoenixWebsocketUrl);
    setApiUrl(defaultConfig.phoenixApiUrl);
    setToken(defaultConfig.phoenixToken);
    
    // Update the store
    updateServerConfig(defaultConfig);
    
    // Reconnect
    phoenixWebsocketService.disconnect();
    if (defaultConfig.phoenixToken) {
      phoenixWebsocketService.connect(defaultConfig.phoenixWebsocketUrl, defaultConfig.phoenixToken);
    }
    fetchPhoenixNews();
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phoenix News Settings</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phoenix WebSocket URL</Text>
        <TextInput
          style={styles.input}
          value={websocketUrl}
          onChangeText={setWebsocketUrl}
          placeholder="wss://wss.phoenixnews.io"
          placeholderTextColor={Colors.dark.secondaryText}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Must start with ws:// or wss://</Text>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phoenix API URL</Text>
        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder="https://api.phoenixnews.io/getLastNews?limit=50"
          placeholderTextColor={Colors.dark.secondaryText}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Must start with http:// or https://</Text>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phoenix Auth Token</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="Enter your Phoenix auth token"
          placeholderTextColor={Colors.dark.secondaryText}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={true}
        />
        <Text style={styles.hint}>
          {Platform.OS === 'web' 
            ? 'Token will be used for WebSocket but not for API requests on web due to CORS' 
            : 'Required for Phoenix WebSocket connection'}
        </Text>
      </View>
      
      <View style={styles.buttonGroup}>
        <Pressable 
          style={[styles.button, styles.resetButton]}
          onPress={handleReset}
          disabled={isSaving}
        >
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
        
        <Pressable 
          style={[styles.button, styles.saveButton, isSaving && styles.savingButton]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Connecting...' : 'Save Settings'}
          </Text>
        </Pressable>
      </View>
      
      <Text style={styles.note}>
        Note: Changing these settings will reconnect to the Phoenix servers immediately.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  webWarning: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  webWarningText: {
    color: Colors.dark.text,
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: Colors.dark.text,
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 12,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  hint: {
    color: Colors.dark.secondaryText,
    fontSize: 12,
    marginTop: 4,
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  button: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: Colors.dark.accent,
    flex: 1,
    marginLeft: 8,
  },
  savingButton: {
    opacity: 0.7,
  },
  resetButton: {
    backgroundColor: Colors.dark.highlight,
    paddingHorizontal: 20,
  },
  saveButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  resetButtonText: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  note: {
    color: Colors.dark.secondaryText,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});