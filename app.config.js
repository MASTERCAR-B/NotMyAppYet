// Use process.env to access environment variables
const appEnv = process.env.APP_ENV || 'development';

const baseConfig = {
  name: "Live News Hub",
  slug: "live-news-hub",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "livenewshub",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "app.rork.live-news-hub",
    infoPlist: {
      UIBackgroundModes: [
        "location",
        "fetch",
        "remote-notification",
        "processing"
      ],
      NSLocationWhenInUseUsageDescription: "Live News Hub uses your location to keep the app refreshed with the latest crypto news alerts when you're using it.",
      NSLocationAlwaysAndWhenInUseUsageDescription: "Live News Hub uses your location to deliver real-time crypto alerts even when the app is in the background. Your location data is never stored or shared with third parties.",
      NSLocationAlwaysUsageDescription: "Live News Hub uses your location to deliver real-time crypto alerts even when the app is in the background. Your location data is never stored or shared with third parties.",
      NSUserTrackingUsageDescription: "This app doesn't track you across other apps or websites.",
      NSLocationTemporaryUsageDescriptionDictionary: {
        "LiveNewsBackgroundMode": "Getting real-time updates for your crypto alerts"
      }
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    package: "app.rork.livenewshub",
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "RECEIVE_BOOT_COMPLETED",
      "WAKE_LOCK",
      "FOREGROUND_SERVICE_DATA_SYNC"
    ]
  },
  web: {
    favicon: "./assets/images/favicon.png"
  },
  plugins: [
    "expo-router",
    "expo-localization",
    [
      "expo-build-properties",
      {
        "android": {
          "compileSdkVersion": 33,
          "targetSdkVersion": 33,
          "buildToolsVersion": "33.0.0"
        },
        "ios": {
          "deploymentTarget": "15.1"
        }
      }
    ],
    [
      "expo-task-manager",
      {
        "ios": {
          "minimumOSVersion": "15.1"
        }
      }
    ],
    [
      "expo-background-fetch",
      {
        "ios": {
          "minimumOSVersion": "15.1"
        }
      }
    ],
    [
      "expo-location",
      {
        "locationAlwaysAndWhenInUsePermission": "Live News Hub uses your location in the background to keep you updated with real-time crypto news alerts, even when the app is closed. Your location data is never stored or shared with third parties.",
        "locationAlwaysPermission": "Live News Hub uses your location in the background to keep you updated with real-time crypto news alerts, even when the app is closed. Your location data is never stored or shared with third parties.",
        "locationWhenInUsePermission": "Live News Hub uses your location to keep you updated with real-time crypto news alerts when you're using the app. Your location data is never stored or shared with third parties.",
        "isIosBackgroundLocationEnabled": true,
        "isAndroidBackgroundLocationEnabled": true
      }
    ],
    [
      "expo-notifications",
      {
        "icon": "./assets/images/notification-icon.png",
        "color": "#ffffff",
        "sounds": [
          "./assets/sounds/notification.wav"
        ]
      }
    ]
  ],
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true
  },
  extra: {
    router: {
      origin: false
    },
    eas: {
      projectId: "your-project-id-here"
    },
    appEnv: appEnv,
  },
  owner: "rork"
};

// Environment-specific configurations
const envConfigs = {
  development: {
    name: "Live News Hub (Dev)",
    android: {
      package: "app.rork.livenewshub.dev"
    },
    ios: {
      bundleIdentifier: "app.rork.live-news-hub.dev"
    },
    extra: {
      ...baseConfig.extra,
      apiUrl: "https://dev-api.example.com",
      enableDetailedLogs: true,
    }
  },
  staging: {
    name: "Live News Hub (Staging)",
    android: {
      package: "app.rork.livenewshub.stage"
    },
    ios: {
      bundleIdentifier: "app.rork.live-news-hub.stage"
    },
    extra: {
      ...baseConfig.extra,
      apiUrl: "https://staging-api.example.com",
      enableDetailedLogs: true,
    }
  },
  production: {
    extra: {
      ...baseConfig.extra,
      apiUrl: "https://api.example.com",
      enableDetailedLogs: false,
    }
  }
};

// Merge base config with environment config
const envConfig = envConfigs[appEnv] || envConfigs.development;
const config = { ...baseConfig };

// Deep merge the configs
Object.keys(envConfig).forEach(key => {
  if (typeof envConfig[key] === 'object' && !Array.isArray(envConfig[key]) && envConfig[key] !== null) {
    config[key] = { ...config[key], ...envConfig[key] };
  } else {
    config[key] = envConfig[key];
  }
});

export default config; 