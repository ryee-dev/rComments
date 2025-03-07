import { _request } from "./Request";

export class UserContext {
  static singleton: UserContext | undefined;

  modhash: string;
  _prefersNightmode: boolean;
  _prefersNewTab: boolean;
  _usesNewStyles: boolean;
  
  // Cache for expensive computations
  private static _bodyColorCache: { color: string, isDark: boolean } | null = null;

  /**
   * Gets the singleton instance of UserContext
   */
  static get(): UserContext {
    this.init();
    return this.singleton;
  }

  /**
   * Initializes the UserContext singleton if not already created
   */
  static init(): void {
    if (this.singleton) {
      return;
    }
    
    // Create the singleton with defaults
    this.singleton = new UserContext(
      "",
      isNewStyle(),
      extractNightModeFromStyles(),
      prefersOpenLinksInNewTab()
    );
    
    // Fetch user data asynchronously and update
    getData().then((response) => {
      const modhash = response?.data?.modhash;
      if (modhash) {
        this.singleton.modhash = modhash;
        const dataPrefersNightMode = response.data.pref_nightmode || false;
        this.singleton._prefersNightmode =
          dataPrefersNightMode || this.singleton._prefersNightmode;
      }
    }).catch((error) => {
      // Silently handle errors - we'll just use the defaults
      console.warn('Failed to fetch user data:', error);
    });
  }

  constructor(
    modhash: string,
    usesNewStyles: boolean,
    prefersNightMode: boolean,
    prefersNewTabs: boolean
  ) {
    this.modhash = modhash;
    this._usesNewStyles = usesNewStyles;
    this._prefersNewTab = prefersNewTabs;
    this._prefersNightmode = prefersNightMode;
  }

  /**
   * Checks if the user is logged in
   */
  isLoggedIn(): boolean {
    return this.modhash !== "";
  }

  /**
   * Determines if night mode is active
   */
  isNightMode(): boolean {
    return this._prefersNightmode;
  }

  /**
   * Checks if the user prefers to open links in new tabs
   */
  prefersNewTabs(): boolean {
    return this._prefersNewTab;
  }

  /**
   * Checks if the user is using the new Reddit styles
   */
  usesNewStyles(): boolean {
    return this._usesNewStyles;
  }
}

/**
 * Fetches user data from Reddit API
 */
async function getData() {
  return _request<null, any>("/api/me.json");
}

/**
 * Determines if the user prefers to open links in new tabs
 */
function prefersOpenLinksInNewTab(): boolean {
  try {
    // @ts-ignore
    if (window.config) {
      // @ts-ignore
      return /('|")new_window('|")\s?:\s?true/.test(window.config.innerHTM);
    }
  } catch (error) {
    // Silently handle errors - default to false
  }
  return false;
}

/**
 * Extracts night mode preference from styles
 */
function extractNightModeFromStyles(): boolean {
  try {
    // Check if we have a cached result
    if (UserContext._bodyColorCache) {
      return UserContext._bodyColorCache.isDark;
    }
    
    const body = document.querySelector("body");
    if (!body) return false;
    
    const bodyStyle = window.getComputedStyle(body);
    const colorValue = bodyStyle
      .getPropertyValue("--newCommunityTheme-body")
      .trim();
      
    if (!colorValue || !colorValue.startsWith("#")) {
      return false;
    }
    
    const isDarkValue = isDark(colorValue);
    
    // Cache the result
    UserContext._bodyColorCache = {
      color: colorValue,
      isDark: isDarkValue
    };
    
    return isDarkValue;
  } catch (error) {
    // Silently handle errors - default to false
    return false;
  }
}

/**
 * Determines if a color is dark based on its RGB values
 */
function isDark(color): boolean {
  // Variables for red, green, blue values
  let r, g, b, hsp;

  // Check the format of the color, HEX or RGB?
  if (color.match(/^rgb/)) {
    // If RGB --> extract the individual RGB values
    // Get the individual components by regex
    const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);
    r = parseInt(rgb[1], 10);
    g = parseInt(rgb[2], 10);
    b = parseInt(rgb[3], 10);
  } else {
    // If hex --> Convert it to RGB
    const hex = color.replace("#", "");
    
    // Convert 3-character format to 6-character format if needed
    const fullHex = hex.length === 3 
      ? hex.split('').map(c => c + c).join('')
      : hex;
      
    r = parseInt(fullHex.substr(0, 2), 16);
    g = parseInt(fullHex.substr(2, 2), 16);
    b = parseInt(fullHex.substr(4, 2), 16);
  }

  // Calculate the brightness using the HSP color model
  // HSP equation from http://alienryderflex.com/hsp.html
  hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));

  // Return true if the color is dark
  return hsp <= 127.5;
}

/**
 * Determines if new Reddit style is being used
 */
export function isNewStyle(): boolean {
  return !!document.querySelector("shreddit-app") || !!document.querySelector("#SHORTCUT_FOCUSABLE_DIV");
}
