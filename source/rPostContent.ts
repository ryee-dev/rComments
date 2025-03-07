import { getPostContent } from "./data-fetchers/postContentFetcher";
import * as DOM from "./dom/DOM";
import { RequestParams } from "./types/types";
import { UserContext } from "./UserContext";

UserContext.init();

/* eslint-disable no-console */

((window) => {
  const R_POST_CONTENT_CLASS = "_rpost_content_div";
  const R_POST_CONTENT_NEW_REDDIT_STYLE = "_rpost_content_new_reddit_styles";

  const DEFAULT_REQUEST_PARAMS: RequestParams = {
    commentIndex: 0,
    depth: 0,
    limit: 1,
    sort: "top",
  };

  const rPostContentView = {
    _popup: null,
    hideTimeout: null,
    _initialized: false,

    show(el: HTMLElement, postData: any) {
      const popup = this.popup(el);
      const contentHtml = this.generatePostContentHtml(postData);
      const contentDiv = popup.querySelector(`.${DOM.classed("content")}`);
      contentDiv.innerHTML = contentHtml;

      // Force layout recalculation
      popup.style.opacity = "0";
      popup.style.display = "block";

      popup.style.opacity = "1";

      // Reset state
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    },

    generatePostContentHtml(postData: any): string {
      const { title, author, subreddit, content, score } = postData;

      // Helper function to safely escape HTML
      const escapeHtml = (unsafe: string): string => {
        if (!unsafe) return "";
        return unsafe
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      // Format the content with proper link handling
      const formatContent = (text: string): string => {
        if (!text) return "";

        // Escape the text first
        let formatted = escapeHtml(text);

        // Convert URLs to clickable links
        formatted = formatted.replace(
          /(https?:\/\/[^\s<]+)/g,
          '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // Convert line breaks and preserve whitespace
        formatted = formatted
          .replace(/\n/g, "<br>")
          .replace(/\s{2,}/g, (match) => "&nbsp;".repeat(match.length));

        // Special handling for video content
        if (formatted.startsWith("[Video]")) {
          const videoUrl = formatted.replace("[Video] ", "");
          return `<div class="_rpost_content_video">
            <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">View Video</a>
          </div>`;
        }

        return formatted;
      };

      return `
        <div class="_rpost_content_header">
          <h3 class="_rpost_content_title">${escapeHtml(title)}</h3>
          <div class="_rpost_content_meta">
            Posted by u/${escapeHtml(author)} in ${escapeHtml(subreddit)} • ${
        score || "0"
      } points
          </div>
        </div>
        <div class="_rpost_content_body">
          ${formatContent(content)}
        </div>
      `;
    },

    hasAlreadyBuiltPopup() {
      return !!this._popup;
    },

    getPopup() {
      if (!this._popup) {
        const popup = window.document.createElement("div");
        const headerDiv = window.document.createElement("div");
        const titleDiv = window.document.createElement("div");
        const contentDiv = window.document.createElement("div");
        const closeButton = window.document.createElement("button");
        
        // Set up header with title
        headerDiv.className = DOM.classed("header");
        titleDiv.className = DOM.classed("title");
        titleDiv.textContent = "Post Content Preview";
        headerDiv.appendChild(titleDiv);
        
        // Set up close button
        closeButton.className = DOM.classed("close-button");
        closeButton.textContent = "×";
        closeButton.setAttribute("aria-label", "Close post content preview");
        closeButton.style.position = "absolute";
        closeButton.style.right = "10px";
        closeButton.style.top = "10px";
        closeButton.style.background = "none";
        closeButton.style.border = "none";
        closeButton.style.fontSize = "20px";
        closeButton.style.cursor = "pointer";
        closeButton.style.color = "#666";
        closeButton.addEventListener("click", () => this.hidePopup());
        
        // Set up content area
        contentDiv.className = DOM.classed("content");
        
        // Add classes to popup
        popup.classList.add(R_POST_CONTENT_CLASS);

        if (UserContext.get().usesNewStyles()) {
          popup.classList.add(R_POST_CONTENT_NEW_REDDIT_STYLE);
        }

        // Create a unique ID for the title
        const titleId = "rpost-content-title";
        titleDiv.id = titleId;

        // Add proper ARIA attributes for accessibility
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-labelledby", titleId);
        popup.setAttribute("tabindex", "-1");

        // Ensure popup is visible with base styles
        popup.style.zIndex = "10200000";
        popup.style.position = "fixed";
        popup.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
        popup.style.transition = "opacity 0.2s ease-in-out";
        popup.style.width = "600px"; // Set a default width
        popup.style.height = "auto";
        popup.style.maxHeight = "80%";
        popup.style.minHeight = "200px";
        popup.style.overflowY = "auto";
        popup.style.border = "1px solid rgba(0, 0, 0, 0.1)";
        popup.style.borderRadius = "4px";
        popup.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
        popup.style.padding = "12px";

        popup.style.display = "none";
        
        // Append elements to popup
        popup.appendChild(headerDiv);
        popup.appendChild(closeButton);
        popup.appendChild(contentDiv);
        
        window.document.body.appendChild(popup);
        this._popup = popup;
        
        // Add keyboard event listener for Escape key
        popup.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            this.hidePopup();
          }
        });
      }
      return this._popup;
    },

    popup(el: HTMLElement) {
      const popup = this.getPopup();
      
      // Get viewport dimensions
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Get popup dimensions
      const popupWidth = 600; // This should match the width in getPopup()
      const popupHeight = Math.min(windowHeight * 0.8, 800); // Approximate height
      
      // Calculate center position
      const left = Math.max(0, (windowWidth - popupWidth) / 2);
      const top = Math.max(0, (windowHeight - popupHeight) / 2);
      
      // Position the popup in the center of the screen
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.display = "block";
      
      const contentDiv = popup.querySelector(`.${DOM.classed('content')}`);
      if (contentDiv) {
        contentDiv.innerHTML = this.loadingHtml();
      }
      
      // Focus the popup for accessibility
      popup.focus();
      
      return popup;
    },

    hidePopup() {
      if (this._popup) {
        this._popup.style.display = "none";
      }
    },

    hidePopupSoon() {
      this.hideTimeout = window.setTimeout(() => {
        this.hidePopup();
        this.hideTimeout = null;
      }, 500);
    },

    loading(el: HTMLElement) {
      this.show(el, {
        content: '<div class="_rpost_content_loading">Loading...</div>',
        title: "Loading...",
        author: "",
        score: "",
        subreddit: "",
      });
    },

    handleError(el: HTMLElement, error: string) {
      this.show(el, {
        content: `<div class="_rpost_content_error">${error}</div>`,
        title: "Error",
        author: "",
        score: "",
        subreddit: "",
      });
    },

    getPostUrl(element: HTMLElement): string | null {
      try {
        // First, try to find post URL from the share button itself
        const shareButton = element.closest('[data-post-click-location="share"]');
        if (shareButton) {
          
          // Try to find the post container
          const postContainer = shareButton.closest('shreddit-post') ||
            shareButton.closest('.thing') ||
            shareButton.closest('article');
          
          if (postContainer) {
            // 1. Try to extract from permalink
            const permalink = postContainer.querySelector('a.permalink');
            if (permalink && permalink.getAttribute('href')) {
              return this.normalizeUrl(permalink.getAttribute('href'));
            }
            
            // 2. Try to extract from the share button's data attributes
            const faceplate = element.getAttribute('data-faceplate-tracking-context');
            if (faceplate) {
              try {
                const data = JSON.parse(faceplate);
                if (data && data.location && data.location.pathname) {
                  return this.normalizeUrl(data.location.pathname);
                }
              } catch (e) {
                // Error silently handled
              }
            }
          }
        }
        
        // Fall back to checking for any parent element with a post link
        const postContainer = element.closest('shreddit-post') || 
                            element.closest('.thing') || 
                            element.closest('article');
                            
        if (postContainer) {
          const postLink = postContainer.querySelector('a[href*="/comments/"]');
          if (postLink && postLink instanceof HTMLAnchorElement) {
            return this.normalizeUrl(postLink.href);
          }
        }
        
        return null;
      } catch (e) {
        return null;
      }
    },

    normalizeUrl(url: string | null): string | null {
      if (!url) return null;
      
      // If it's a relative URL, make it absolute
      if (url.startsWith('/')) {
        return `https://www.reddit.com${url}`;
      }
      
      // If it's already a full URL, ensure it's a reddit.com URL
      if (url.includes('reddit.com')) {
        return url;
      }
      
      // If it's just a post ID or something else, construct a proper URL
      if (url.includes('/comments/')) {
        return `https://www.reddit.com${url}`;
      }
      
      return null;
    },

    init() {
      // Ensure we only initialize once
      if (this._initialized) return;
      this._initialized = true;

      // Add CSS for our custom styling
      const style = document.createElement('style');
      style.textContent = `
        /* Style for share buttons to indicate they have hover functionality */
        [data-post-click-location="share"],
        [slot="share-button"],
        .share,
        button.share-button,
        .share-button,
        [data-click-id="share"] {
          cursor: pointer !important;
          position: relative;
        }
        
        [data-post-click-location="share"]:hover,
        [slot="share-button"]:hover,
        .share:hover,
        button.share-button:hover,
        .share-button:hover,
        [data-click-id="share"]:hover {
          background-color: rgba(0, 121, 211, 0.1);
        }
        
        /* Remove any leftover pulse animation from previous implementation */
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 121, 211, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(0, 121, 211, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 121, 211, 0); }
        }
      `;
      document.head.appendChild(style);

      // Function to add hover handlers to share buttons
      const addShareButtonHandlers = () => {
        // Find all share buttons on the page
        const shareButtons = document.querySelectorAll(
          '[data-post-click-location="share"], [slot="share-button"], .share, button.share-button, .share-button, [data-click-id="share"]'
        );
        
        shareButtons.forEach((button, index) => {
          // Skip if already has our handler
          if (button.hasAttribute('data-rpostcontent-handled')) {
            return;
          }
          
          // Mark as handled
          button.setAttribute('data-rpostcontent-handled', 'true');
          
          // Add mouseover handler
          button.addEventListener('mouseover', (e) => {
            e.stopPropagation();
            
            // Get the post URL
            const postUrl = this.getPostUrl(button as HTMLElement);
            if (!postUrl) {
              return;
            }
            
            // Show popup
            this.popup(button as HTMLElement);
            
            // Fetch and show content
            getPostContent({
              url: postUrl,
              data: DEFAULT_REQUEST_PARAMS
            })
              .then((postData) => {
                this.show(button as HTMLElement, postData);
              })
              .catch((error) => {
                this.handleError(button as HTMLElement, 'Error loading post content.');
              });
          });
          
          // Add mouseout handler
          button.addEventListener('mouseout', (e: MouseEvent) => {
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (this._popup && (!relatedTarget || !this._popup.contains(relatedTarget))) {
              this.hidePopupSoon();
            }
          });
          
          // Prevent default click behavior but allow propagation for Reddit's own handlers
          button.addEventListener('click', (e) => {
            e.stopPropagation();
          }, true);
        });
      };
      
      // Run immediately
      addShareButtonHandlers();
      
      // And set up an interval to catch dynamically added share buttons
      setInterval(addShareButtonHandlers, 1000);
      
      // Handle popup mouse events
      document.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        if (this._popup && (this._popup === target || this._popup.contains(target))) {
          clearTimeout(this.hideTimeout);
        }
      });
      
      document.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;
        
        if (this._popup && 
            (this._popup === target || this._popup.contains(target)) && 
            (!relatedTarget || !this._popup.contains(relatedTarget))) {
          this.hidePopupSoon();
        }
      });
    },

    loadingHtml() {
      return `
        <div class="${DOM.classed('loading')}">
          <div style="text-align: center; padding: 20px;">
            <div style="margin-bottom: 10px;">
              <svg width="38" height="38" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg" stroke="#ff4500">
                <g fill="none" fill-rule="evenodd">
                  <g transform="translate(1 1)" stroke-width="2">
                    <circle stroke-opacity=".5" cx="18" cy="18" r="18"/>
                    <path d="M36 18c0-9.94-8.06-18-18-18">
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 18 18"
                        to="360 18 18"
                        dur="1s"
                        repeatCount="indefinite"/>
                    </path>
                  </g>
                </g>
              </svg>
            </div>
            <div>Loading post content...</div>
          </div>
        </div>
      `;
    },
  };

  // Initialize the post content hover functionality
  rPostContentView.init();

  // Immediate execution script to handle share buttons
  (function() {
    // Create and inject a style element for share buttons
    const shareButtonStyle = document.createElement('style');
    shareButtonStyle.textContent = `
      /* Style share buttons to indicate hover functionality */
      shreddit-post-share-button[data-post-click-location="share"],
      [slot="share-button"] > *[data-post-click-location="share"] {
        cursor: pointer !important;
        position: relative;
      }
      
      shreddit-post-share-button[data-post-click-location="share"]:hover,
      [slot="share-button"] > *[data-post-click-location="share"]:hover {
        background-color: rgba(0, 121, 211, 0.1);
      }
    `;
    document.head.appendChild(shareButtonStyle);
    
    // Function to handle a share button
    const handleShareButton = (button: Element) => {
      // Skip if already handled
      if (button.hasAttribute('data-rpostcontent-handled')) {
        return;
      }
      
      // Mark as handled
      button.setAttribute('data-rpostcontent-handled', 'true');
      
      // Create an overlay div that will capture events
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        z-index: 999999;
      `;
      
      // Make sure parent is positioned
      const buttonParent = button.parentElement;
      if (buttonParent && window.getComputedStyle(buttonParent).position === 'static') {
        buttonParent.style.position = 'relative';
      }
      
      // Add hover handlers to the overlay
      overlay.addEventListener('mouseover', (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent event from bubbling to comments handler
        
        const postUrl = rPostContentView.getPostUrl(button as HTMLElement);
        if (!postUrl) return;
        
        rPostContentView.popup(button as HTMLElement);
        getPostContent({
          url: postUrl,
          data: DEFAULT_REQUEST_PARAMS
        })
          .then((postData) => {
            rPostContentView.show(button as HTMLElement, postData);
          })
          .catch((error) => {
            rPostContentView.handleError(button as HTMLElement, 'Error loading post content.');
          });
      });
      
      overlay.addEventListener('mouseout', (e: MouseEvent) => {
        e.stopPropagation(); // Prevent event from bubbling to comments handler
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (rPostContentView._popup && (!relatedTarget || !rPostContentView._popup.contains(relatedTarget))) {
          rPostContentView.hidePopupSoon();
        }
      });
      
      // Prevent default share behavior and stop event propagation
      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      }, true);
      
      // Add the overlay
      buttonParent?.appendChild(overlay);
    };
    
    // Create a MutationObserver to handle share buttons
    const observer = new MutationObserver((mutations) => {
      // Find all share buttons, including those inside slots
      const shareButtons = new Set<Element>();
      
      // Direct share buttons
      document.querySelectorAll('shreddit-post-share-button[data-post-click-location="share"]')
        .forEach(button => shareButtons.add(button));
      
      // Share buttons inside slots
      document.querySelectorAll('[slot="share-button"]').forEach(slot => {
        const shareButton = slot.querySelector('*[data-post-click-location="share"]');
        if (shareButton) {
          shareButtons.add(shareButton);
        }
      });
      
      // Handle each share button
      shareButtons.forEach(handleShareButton);
    });
    
    // Start observing
    observer.observe(document.documentElement, { 
      childList: true, 
      subtree: true,
      attributes: true
    });
    
    // Run immediately for any existing share buttons
    observer.takeRecords();
    observer.disconnect();
    observer.observe(document.documentElement, { 
      childList: true, 
      subtree: true,
      attributes: true
    });
  })();

})(window);
