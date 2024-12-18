import * as DOM from "./dom/DOM";
import { UserContext } from "./UserContext";
import {
  applyVote,
  generateCommentHtml,
} from "./html-generators/html_generator";
import { _request, RequestOptions } from "./Request";
import {
  CommentResponseData,
  ExtractedCommentData,
  RequestData,
  RequestParams,
  SuccessfulCommentResponseData,
} from "./types/types";
import Store from "./Store";
import { getCommentData } from "./data-fetchers/commentFetcher";
import { getListingUrlPathElement } from "./dom/dom-accessors";
import plugins from "./post-processing-plugins/plugins";
import {
  extractCommentData,
  extractListingJson,
} from "./data-fetchers/commentInspector";
import {
  handleAAExtractorClick,
  isAALinksTogglerElement,
} from "./post-processing-plugins/aa-video-extractor/aa_video_extractor";

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

        // Add consistent re-show handling
        popup.style.display = "block";

        // Reset any lingering state
        this.isCursorInsidePopup = false;

        // Avoid stale outdated timeouts
        if (this.hideTimeout) {
          window.clearTimeout(this.hideTimeout);
          delete this.hideTimeout;
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
        nextCommentDiv.className = DOM.classed("next_comment");
        nextCommentDiv.innerHTML = NEXT_COMMENT_TEXT;
        contentDiv.className = DOM.classed("content");
        popup.classList.add(R_COMMENTS_MAIN_CLASS);

        if (UserContext.get().usesNewStyles()) {
          popup.classList.add(R_COMMENTS_NEW_REDDIT_STYLE);
        }

        popup.style.display = "none";
        popup.appendChild(nextCommentDiv);
        popup.appendChild(contentDiv);
        window.document.body.appendChild(popup);

        // Track whether cursor is inside
        this.isCursorInsidePopup = false;

        // Ensure events re-add reliably
        popup.addEventListener("mouseenter", () => {
          this.isCursorInsidePopup = true;
          if (this.hideTimeout) {
            window.clearTimeout(this.hideTimeout);
            delete this.hideTimeout;
          }
        });

        popup.addEventListener("mouseleave", () => {
          this.isCursorInsidePopup = false;
          this.hidePopupSoon();
        });

        this._popup = popup; // Avoid recreating the popup
      }

      return this._popup;
    },

    popup(el) {
      const popup = this.getPopup();
      const nextCommentNone = popup.getElementsByClassName(
        DOM.classed("next_comment_none")
      )[0];

      if (nextCommentNone) {
        nextCommentNone.innerHTML = NEXT_COMMENT_TEXT;
        nextCommentNone.classList = [DOM.classed("next_comment")];
      }

      const clientRect = el.getBoundingClientRect();

      if (this.isFirstComment(el)) {
        const windowOffsetY = window.pageYOffset;
        const windowOffsetX = window.pageXOffset;
        const top = Math.round(
          clientRect.top + clientRect.height + windowOffsetY
        );
        const left = Math.round(clientRect.left + windowOffsetX);
        const nextComment = popup.getElementsByClassName(
          DOM.classed("next_comment")
        )[0];
        if (nextComment) {
          nextComment.innerHTML = NEXT_COMMENT_TEXT;
        }
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
      }
      return popup;
    },

    // hidePopup() {
    //   if (this._popup) {
    //     this._popup.style.display = "none";
    //   }
    // },

    hidePopup() {
      if (this._popup) {
        this._popup.style.display = "none";

        // Reset state variables
        this.isCursorInsidePopup = false; // Reset cursor state
        if (this.hideTimeout) {
          window.clearTimeout(this.hideTimeout);
          delete this.hideTimeout;
        }
      }
    },

    hidePopupSoon() {
      // Clear any existing hide timeout to prevent duplicate calls
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
      }

      // Delay hiding the popup to account for any potential mouse reentry
      this.hideTimeout = window.setTimeout(() => {
        if (!this.isCursorInsidePopup) {
          this.hidePopup();
        }
      }, 2000); // Adjust delay as desired
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

      // Updated function to validate the specific anchor
      function isValidCommentAnchor(
        element: HTMLElement | null
      ): HTMLAnchorElement | null {
        if (!element) return null;

        // Direct check for anchor tag with specific attribute
        if (
          element.tagName === "A" &&
          element.getAttribute("data-post-click-location") === "comments-button"
        ) {
          return element as HTMLAnchorElement;
        }

        return null;
      }

      // Function to traverse shadow DOM for the comment anchor
      function findCommentAnchorInShadow(
        root: HTMLElement | ShadowRoot
      ): HTMLAnchorElement | null {
        if (!root) return null;

        const anchor = root.querySelector(
          'a[data-post-click-location="comments-button"]'
        );
        if (anchor) return anchor as HTMLAnchorElement;

        // Traverse children for nested shadow roots
        for (const child of Array.from(root.children)) {
          const shadowRoot = (child as HTMLElement).shadowRoot;
          if (shadowRoot) {
            const nestedAnchor = findCommentAnchorInShadow(shadowRoot);
            if (nestedAnchor) return nestedAnchor;
          }
        }

        return null;
      }

      window.document.body.addEventListener("mousemove", (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        let a: HTMLAnchorElement | null = null;

        // Check if target or its parent is a valid anchor
        a =
          isValidCommentAnchor(target) ||
          isValidCommentAnchor(target.parentElement);

        // If still not found, traverse shadow DOM if applicable
        if (!a && target.shadowRoot) {
          a = findCommentAnchorInShadow(target.shadowRoot);
        }

        if (!active && !a) {
          // Exit early if non-active and not an anchor
          return;
        }

        if (active && a && a.href === active.href) {
          yPos = e.pageY;
          // Exit early if on the same anchor
          return;
        }

        if (!active && a) {
          this.registerPopup(); // Lazily build and register popup
          active = a;
          yPos = e.pageY;
          this.handleAnchorMouseEnter(a);
        } else if (active) {
          this.handleAnchorMouseLeave(e, yPos);
          active = false;
        }
      });
    },

    registerPopup() {
      if (this.view.hasAlreadyBuiltPopup()) {
        return;
      }
      const popup = this.view.getPopup();
      popup.addEventListener("click", (e) => {
        if (e.target.classList.contains("_rcomments_next_reply")) {
          this.renderCommentFromElement(e.target.parentElement.parentElement);
        } else if (e.target.className === "_rcomments_next_comment") {
          this.renderCommentFromElement(e.target.parentElement);
        } else if (e.target.classList && e.target.classList[0] === "arrow") {
          e.stopImmediatePropagation();
          this.handleVote(e.target);
        } else if (isAALinksTogglerElement(e.target)) {
          handleAAExtractorClick(e);
        } else if (
          e.target.classList &&
          e.target.classList.contains("md-spoiler-text")
        ) {
          e.stopImmediatePropagation();
          e.target.classList.add("revealed");
        }
        return false;
      });
    },

    findClosestThing(node) {
      while (node) {
        if (node.classList && node.classList.contains("thing")) {
          return node;
        }
        node = node.parentNode;
        if (node.tagName.toLowerCase() === "body") {
          break;
        }
      }
      return false;
    },

    async renderCommentFromElement(el, init = false): Promise<void> {
      if (this.request) return;

      this.view.loading(el);

      // If not first comment, find first parent "thing" div
      // which represents is a comment div with id attribute
      const commentId = init ? null : this.findClosestThing(el).id || null; // TODO: simplify, needs to be real commentID or null
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
      const commentAnchorWords = commentAnchor.text.split(" ");
      if (commentAnchorWords.length === 0) {
        return;
      }
      const numberOfComments = Number.parseInt(commentAnchorWords[0], 10);
      const firstWordIsNumber = !Number.isNaN(numberOfComments);
      if (firstWordIsNumber && numberOfComments === 0) {
        return;
      }
      if (!firstWordIsNumber && commentAnchorWords.length === 1) {
        // Label on the button is "comments" (old reddit's no comments flag)
        return;
      }
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => {
        this.renderCommentFromElement(commentAnchor, true);
      }, 400);
    },

    handleAnchorMouseLeave(e, prevPageY) {
      clearTimeout(this.timeoutId);

      if (prevPageY >= e.pageY) {
        // If leaving through the side or top, delete any ongoing request.
        // and hide the popup. The resolved request will cache the data, but
        // not open the popup.
        // delete this.request;
        this.view.hidePopup();
      } else {
        // Still try to hide the popup, but the timeout
        // will be canceled if we hover over the popup
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
