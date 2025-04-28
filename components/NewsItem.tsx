import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import { ChevronDown, ChevronUp, ExternalLink, Bell } from 'lucide-react-native';
import { NewsItem as NewsItemType } from '@/types/news';
import Colors from '@/constants/colors';
import { decodeHtmlEntities } from '@/utils/textUtils';

interface NewsItemProps {
  item: NewsItemType;
  onPress?: () => void;
}

export const NewsItem: React.FC<NewsItemProps> = ({ item, onPress }) => {
  // Format the date from timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };
  
  // Format time as hh:mm:ss
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: false 
    });
  };
  
  // Get the main coin from suggestions if available
  const mainCoin = item.suggestions && item.suggestions.length > 0 
    ? item.suggestions[0].coin 
    : item.coin;
  
  // Get price change (with better error handling)
  const getPriceChange = (coin: string) => {
    if (!coin) return null;
    
    const mockChanges: Record<string, number> = {
      'BTC': -6.86,
      'ETH': -9.92,
      'BNB': -5.29,
      'SOL': -3.45,
      'HLP': -12.8,
      'GALA': -8.2,
      'DOGE': -4.7,
      'XRP': -7.3,
      'FXS': 2.4
    };
    
    // Return a pseudo-random but consistent value for coins not in the list
    if (!(coin in mockChanges)) {
      // Generate a deterministic but pseudo-random number between -15 and +15
      const hash = coin.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return ((hash % 30) - 15); 
    }
    
    return mockChanges[coin];
  };
  
  const priceChange = mainCoin ? getPriceChange(mainCoin) : null;
  const isNegative = priceChange !== null && priceChange < 0;
  const isPositive = priceChange !== null && priceChange > 0;
  
  // Handle opening the news URL
  const handleOpenUrl = () => {
    if (item.url) {
      Linking.canOpenURL(item.url)
        .then(supported => {
          if (supported) {
            return Linking.openURL(item.url);
          } else {
            console.error('Cannot open URL:', item.url);
            if (Platform.OS !== 'web') {
              Alert.alert(
                'Cannot Open Link',
                'This URL cannot be opened. It may be invalid or unsupported.'
              );
            }
            return Promise.reject('URL not supported');
          }
        })
        .catch(err => {
          console.error('Error opening URL:', err);
          if (Platform.OS !== 'web') {
            Alert.alert(
              'Link Error',
              'There was an error opening this link. Please try again later.'
            );
          }
        });
    }
  };
  
  // Determine if this is an X (formerly Twitter) post
  const isXPost = item.source === 'X';
  
  // Get category text
  const getCategoryText = () => {
    if (isXPost) {
      return 'X';
    }
    if (item.source === 'Terminal') {
      return 'FOUNDATION';
    }
    return item.source || 'News';
  };
  
  // Get X username and name for display
  const getXUserInfo = () => {
    if (isXPost && item.info) {
      // If we have username and name from the item info, use that first
      if (item.info.username && item.info.name) {
        return `${item.info.name} (@${item.info.username})`;
      }
      
      // Try to extract from title for Tree format
      if (item.title) {
        // Try to extract "Username (@handle):" pattern
        const matchHandle = item.title.match(/^([^:]+?)\s*\(@([^)]+)\)\s*:/);
        if (matchHandle && matchHandle.length > 2) {
          return `${matchHandle[1].trim()} (@${matchHandle[2].trim()})`;
        }
        
        // Try simpler "Username:" pattern
        const matchSimple = item.title.match(/^([^:]+?):/);
        if (matchSimple && matchSimple.length > 1) {
          return matchSimple[1].trim();
        }
      }
    }
    return null;
  };
  
  // Check if this item matched a filter keyword
  const hasKeywordMatch = item.matchedKeyword !== undefined;
  
  // Get the source logo
  const getSourceLogo = () => {
    if (item.newsSource === 'phoenix') {
      return 'https://phoenixnews.io/static/media/phoenixnews_io.ea89d541ed48f1414075.png';
    }
    return 'https://news.treeofalpha.com/static/images/community.png';
  };
  
  // Decode HTML entities in text
  const decodedTitle = item.title ? decodeHtmlEntities(item.title) : '';
  const decodedBody = item.body ? decodeHtmlEntities(item.body) : '';
  
  // Process quoted content for X posts
  const getQuotedContent = () => {
    if (isXPost && item.info?.isQuote && item.info.quotedUser?.text) {
      return decodeHtmlEntities(item.info.quotedUser.text);
    }
    return null;
  };
  
  const quotedContent = getQuotedContent();
  
  // Handle image loading error
  const handleImageError = (imageType: string) => {
    console.warn(`Failed to load ${imageType} image for news item:`, item._id);
  };
  
  return (
    <Pressable 
      style={[
        styles.container, 
        item.isHighlighted ? styles.highlightedContainer : {},
        hasKeywordMatch ? styles.filteredContainer : {}
      ]}
      onPress={onPress || handleOpenUrl}
    >
      <View style={styles.content}>
        {/* Header with title and date */}
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            {hasKeywordMatch && (
              <Bell size={16} color={Colors.dark.accent} style={styles.bellIcon} />
            )}
            <Text style={styles.title}>{decodedTitle}</Text>
          </View>
          <View style={styles.timeContainer}>
            <Text style={styles.time}>{formatTime(item.time)}</Text>
            <Text style={styles.date}>{formatDate(item.time)}</Text>
          </View>
        </View>
        
        {/* Keyword match indicator */}
        {hasKeywordMatch && (
          <View style={styles.keywordMatchContainer}>
            <Text style={styles.keywordMatchText}>
              Matched filter: <Text style={styles.keywordHighlight}>{item.matchedKeyword}</Text>
            </Text>
          </View>
        )}
        
        {/* X user info */}
        {isXPost && getXUserInfo() && (
          <View style={styles.xUserContainer}>
            {item.icon && (
              <Image 
                source={{ uri: item.icon }}
                style={styles.xUserIcon}
                contentFit="cover"
                onError={() => handleImageError('user icon')}
              />
            )}
            <Text style={styles.xUserText}>{getXUserInfo()}</Text>
          </View>
        )}
        
        {/* Body text for non-X posts or X posts with body */}
        {decodedBody ? (
          <Text style={styles.bodyText}>{decodedBody}</Text>
        ) : null}
        
        {/* Image for X posts */}
        {isXPost && item.image && (
          <Image 
            source={{ uri: item.image }}
            style={styles.xImage}
            contentFit="cover"
            onError={() => handleImageError('post')}
          />
        )}
        
        {/* X quoted content */}
        {isXPost && item.info?.isQuote && item.info.quotedUser && quotedContent && (
          <View style={styles.quotedContent}>
            {item.info.quotedUser.name && (
              <View style={styles.quotedUserInfo}>
                {item.info.quotedUser.icon && (
                  <Image 
                    source={{ uri: item.info.quotedUser.icon }}
                    style={styles.quotedUserIcon}
                    contentFit="cover"
                    onError={() => handleImageError('quoted user icon')}
                  />
                )}
                <Text style={styles.quotedUserName}>
                  {item.info.quotedUser.name}
                  {item.info.quotedUser.screen_name && (
                    <Text style={styles.quotedUserHandle}> (@{item.info.quotedUser.screen_name})</Text>
                  )}
                </Text>
              </View>
            )}
            <Text style={styles.quotedText}>{quotedContent}</Text>
            {item.info.quotedUser.image && (
              <Image 
                source={{ uri: item.info.quotedUser.image }}
                style={styles.quotedImage}
                contentFit="cover"
                onError={() => handleImageError('quoted image')}
              />
            )}
          </View>
        )}
        
        {/* Footer with category and ticker */}
        <View style={styles.footer}>
          <View style={styles.categoryContainer}>
            {/* Source logo */}
            <Image 
              source={{ uri: getSourceLogo() }}
              style={styles.sourceLogo}
              contentFit="contain"
              onError={() => handleImageError('source logo')}
            />
            
            <Text style={styles.category}>{getCategoryText()}</Text>
            
            {item.url && (
              <Pressable onPress={handleOpenUrl} style={styles.linkIcon}>
                <ExternalLink size={14} color={Colors.dark.secondaryText} />
              </Pressable>
            )}
          </View>
          
          {mainCoin && (
            <View style={styles.tickerContainer}>
              <View style={styles.tickerWrapper}>
                <Text style={styles.ticker}>{mainCoin}</Text>
              </View>
              
              {priceChange !== null && (
                <View style={[
                  styles.priceChangeWrapper,
                  isNegative ? styles.negativeChange : {},
                  isPositive ? styles.positiveChange : {}
                ]}>
                  <Text style={[
                    styles.priceChange,
                    isNegative ? styles.negativeText : {},
                    isPositive ? styles.positiveText : {}
                  ]}>
                    {isNegative ? '' : '+'}
                    {priceChange.toFixed(2)}%
                  </Text>
                  {isNegative ? (
                    <ChevronDown size={16} color={Colors.dark.negative} />
                  ) : (
                    <ChevronUp size={16} color={Colors.dark.accent} />
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  highlightedContainer: {
    borderColor: Colors.dark.goldBorder,
    backgroundColor: Colors.dark.goldBackground,
  },
  filteredContainer: {
    borderColor: Colors.dark.accent,
    borderWidth: 2,
    backgroundColor: 'rgba(0, 200, 83, 0.05)',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 8,
  },
  bellIcon: {
    marginRight: 6,
    marginTop: 2,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  bodyText: {
    color: Colors.dark.text,
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  time: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  date: {
    color: Colors.dark.secondaryText,
    fontSize: 12,
  },
  keywordMatchContainer: {
    backgroundColor: 'rgba(0, 200, 83, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  keywordMatchText: {
    color: Colors.dark.text,
    fontSize: 12,
  },
  keywordHighlight: {
    fontWeight: 'bold',
    color: Colors.dark.accent,
  },
  xUserContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  xUserIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  xUserText: {
    color: Colors.dark.secondaryText,
    fontSize: 14,
    fontWeight: 'bold',
  },
  xImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 12,
  },
  quotedContent: {
    backgroundColor: Colors.dark.highlight,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  quotedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotedUserIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
  },
  quotedUserName: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  quotedUserHandle: {
    color: Colors.dark.secondaryText,
    fontWeight: 'normal',
  },
  quotedText: {
    color: Colors.dark.text,
    fontSize: 14,
    marginBottom: 8,
  },
  quotedImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceLogo: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
  twitterIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  category: {
    color: Colors.dark.secondaryText,
    fontSize: 14,
  },
  linkIcon: {
    marginLeft: 8,
  },
  tickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerWrapper: {
    backgroundColor: Colors.dark.highlight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  ticker: {
    color: Colors.dark.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  priceChangeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  negativeChange: {
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
  },
  positiveChange: {
    backgroundColor: 'rgba(0, 200, 83, 0.1)',
  },
  priceChange: {
    fontWeight: 'bold',
    fontSize: 14,
    marginRight: 2,
  },
  negativeText: {
    color: Colors.dark.negative,
  },
  positiveText: {
    color: Colors.dark.accent,
  },
});