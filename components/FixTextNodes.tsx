import React from 'react';
import { Text } from 'react-native';

/**
 * This component wraps text content to ensure it's properly contained
 * within Text components instead of being direct children of View
 * 
 * Usage: 
 * <SafeText>Your text here</SafeText>
 */
export const SafeText: React.FC<{
  children: React.ReactNode;
  style?: any;
}> = ({ children, style }) => {
  // Convert everything to string and wrap in Text component
  return <Text style={style}>{children}</Text>;
}; 