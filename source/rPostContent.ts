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
    sort: "top"
  };

  const rPostContentView = {
    _popup: null,
    hideTimeout: null,

    show(el: HTMLElement, postData: any) {
      console.log('Showing popup with data:', postData);
      const popup = this.popup(el);
      const contentHtml = this.generatePostContentHtml(postData);
      const contentDiv = popup.querySelector(`.${DOM.classed("content")}`);
      console.log('Content div found:', contentDiv);
      contentDiv.innerHTML = contentHtml;
      
      // Force layout recalculation
      popup.style.opacity = '0';
      popup.style.display = "block";
      
      // Log popup dimensions and position
      const rect = popup.getBoundingClientRect();
      console.log('Popup dimensions:', {
        width: rect.width,
        height: rect.height,
        top: popup.style.top,
        left: popup.style.left,
        display: popup.style.display,
        zIndex: popup.style.zIndex
      });
      
      popup.style.opacity = '1';

      // Reset state
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    },

    generatePostContentHtml(postData: any): string {
      const { content, title, author, score, subreddit } = postData;
      console.log('Generating HTML with:', { title, author, subreddit });

      // Helper function to safely escape HTML
      const escapeHtml = (unsafe: string): string => {
        if (!unsafe) return '';
        return unsafe
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      // Format the content with proper link handling
      const formatContent = (text: string): string => {
        if (!text) return '';
        
        // Escape the text first
        let formatted = escapeHtml(text);
        
        // Convert URLs to clickable links
        formatted = formatted.replace(
          /(https?:\/\/[^\s<]+)/g,
          '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Convert line breaks and preserve whitespace
        formatted = formatted
          .replace(/\n/g, '<br>')
          .replace(/\s{2,}/g, match => '&nbsp;'.repeat(match.length));

        // Special handling for video content
        if (formatted.startsWith('[Video]')) {
          const videoUrl = formatted.replace('[Video] ', '');
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
            Posted by u/${escapeHtml(author)} in ${escapeHtml(subreddit)} • ${score || '0'} points
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
        console.log('Creating new popup element');
        const popup = window.document.createElement("div");
        const contentDiv = window.document.createElement("div");
        contentDiv.className = DOM.classed("content");
        popup.classList.add(R_POST_CONTENT_CLASS);

        if (UserContext.get().usesNewStyles()) {
          popup.classList.add(R_POST_CONTENT_NEW_REDDIT_STYLE);
        }

        // Ensure popup is visible with base styles
        popup.style.zIndex = "10200000";
        popup.style.position = "fixed";
        popup.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
        popup.style.transition = "opacity 0.2s ease-in-out";
        popup.style.width = "600px";  // Set a default width
        popup.style.maxHeight = "400px";
        popup.style.overflowY = "auto";
        popup.style.border = "1px solid rgba(0, 0, 0, 0.1)";
        popup.style.borderRadius = "4px";
        popup.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
        popup.style.padding = "16px";

        popup.style.display = "none";
        popup.appendChild(contentDiv);
        window.document.body.appendChild(popup);
        this._popup = popup;
        
        console.log('Popup element created:', popup);
      }
      return this._popup;
    },

    popup(el: HTMLElement) {
      const popup = this.getPopup();
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Calculate position relative to viewport
      let top = rect.bottom;
      let left = rect.left;
      
      // Ensure popup stays within viewport
      const popupWidth = 600; // Match the width we set in getPopup
      const popupHeight = Math.min(400, viewportHeight * 0.8); // Max height of 400px or 80% of viewport
      
      // Adjust horizontal position if it would go off-screen
      if (left + popupWidth > viewportWidth) {
        left = Math.max(0, viewportWidth - popupWidth - 20); // 20px padding from right edge
      }
      
      // Adjust vertical position if it would go off-screen
      if (top + popupHeight > viewportHeight) {
        // Position above the element if there's more space there
        if (rect.top > viewportHeight - rect.bottom) {
          top = Math.max(0, rect.top - popupHeight);
        } else {
          // Otherwise, position at bottom of viewport with padding
          top = viewportHeight - popupHeight - 20;
        }
      }
      
      console.log('Positioning popup at:', { 
        top,
        left,
        elementRect: rect,
        viewportHeight,
        viewportWidth
      });
      
      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;

      return popup;
    },

    hidePopup() {
      if (this._popup) {
        console.log('Hiding popup');
        this._popup.style.display = "none";
      }
    },

    hidePopupSoon() {
      if (this.hideTimeout) return;
      console.log('Scheduling popup hide');
      this.hideTimeout = window.setTimeout(() => {
        this.hidePopup();
        this.hideTimeout = null;
      }, 500);
    },

    loading(el: HTMLElement) {
      console.log('Showing loading state');
      this.show(el, {
        content: '<div class="_rpost_content_loading">Loading...</div>',
        title: "Loading...",
        author: "",
        score: "",
        subreddit: "",
      });
    },

    handleError(el: HTMLElement, error: string) {
      console.error('Error loading post content:', error);
      this.show(el, {
        content: `<div class="_rpost_content_error">${error}</div>`,
        title: "Error",
        author: "",
        score: "",
        subreddit: "",
      });
    },

    getPostUrl(element: HTMLElement): string | null {
      // Try to find the post URL in various ways
      const postContainer = element.closest('shreddit-post');
      if (!postContainer) return null;

      // First try: look for the direct link in slot="text-body" or slot="full-post-link"
      const postLink = postContainer.querySelector('a[slot="text-body"], a[slot="full-post-link"]');
      if (postLink && postLink.getAttribute('href')) {
        return postLink.getAttribute('href');
      }

      // Second try: look for any comment link
      const commentLink = postContainer.querySelector('a[href*="/comments/"]');
      if (commentLink && commentLink.getAttribute('href')) {
        return commentLink.getAttribute('href');
      }

      return null;
    },

    init() {
      console.log('Initializing rPostContent');
      // Handle mouse events for post titles and content
      document.addEventListener("mouseover", async (e) => {
        const target = e.target as HTMLElement;
        
        // Check if we're hovering over a post title or content area
        const isPostContent = target.matches('a[slot="text-body"], a[slot="full-post-link"]') || 
                            target.closest('a[slot="text-body"], a[slot="full-post-link"]') ||
                            target.matches('shreddit-post [slot="text-body"], shreddit-post [slot="full-post-link"]') ||
                            target.closest('shreddit-post [slot="text-body"], shreddit-post [slot="full-post-link"]');
        
        console.log('Mouseover event:', {
          target: target.tagName,
          isPostContent,
          slot: target.getAttribute('slot'),
          href: target instanceof HTMLAnchorElement ? target.href : null,
          parentElement: target.parentElement?.tagName
        });
        
        if (isPostContent) {
          const postUrl = this.getPostUrl(target);
          console.log('Found post URL:', postUrl);
          
          if (postUrl) {
            this.loading(target);
            try {
              const jsonUrl = postUrl + ".json";
              console.log('Fetching post content from:', jsonUrl);
              const content = await getPostContent({
                url: jsonUrl,
                data: DEFAULT_REQUEST_PARAMS
              });
              this.show(target, content);
            } catch (error) {
              this.handleError(target, error.message);
            }
          }
        }
      });

      document.addEventListener("mouseout", (e) => {
        const target = e.target as HTMLElement;
        const isPostContent = target.matches('a[slot="text-body"], a[slot="full-post-link"]') || 
                            target.closest('a[slot="text-body"], a[slot="full-post-link"]') ||
                            target.matches('shreddit-post [slot="text-body"], shreddit-post [slot="full-post-link"]') ||
                            target.closest('shreddit-post [slot="text-body"], shreddit-post [slot="full-post-link"]');
        
        if (isPostContent) {
          console.log('Mouse out from post content area');
          this.hidePopupSoon();
        }
      });

      // Handle mouse events on the popup itself
      this.getPopup().addEventListener("mouseenter", () => {
        console.log('Mouse entered popup');
        if (this.hideTimeout) {
          window.clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
      });

      this.getPopup().addEventListener("mouseleave", () => {
        console.log('Mouse left popup');
        this.hidePopupSoon();
      });
    },
  };

  // Initialize the post content hover functionality
  rPostContentView.init();
})(window); 