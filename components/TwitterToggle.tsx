import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Twitter, Eye, EyeOff } from 'lucide-react-native';
import { useNewsStore } from '@/store/newsStore';
import Colors from '@/constants/colors';

export const TwitterToggle: React.FC = () => {
  const { showTwitterPosts, toggleTwitterPosts } = useNewsStore();
  
  return (
    <Pressable 
      style={[styles.container, showTwitterPosts ? styles.active : styles.inactive]} 
      onPress={toggleTwitterPosts}
    >
      <Twitter 
        size={16} 
        color={showTwitterPosts ? Colors.dark.text : Colors.dark.secondaryText} 
      />
      {showTwitterPosts ? (
        <Eye size={16} color={Colors.dark.text} />
      ) : (
        <EyeOff size={16} color={Colors.dark.secondaryText} />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  active: {
    backgroundColor: Colors.dark.highlight,
  },
  inactive: {
    backgroundColor: 'rgba(42, 42, 42, 0.5)',
  },
});