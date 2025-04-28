// Helper functions for text processing

/**
 * Decodes HTML entities in a string
 * Handles common entities like &gt; &lt; &amp; &quot; &apos; and many more
 */
export const decodeHtmlEntities = (text: string | undefined): string => {
  if (!text) return '';
  
  // Create a temporary element to use the browser's built-in HTML entity decoding
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      return textarea.value.replace(/\n/g, ' ');
    } catch (e) {
      console.warn('Browser HTML entity decoding failed, using fallback method');
      // Fall through to manual replacement if browser method fails
    }
  }
  
  // Fallback manual replacement for environments without DOM access
  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2B;/g, '+')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&bull;/g, '•')
    .replace(/&hellip;/g, '…')
    .replace(/\n/g, ' '); // Replace newlines with spaces for better display
};

/**
 * Cleans up tweet content by:
 * 1. Removing URLs (http, https, t.co, x.com)
 * 2. Removing quoted content (anything after "Quote [@...")
 * 3. Removing trailing ellipsis
 * 4. Removing RT: prefix
 * 5. Cleaning up excessive whitespace
 */
export const cleanupTweetContent = (text: string): string => {
  if (!text) return '';
  
  // Remove RT: prefix common in retweets
  let cleanedText = text.replace(/^RT:\s*/i, '');
  
  // Remove quoted content (anything after "Quote [@...")
  const quoteIndex = cleanedText.indexOf('Quote [@');
  if (quoteIndex !== -1) {
    cleanedText = cleanedText.substring(0, quoteIndex).trim();
  }
  
  // Remove URLs (http, https, t.co, x.com, twitter.com)
  cleanedText = cleanedText
    // Remove standard URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove t.co links
    .replace(/t\.co\/\S+/g, '')
    // Remove x.com links
    .replace(/x\.com\/\S+/g, '')
    // Remove twitter.com links
    .replace(/twitter\.com\/\S+/g, '')
    // Remove trailing ellipsis
    .replace(/…\s*$/, '')
    // Clean up excessive spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  return cleanedText;
};