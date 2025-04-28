import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, Text, View, SafeAreaView, Pressable } from "react-native";
import { useNavigation, useLocalSearchParams, useRouter } from "expo-router";
import Colors from "@/constants/colors";

type ModalParams = {
  title?: string;
  message?: string;
  preventDismiss?: boolean;
};

export default function ModalScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<ModalParams>();
  
  // Extract parameters with fallbacks
  const title = params.title || 'Information';
  const message = params.message || 'No additional information provided.';
  
  // Handle outside clicks (Android back button)
  useEffect(() => {
    // Only attach listener if we want to prevent dismissal
    // otherwise just return a noop cleanup function
    if (params.preventDismiss) {
      const unsubscribe = navigation.addListener('beforeRemove', (e) => {
        // Prevent dismissal if needed based on params
        if (params.preventDismiss === 'true') {
          e.preventDefault();
          // Show confirmation dialog or other action here
        }
      });
      
      return unsubscribe;
    }
    
    return () => {}; // noop cleanup function
  }, [navigation, params.preventDismiss]);
  
  const handleClose = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.modalContent}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.separator} />
        <Text style={styles.message}>{message}</Text>
        
        <Pressable 
          style={styles.closeButton}
          onPress={handleClose}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
      </View>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === "ios" ? "light" : "auto"} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: '85%',
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)'
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
      }
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors.dark.text,
    textAlign: 'center',
  },
  separator: {
    marginVertical: 15,
    height: 1,
    width: "100%",
    backgroundColor: Colors.dark.border,
  },
  message: {
    fontSize: 16,
    color: Colors.dark.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  closeButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
