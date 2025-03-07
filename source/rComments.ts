import { getCommentData } from "./data-fetchers/commentFetcher";
import {
    extractCommentData,
    extractListingJson,
} from "./data-fetchers/commentInspector";
import * as DOM from "./dom/DOM";
import { getListingUrlPathElement } from "./dom/dom-accessors";
import {
    applyVote,
    generateCommentHtml,
} from "./html-generators/html_generator";
import {
    handleAAExtractorClick,
    isAALinksTogglerElement,
} from "./post-processing-plugins/aa-video-extractor/aa_video_extractor";
import plugins from "./post-processing-plugins/plugins";
import { _request, RequestOptions } from "./Request";
import Store from "./Store";
import {
    CommentResponseData,
    ExtractedCommentData,
    RequestData,
    RequestParams,
    SuccessfulCommentResponseData,
} from "./types/types";
import { UserContext } from "./UserContext";

UserContext.init();

((window) => {
  const R_COMMENTS_MAIN_CLASS = "_rcomment_div";
  const R_COMMENTS_NEW_REDDIT_STYLE = "_rcomments_new_reddit_styles";
  const NEXT_COMMENT_TEXT = "&#8595 Next Comment";

  const rCommentsView = {
    show(el: HTMLElement, commentHtml: string) {
      let popup;
      if (this.isFirstComment(el)) {
        popup = this.popup(el); // Get or create the popup
        popup.querySelector(`.${DOM.classed("content")}`).innerHTML =
          commentHtml;
        popup.style.display = "block";

        // Reset state
        if (this.hideTimeout) {
          window.clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
      } else {
        const content = el.querySelector("._rcomments_content, .children");
        const loading = content.getElementsByClassName(
          DOM.classed("loading")
        )[0];
        const nthCommentDeep = DOM.getParents(
          content,
          "._rcomments_entry"
        ).length;
        if (loading) {
          loading.parentNode.removeChild(loading);
        }
        if (nthCommentDeep % 2 !== 0) {
          content.classList.add(DOM.classed("comment_odd"));
        }
        content.innerHTML = commentHtml + content.innerHTML;
      }
    },

    appendToComment(commentId: string, html: string): void {
      const commentDiv = this.getCommentDiv(commentId);
      const nextChildren = commentDiv.querySelector(".children");
      nextChildren.innerHTML = html + nextChildren.innerHTML;
    },

    getCommentDiv(commentId: string): HTMLDivElement {
      return this.getPopup().querySelector(`#${commentId}`);
    },

    hasAlreadyBuiltPopup() {
      return !!this._popup;
    },

    getPopup() {
      if (!this._popup) {
        const popup = window.document.createElement("div");
        const nextCommentDiv = window.document.createElement("div");
        const contentDiv = window.document.createElement("div");
        const titleDiv = window.document.createElement("div");
        const closeButton = window.document.createElement("button");
        
        // Set up title
        titleDiv.className = DOM.classed("title");
        titleDiv.textContent = "Comments Preview";
        titleDiv.id = "rcomments-title";
        
        // Set up close button
        closeButton.className = DOM.classed("close-button");
        closeButton.textContent = "×";
        closeButton.setAttribute("aria-label", "Close comments preview");
        closeButton.style.position = "absolute";
        closeButton.style.right = "10px";
        closeButton.style.top = "10px";
        closeButton.style.background = "none";
        closeButton.style.border = "none";
        closeButton.style.fontSize = "20px";
        closeButton.style.cursor = "pointer";
        closeButton.style.color = "#666";
        closeButton.addEventListener("click", () => this.hidePopup());
        
        // Set up next comment div
        nextCommentDiv.className = DOM.classed("next_comment");
        nextCommentDiv.innerHTML = NEXT_COMMENT_TEXT;
        
        // Set up content div
        contentDiv.className = DOM.classed("content");
        
        // Add classes to popup
        popup.classList.add(R_COMMENTS_MAIN_CLASS);

        if (UserContext.get().usesNewStyles()) {
          popup.classList.add(R_COMMENTS_NEW_REDDIT_STYLE);
        }
        
        // Add proper ARIA attributes for accessibility
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-labelledby", "rcomments-title");
        popup.setAttribute("tabindex", "-1");

        popup.style.display = "none";
        popup.appendChild(titleDiv);
        popup.appendChild(closeButton);
        popup.appendChild(nextCommentDiv);
        popup.appendChild(contentDiv);
        window.document.body.appendChild(popup);

        // Track popup state
        this.isPopupVisible = false;
        this.isCursorInsidePopup = false;

        // Improved mouse tracking
        popup.addEventListener("mouseenter", () => {
          this.isCursorInsidePopup = true;
          if (this.hideTimeout) {
            window.clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
          }
        });

        popup.addEventListener("mouseleave", (e) => {
          this.isCursorInsidePopup = false;
          // Only hide if we're not moving to the trigger element
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (!relatedTarget?.closest('a[data-post-click-location="comments-button"]')) {
            this.hidePopupSoon();
          }
        });
        
        // Add keyboard event listener for Escape key
        popup.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            this.hidePopup();
          }
        });

        this._popup = popup;
      }

      return this._popup;
    },

    popup(el) {
      // Check if the event is coming from a share button or related element
      const isShareRelated = (element) => {
        if (!element) return false;
        
        // Check direct attributes
        if (element.getAttribute && element.getAttribute('data-post-click-location') === 'share') {
          return true;
        }
        
        // Check classes
        if (element.classList && 
            (element.classList.contains('share') || 
             element.classList.contains('share-button'))) {
          return true;  
        }
        
        // Check parent too
        if (element.parentElement && isShareRelated(element.parentElement)) {
          return true;
        }
        
        // Check for closest share button
        if (element.closest && 
            (element.closest('[data-post-click-location="share"]') ||
             element.closest('[slot="share-button"]'))) {
          return true;
        }
        
        return false;
      };
      
      // Skip if share related
      if (isShareRelated(el)) {
        return document.createElement('div'); // Return an empty div to prevent errors
      }
      
      const popup = this.getPopup();
      let thing = null;
      
      try {
        thing = typeof this.findClosestThing === 'function' ? this.findClosestThing(el) : null;
      } catch (e) {
        // Silently handle the error
      }
      
      let parentClass;

      if (thing) {
        // If the closest thing is the first comment, it must be a root comment.
        parentClass = thing.classList.contains("sitetable") ? "" : "comment";
      } else {
        // If we can't find a parent thing, use comment as parent class by default.
        parentClass = "comment";
      }

      // Set .comment class for styling, if on a comment page.
      popup.className = `_rcomment_div ${parentClass}`;

      if (UserContext.get().usesNewStyles()) {
        popup.classList.add("_rcomments_new_reddit_styles");
      }
      
      // Position the popup next to the comments button
      const rect = el.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Get popup dimensions
      const popupWidth = 600; // Approximate width
      const popupHeight = Math.min(windowHeight * 0.8, 800); // Approximate height
      
      // Position to the right of the comments button by default
      let left = rect.right + 10;
      let top = rect.top;
      
      // If positioning to the right would push it off-screen, position to the left
      if (left + popupWidth > windowWidth - 20) {
        left = Math.max(20, rect.left - popupWidth - 10);
      }
      
      // Make sure the popup doesn't go off the top or bottom of the screen
      if (top + popupHeight > windowHeight - 20) {
        top = Math.max(20, windowHeight - popupHeight - 20);
      }
      
      // Apply the position
      popup.style.position = "fixed";
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.display = "block";
      
      // Focus the popup for accessibility
      popup.focus();
      
      return popup;
    },

    hidePopup() {
      if (this._popup && !this.isCursorInsidePopup) {
        this._popup.style.display = "none";
        this.isPopupVisible = false;
        this.currentAnchor = null;  // Reset currentAnchor when hiding popup
        this.active = false;  // Reset active state
        
        if (this.hideTimeout) {
          window.clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
      }
    },

    hidePopupSoon() {
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
      }

      this.hideTimeout = window.setTimeout(() => {
        if (!this.isCursorInsidePopup) {
          this.hidePopup();
          this.currentAnchor = null;  // Reset currentAnchor
          this.active = false;  // Reset active state
        }
      }, 300);
    },

    isFirstComment(el) {
      return el.tagName.toLowerCase() === "a";
    },

    loading(el) {
      const isFirst = this.isFirstComment(el);
      const loadingClasses = `${DOM.classed("loading")} ${DOM.classed(
        "comment comment thing"
      )}`;
      const span = "<span>Fetching comment...</span>";
      const loadingContent = `<div class="${loadingClasses}">${span}</div>`;
      if (isFirst) {
        const popup = this.popup(el);
        popup.querySelector(`.${DOM.classed("content")}`).innerHTML =
          loadingContent;
        popup.style.display = "block";
      } else {
        const children = el.querySelector("._rcomments_content, .children");
        if (children) {
          children.innerHTML = loadingContent + children.innerHTML;
        }
      }
    },

    loadContentHtml(el, content) {
      this.popup(el).innerHTML = content;
    },

    contentHtml() {
      return this._popup.innerHTML;
    },

    updateParentComment(el: HTMLElement, isLastReply: boolean) {
      if (!isLastReply) return;

      let container;
      if (
        this.isFirstComment(el) ||
        el.classList.contains(R_COMMENTS_MAIN_CLASS)
      ) {
        // If this is the first comment then we need to toggle the top "Next Comment" button
        // Similarly, if the element is the overall div that signifies we clicked the "Next Comment"
        // button and are rendering the last top-level comment
        container = this._popup.querySelector(
          `.${DOM.classed("next_comment")}`
        );
      } else if (el.classList.contains("entry")) {
        // Otherwise, it's triggered from the "Next Reply" button
        container = el.querySelector(`.${DOM.classed("next_reply")}`);
      } else {
        throw "Unexpected element provided to updateParentComment";
      }

      if (container.classList.contains(DOM.classed("next_comment"))) {
        container.classList.remove(DOM.classed("next_comment"));
        container.classList.add(DOM.classed("next_comment_none"));
        container.innerHTML = "No more Comments";
      } else {
        container.classList.remove(DOM.classed("next_reply"));
        container.classList.add(DOM.classed("no_reply"));
        container.innerHTML = "No More replies";
      }
    },

    handleError(el, error) {
      const errorHtml = `<div class="${DOM.classed("error")}">${error}</div>`;

      if (this.isFirstComment(el)) {
        this.popup(el).querySelector(`.${DOM.classed("content")}`).innerHTML =
          errorHtml;
      } else {
        const node = el.querySelector("._rcomments_content, .children");
        node.innerHTML = errorHtml + node.innerHTML;
        const loading = node.querySelector(`.${DOM.classed("loading")}`);
        if (loading) {
          loading.remove();
        }
      }
    },
  };

  const rCommentsModel = {
    listingCache: {},
    commentStatus: new Store(),
    currentListing: {},

    getRequestData(url: string, commentId: string = null): RequestData {
      const params = this.commentStatus.getNextCommentRequestParameters(
        url,
        commentId
      );
      return {
        url,
        params,
      };
    },

    registerComment(
      url: string,
      data,
      params: RequestParams
    ): ExtractedCommentData | null {
      const listingJson = extractListingJson(data);
      const commentData = extractCommentData(data, params);
      if (commentData === null) return null;
      this.commentStatus.updateRequestParameters(url, params.comment, params);
      this.setCurrentListing(commentData.json.id, listingJson);
      return commentData;
    },

    genKey(url: string, commentId: string | null) {
      url = this.cleanUrl(url);
      return commentId ? url + commentId : url;
    },

    getUrl(commentId) {
      const listing = this.listingCache[commentId];
      return listing ? listing.permalink : this.currentListing.permalink;
    },

    setCurrentListing(commentId, data = null) {
      if (data) {
        this.listingCache[commentId] = data;
      }
      this.currentListing = this.listingCache[commentId];
    },

    cleanUrl(url: string) {
      return url.slice(url.indexOf("/r/")); // Ok now I'm getting sloppy.
    },
  };

  const rCommentsController = {
    model: rCommentsModel,
    view: rCommentsView,
    disableRequest: false,

    init() {
      let active: HTMLAnchorElement | false = false;
      let yPos: number | false = false;

      // Helper functions
      function isValidCommentAnchor(
        element: HTMLElement | null
      ): HTMLAnchorElement | null {
        if (!element) return null;

        // Check if it's the comments button/link
        const isCommentsButton = 
          // New Reddit comment button
          (element.getAttribute("data-click-id") === "comments") ||
          // Old Reddit and other variations
          (element.tagName === "A" && 
           (element.getAttribute("data-post-click-location") === "comments-button" ||
            element.classList.contains("comments-link")));

        if (isCommentsButton) {
          return element as HTMLAnchorElement;
        }

        return null;
      }

      function findCommentAnchorInShadow(
        root: HTMLElement | ShadowRoot
      ): HTMLAnchorElement | null {
        if (!root) return null;

        const anchor = root.querySelector(
          'a[data-post-click-location="comments-button"]'
        );
        if (anchor) return anchor as HTMLAnchorElement;

        for (const child of Array.from(root.children)) {
          const shadowRoot = (child as HTMLElement).shadowRoot;
          if (shadowRoot) {
            const nestedAnchor = findCommentAnchorInShadow(shadowRoot);
            if (nestedAnchor) return nestedAnchor;
          }
        }

        return null;
      }

      // Create a global helper to check for share buttons
      const isShareButton = (element) => {
        if (!element) return false;
        
        // Most direct check - data attribute
        if (element.getAttribute && element.getAttribute('data-post-click-location') === 'share') {
          return true;
        }
        
        // Check closest parent with these attributes
        if (element.closest && 
           (element.closest('[data-post-click-location="share"]') || 
            element.closest('[slot="share-button"]'))) {
          return true;
        }
        
        // Check by class name
        if (element.classList && 
           (element.classList.contains('share') || 
            element.classList.contains('share-button'))) {
          return true;
        }
        
        // Check text content
        if (element.textContent && 
            element.textContent.trim().toLowerCase() === 'share') {
          return true;
        }
        
        return false;
      };

      // Cache DOM queries
      const bodyElement = window.document.body;
      const controller = this;
      
      // Debounce mousemove handler
      let mousemoveTimeout: number | null = null;
      const MOUSEMOVE_DEBOUNCE = 16;

      // Use event delegation for better performance
      bodyElement.addEventListener("mousemove", (e: MouseEvent) => {
        // Exit immediately for share buttons
        const target = e.target as HTMLElement;
        
        // Exit for any share button-related element
        if (isShareButton(target)) {
          return;
        }
        
        // Continue with normal mousemove handling
        if (mousemoveTimeout) {
          window.clearTimeout(mousemoveTimeout);
        }

        mousemoveTimeout = window.setTimeout(() => {
          mousemoveTimeout = null;
          
          let commentsAnchor: HTMLAnchorElement | null = null;

          // Check if the target or its parent is a valid comments anchor
          commentsAnchor =
            isValidCommentAnchor(target) ||
            isValidCommentAnchor(target.parentElement);

          if (!commentsAnchor && target.shadowRoot) {
            commentsAnchor = findCommentAnchorInShadow(target.shadowRoot);
          }

          // If we're not on a comments anchor and not moving to/from the popup, reset state
          if (!commentsAnchor && !target.closest(`.${R_COMMENTS_MAIN_CLASS}`)) {
            if (active) {
              controller.handleAnchorMouseLeave(e, yPos);
              active = false;
            }
            return;
          }

          // Update position if we're still on the same anchor
          if (active && commentsAnchor && commentsAnchor.href === active.href) {
            yPos = e.pageY;
            return;
          }

          // Handle new anchor hover
          if (commentsAnchor && (!active || commentsAnchor.href !== active.href)) {
            if (active) {
              // Clean up previous anchor
              controller.handleAnchorMouseLeave(e, yPos);
            }
            controller.registerPopup();
            active = commentsAnchor;
            yPos = e.pageY;
            controller.handleAnchorMouseEnter(commentsAnchor);
          }
        }, MOUSEMOVE_DEBOUNCE);
      });
    },

    registerPopup() {
      if (this.view?.hasAlreadyBuiltPopup()) {
        return;
      }
      const popup = this.view.getPopup();
      
      // Use event delegation instead of multiple listeners
      popup.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        
        // Early return for non-interactive elements
        if (!target.classList?.length) {
          return false;
        }

        if (target.classList.contains("_rcomments_next_reply")) {
          this.renderCommentFromElement(target.parentElement.parentElement);
        } else if (target.className === "_rcomments_next_comment") {
          this.renderCommentFromElement(target.parentElement);
        } else if (target.classList[0] === "arrow") {
          e.stopImmediatePropagation();
          this.handleVote(target);
        } else if (isAALinksTogglerElement(target)) {
          handleAAExtractorClick(e);
        } else if (target.classList.contains("md-spoiler-text")) {
          e.stopImmediatePropagation();
          target.classList.add("revealed");
        }
        return false;
      });
    },

    findClosestThing(node) {
      if (!node) return null;
      
      while (node) {
        if (node.classList && node.classList.contains("thing")) {
          return node;
        }
        node = node.parentNode;
        if (!node || (node.tagName && node.tagName.toLowerCase() === "body")) {
          break;
        }
      }
      return null;
    },

    async renderCommentFromElement(el, init = false): Promise<void> {
      if (this.request) return;

      this.view.loading(el);

      // If not first comment, find first parent "thing" div
      // which represents is a comment div with id attribute
      const commentId = init ? null : (this.findClosestThing(el)?.id || null); // TODO: simplify, needs to be real commentID or null
      const isNextComment = el.classList.contains(R_COMMENTS_MAIN_CLASS);
      // Target URL for request is comment page or comment's permalink
      // Initial request will not have a comment ID, so will use overall comment page
      let url = getListingUrlPathElement(el) || this.model.getUrl(commentId);
      url += ".json";

      const cachedHtml =
        !isNextComment && !commentId
          ? this.model.commentStatus.getCachedHtml(url)
          : null;
      if (cachedHtml) {
        this.view.loadContentHtml(el, cachedHtml);
        const id = this.view.getPopup().querySelector("._rcomments_comment").id;
        this.model.setCurrentListing(id);
        return;
      }

      const requestData = this.model.getRequestData(url, commentId);
      const commentResponseData = await this.executeCommentRequest(
        el,
        commentId,
        {
          url: requestData.url,
          data: requestData.params,
          timeout: 4000,
        }
      );
      if (!commentResponseData.success) {
        return;
      }
      this.showComment(commentResponseData);
      plugins.forEach((plugin) => {
        if (plugin.doesApply(commentResponseData, requestData)) {
          plugin.execute
            .call(this, commentResponseData, requestData)
            .then((success) =>
              success
                ? this.model.commentStatus.setCachedHtml(
                    commentResponseData.url,
                    this.view.contentHtml()
                  )
                : null
            );
        }
      });
    },

    /**
     * Responsible for executing the Reddit API request, registering response
     * with the model, handling the "more" response, and handling the fail scenario
     * as well.
     *
     * @param el
     * @param commentId
     * @param parameters
     */
    async executeCommentRequest(
      el: HTMLElement,
      commentId: string,
      parameters: RequestOptions<RequestParams>
    ): Promise<CommentResponseData> {
      try {
        this.request = getCommentData(parameters);
        const responseData = await this.request;
        delete this.request;
        return this.getCommentData(
          responseData,
          el,
          parameters.url,
          parameters.data
        );
      } catch (error) {
        this.handleCommentFail(el);
        return {
          success: false,
          el,
          isLastReply: false,
          url: parameters.url,
        };
      } finally {
        delete this.request;
      }
    },

    getCommentData(
      data: any,
      el: HTMLElement,
      url: string,
      params: RequestParams
    ): CommentResponseData {
      const commentData = this.model.registerComment(url, data, params);
      if (commentData === null) {
        // // Failed
        return {
          success: false,
          el,
          url,
          isLastReply: false,
        };
      }
      if (commentData.kind === "more") {
        // Sometimes, Reddit responds with a "more" thing rather than the
        // actual comment. We'll handle it by upping the limit parameter
        // on the request, which seems to force the "more" thing to expand
        // to actual comments
        return this.handleMoreThing(el, url, params.comment);
      }
      return {
        success: true,
        el,
        url,
        isLastReply: commentData.isLastReply,
        commentJson: commentData.json,
        commentId: commentData.json.id,
      };
    },

    /**
     * Handles the weird "more" response that Reddit periodically returns
     * by skipping the response and upping our limit and updating our comment index.
     *
     * @param el
     * @param url
     * @param commentId
     * @returns {Promise<CommentResponseData>}
     */
    async handleMoreThing(
      el: HTMLElement,
      url: string,
      commentId: string | null
    ): Promise<CommentResponseData> {
      const params = this.model.commentStatus.getNextCommentRequestParameters(
        url,
        commentId
      );
      params.commentIndex = params.limit - 2;
      params.limit += 1;
      this.model.commentStatus.updateRequestParameters(url, commentId, params);
      return this.executeCommentRequest(el, commentId, {
        url,
        data: params,
        timeout: 4000,
      });
    },

    showComment(data: SuccessfulCommentResponseData): void {
      const { commentJson, isLastReply, url, el } = data;
      const commentHtml = generateCommentHtml(
        UserContext.get(),
        commentJson,
        this.model.currentListing
      );
      this.view.show(el, commentHtml);
      this.view.updateParentComment(el, isLastReply);
      // Do we need comment id?
      this.model.commentStatus.setCachedHtml(url, this.view.contentHtml());
    },

    handleCommentFail(el) {
      this.view.handleError(el, "Error: Reddit did not respond.");
      this.disableRequest = false;
    },

    handleAnchorMouseEnter(commentAnchor) {
      // Check if the event is coming from a share button or related element
      const isShareRelated = (element) => {
        if (!element) return false;
        
        // Check direct attributes
        if (element.getAttribute && element.getAttribute('data-post-click-location') === 'share') {
          return true;
        }
        
        // Check classes
        if (element.classList && 
            (element.classList.contains('share') || 
             element.classList.contains('share-button'))) {
          return true;  
        }
        
        // Check parent too
        if (element.parentElement && isShareRelated(element.parentElement)) {
          return true;
        }
        
        // Check for closest share button
        if (element.closest && 
            (element.closest('[data-post-click-location="share"]') ||
             element.closest('[slot="share-button"]'))) {
          return true;
        }
        
        return false;
      };
      
      // Skip if share related
      if (isShareRelated(commentAnchor)) {
        return;
      }

      if (!commentAnchor.getAttribute("data-populated")) {
        commentAnchor.setAttribute("data-populated", "false");
      }

      if (!this.currentAnchor) {
        this.currentAnchor = commentAnchor;
        this.renderCommentFromElement(commentAnchor, true);
      }
    },

    handleAnchorMouseLeave(e, prevPageY) {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }

      // Only proceed with hide if we're not moving to the popup
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (relatedTarget?.closest(`.${R_COMMENTS_MAIN_CLASS}`)) {
        return;
      }

      if (prevPageY >= e.pageY) {
        // Moving up or sideways - hide immediately
        this.view.hidePopup();
        this.currentAnchor = null;  // Reset currentAnchor when hiding popup
      } else {
        // Moving down - give chance to move to popup
        this.view.hidePopupSoon();
      }
    },

    handleVote(arrow) {
      if (!UserContext.get().modhash) return;

      const VOTE_URL = "/api/vote/.json";

      const parentComment = DOM.getFirstParent(
        arrow,
        `.${DOM.classed("comment")}`
      ) as HTMLElement;
      const id = parentComment && `t1_${parentComment.id}`;
      const url = `${this.model.currentListing.permalink}.json`;
      let dir;

      if (arrow.classList.contains("up")) {
        dir = 1;
      } else if (arrow.classList.contains("down")) {
        dir = -1;
      } else {
        dir = 0;
      }

      type VoteRequest = {
        id: string;
        dir: number;
        uh: string;
      };
      const data: VoteRequest = {
        id,
        dir,
        uh: UserContext.get().modhash,
      };
      _request<VoteRequest, any>({ url: VOTE_URL, type: "POST", data });
      applyVote(arrow.parentElement, dir);
      this.model.commentStatus.setCachedHtml(url, this.view.contentHtml());
    },
  };

  rCommentsController.init();
})(window);
