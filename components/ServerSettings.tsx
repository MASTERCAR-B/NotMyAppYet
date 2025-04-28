import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, Platform, Modal, ScrollView, Switch } from 'react-native';
import { useNewsStore } from '@/store/newsStore';
import { connectWebsocket, disconnectAllWebsockets } from '@/services/websocketService';
import { fetchAllNews } from '@/services/apiService';
import Colors from '@/constants/colors';

export const ServerSettings: React.FC = () => {
  const { serverConfig, updateServerConfig, disableApiRequests, setDisableApiRequests } = useNewsStore();
  
  // State for the list of server configurations
  const [servers, setServers] = useState(serverConfig.servers || []);
  
  // State for adding a new server
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newWebsocketUrl, setNewWebsocketUrl] = useState('');
  const [newApiUrl, setNewApiUrl] = useState('');
  const [newToken, setNewToken] = useState('');
  
  // State for edit mode
  const [editIndex, setEditIndex] = useState<number | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize with default servers if none exist
  useEffect(() => {
    if (!serverConfig.servers || serverConfig.servers.length === 0) {
      setServers([
        {
          name: 'Tree of Alpha',
          websocketUrl: 'ws://35.76.194.63:4873',
          apiUrl: '',
          token: ''
        },
        {
          name: 'Phoenix',
          websocketUrl: 'ws://35.76.194.63:5421',
          apiUrl: '',
          token: ''
        }
      ]);
    }
  }, []);
  
  const validateUrl = (url, type) => {
    if (type === 'websocket' && !url.startsWith('ws://') && !url.startsWith('wss://')) {
      return { isValid: false, message: 'WebSocket URL must start with ws:// or wss://' };
    } else if (type === 'api' && !url.startsWith('http://') && !url.startsWith('https://')) {
      return { isValid: false, message: 'API URL must start with http:// or https://' };
    }
    return { isValid: true, message: '' };
  };
  
  const handleAddServer = () => {
    // Validate inputs
    if (!newServerName.trim()) {
      showAlert('Please enter a server name');
      return;
    }
    
    const websocketValidation = validateUrl(newWebsocketUrl, 'websocket');
    if (!websocketValidation.isValid) {
      showAlert(websocketValidation.message);
      return;
    }
    
    const apiValidation = validateUrl(newApiUrl, 'api');
    if (!apiValidation.isValid) {
      showAlert(apiValidation.message);
      return;
    }
    
    const newServer = {
      name: newServerName.trim(),
      websocketUrl: newWebsocketUrl.trim(),
      apiUrl: newApiUrl.trim(),
      token: newToken.trim()
    };
    
    if (editIndex !== null) {
      // Update existing server
      const updatedServers = [...servers];
      updatedServers[editIndex] = newServer;
      setServers(updatedServers);
    } else {
      // Add new server
      setServers([...servers, newServer]);
    }
    
    // Clear form and close modal
    resetForm();
    setShowAddModal(false);
  };
  
  const resetForm = () => {
    setNewServerName('');
    setNewWebsocketUrl('');
    setNewApiUrl('');
    setNewToken('');
    setEditIndex(null);
  };
  
  const handleEditServer = (index) => {
    const server = servers[index];
    setNewServerName(server.name);
    setNewWebsocketUrl(server.websocketUrl);
    setNewApiUrl(server.apiUrl);
    setNewToken(server.token);
    setEditIndex(index);
    setShowAddModal(true);
  };
  
  const handleRemoveServer = (index) => {
    const updatedServers = servers.filter((_, i) => i !== index);
    setServers(updatedServers);
  };
  
  const showAlert = (message) => {
    if (Platform.OS === 'web') {
      alert(message);
    } else {
      Alert.alert('Error', message);
    }
  };
  
  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Update the store with new server configurations and API request toggle setting
      const updatedConfig = {
        ...serverConfig,
        servers: servers,
        disableApiRequests: disableApiRequests
      };
      updateServerConfig(updatedConfig);
      
      // Disconnect all existing connections
      await disconnectAllWebsockets();
      
      // Short delay to ensure clean disconnect
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Connect to all websockets
      for (const server of servers) {
        connectWebsocket(server.name, server.websocketUrl, server.token || null);
      }
      
      // Fetch initial data from all API endpoints only if API requests are enabled
      if (!disableApiRequests) {
        await fetchAllNews(servers);
      }
      
      showAlert('Settings saved and connections established');
    } catch (error) {
      console.error('Error connecting to servers:', error);
      showAlert('Failed to connect to servers with new settings. Please check URLs and try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleReset = async () => {
    // Reset to default values
    const defaultServers = [
      {
        name: 'Tree of Alpha',
        websocketUrl: 'ws://35.76.194.63:4873',
        apiUrl: '',
        token: 'H&7TJx%3pL%%n!&kSmyYb'
      },
      {
        name: 'Phoenix',
        websocketUrl: 'ws://35.76.194.63:5421',
        apiUrl: '',
        token: 'H&7TJx%3pL%%n!&kSmyYb'
      }
    ];
    
    setServers(defaultServers);
    // Reset API requests to enabled
    setDisableApiRequests(false);
    
    // Update the store
    const updatedConfig = {
      ...serverConfig,
      servers: defaultServers,
      disableApiRequests: false
    };
    updateServerConfig(updatedConfig);
    
    setIsSaving(true);
    
    try {
      // Disconnect all existing connections
      await disconnectAllWebsockets();
      
      // Short delay to ensure clean disconnect
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Connect to default servers
      for (const server of defaultServers) {
        connectWebsocket(server.name, server.websocketUrl, server.token || null);
      }
      
      // Fetch initial data (API requests will be enabled after reset)
      await fetchAllNews(defaultServers);
      
      showAlert('Settings reset to defaults');
    } catch (error) {
      console.error('Error resetting connections:', error);
      showAlert('Failed to reset connections. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle API requests toggle
  const handleApiToggle = (value) => {
    setDisableApiRequests(!value);
  };
  
  return (
    <ScrollView>
      <View style={styles.container}>
        <Text style={styles.title}>Server Settings</Text>
        
        {/* Toggle for API requests */}
        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>API Data Fetching</Text>
            <Text style={styles.settingDescription}>
              {disableApiRequests 
                ? "API requests for news data are disabled" 
                : "Fetch news data from API endpoints"}
            </Text>
          </View>
          <Switch
            value={!disableApiRequests}
            onValueChange={handleApiToggle}
            trackColor={{ false: Colors.dark.highlight, true: Colors.dark.accent }}
          />
        </View>
        
        {servers.map((server, index) => (
          <View key={index} style={styles.serverCard}>
            <Text style={styles.serverName}>{server.name}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>WebSocket URL</Text>
              <TextInput
                style={styles.input}
                value={server.websocketUrl}
                editable={false}
                placeholderTextColor={Colors.dark.secondaryText}
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>API URL</Text>
              <TextInput
                style={[
                  styles.input, 
                  disableApiRequests && styles.disabledInput
                ]}
                value={server.apiUrl}
                editable={false}
                placeholderTextColor={Colors.dark.secondaryText}
              />
              {disableApiRequests && (
                <Text style={styles.disabledText}>API requests disabled</Text>
              )}
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Auth Token</Text>
              <TextInput
                style={styles.input}
                value={server.token ? '••••••••' : 'No token set'}
                editable={false}
                placeholderTextColor={Colors.dark.secondaryText}
              />
            </View>
            
            <View style={styles.serverButtonGroup}>
              <Pressable 
                style={[styles.serverButton, styles.editButton]}
                onPress={() => handleEditServer(index)}
              >
                <Text style={styles.serverButtonText}>Edit</Text>
              </Pressable>
              
              <Pressable 
                style={[styles.serverButton, styles.removeButton]}
                onPress={() => handleRemoveServer(index)}
              >
                <Text style={styles.serverButtonText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
        
        <Pressable 
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowAddModal(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Add Server</Text>
        </Pressable>
        
        <View style={styles.buttonGroup}>
          <Pressable 
            style={[styles.button, styles.resetButton]}
            onPress={handleReset}
            disabled={isSaving}
          >
            <Text style={styles.resetButtonText}>Reset All</Text>
          </Pressable>
          
          <Pressable 
            style={[styles.button, styles.saveButton, isSaving && styles.savingButton]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Connecting...' : 'Save All'}
            </Text>
          </Pressable>
        </View>
        
        <Text style={styles.note}>
          Note: Changing these settings will reconnect to the servers immediately.
          {disableApiRequests && " API requests for news data are disabled."}
        </Text>
        
        {/* Add/Edit Server Modal */}
        <Modal
          visible={showAddModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editIndex !== null ? 'Edit Server' : 'Add New Server'}
              </Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Server Name</Text>
                <TextInput
                  style={styles.input}
                  value={newServerName}
                  onChangeText={setNewServerName}
                  placeholder="e.g. Tree of Alpha"
                  placeholderTextColor={Colors.dark.secondaryText}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>WebSocket URL</Text>
                <TextInput
                  style={styles.input}
                  value={newWebsocketUrl}
                  onChangeText={setNewWebsocketUrl}
                  placeholder="wss://example.com/ws"
                  placeholderTextColor={Colors.dark.secondaryText}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.hint}>Must start with ws:// or wss://</Text>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>API URL</Text>
                <TextInput
                  style={[
                    styles.input,
                    disableApiRequests && styles.disabledInput
                  ]}
                  value={newApiUrl}
                  onChangeText={setNewApiUrl}
                  placeholder="https://example.com/api"
                  placeholderTextColor={Colors.dark.secondaryText}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.hint}>
                  Must start with http:// or https://
                  {disableApiRequests && " (API requests are currently disabled)"}
                </Text>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Auth Token (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newToken}
                  onChangeText={setNewToken}
                  placeholder="Enter authentication token"
                  placeholderTextColor={Colors.dark.secondaryText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={true}
                />
              </View>
              
              <View style={styles.modalButtonGroup}>
                <Pressable 
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                
                <Pressable 
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleAddServer}
                >
                  <Text style={styles.saveButtonText}>
                    {editIndex !== null ? 'Update' : 'Add'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    padding: 16,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  settingDescription: {
    color: Colors.dark.secondaryText,
    fontSize: 12,
    marginTop: 4,
  },
  serverCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  serverName: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
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
  disabledInput: {
    opacity: 0.5,
  },
  disabledText: {
    color: Colors.dark.secondaryText,
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  hint: {
    color: Colors.dark.secondaryText,
    fontSize: 12,
    marginTop: 4,
  },
  serverButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  serverButton: {
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginLeft: 8,
    minWidth: 80,
  },
  editButton: {
    backgroundColor: Colors.dark.highlight,
  },
  removeButton: {
    backgroundColor: '#6B2D2D',
  },
  serverButtonText: {
    color: Colors.dark.text,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: Colors.dark.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButton: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: Colors.dark.card,
    marginRight: 8,
  },
  cancelButtonText: {
    color: Colors.dark.text,
    fontSize: 16,
  },
});