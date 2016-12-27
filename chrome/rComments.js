((window) => {
	const R_COMMENTS_ID = '_rcomment_div';
	const R_COMMENTS_CLASS_PREFIX = '_rcomments_';
	const NEXT_REPLY_TEXT = '&#8618 Next Reply';
	const NEXT_COMMENT_TEXT = '&#8595 Next Comment';

	function decodeHTML(html) {
		const txt = window.document.createElement('textarea');
		txt.innerHTML = html;
		return txt.value;
	}

	function getFirstParent(el, selector) {
		if (!el.parentElement) {
			return false;
		} else if (el.parentElement.matches(selector)) {
			return el.parentElement;
		}
		return getFirstParent(el.parentElement, selector);
	}

	function formEncode(data) {
		return Object.keys(data).map(key => `${key}=${data[key]}&`).join('').slice(0, -1);
	}

	// screw you jQuery
	function _request(url, options = {}) {
		if (typeof url === 'object') {
			options = url;
			url = options.url;
		}

		const type = options.type || 'GET';
		let data = formEncode(options.data || {});
		if (type === 'GET') {
			url += `?${data}`;
			data = undefined;
		}

		const xhttp = new window.XMLHttpRequest();
		const promise = new Promise((resolve, reject) => {
			xhttp.onreadystatechange = function onStateChange() {
				if (xhttp.readyState === 4 && xhttp.status === 200) {
					resolve(JSON.parse(xhttp.responseText));
				} else if (xhttp.readyState === 4) {
					reject();
				}
			};
			xhttp.ontimeout = () => {
				reject();
			};
			xhttp.open(type, url, true);
			if (options.timeout) xhttp.timeout = options.timeout;
			xhttp.setRequestHeader('content-type', 'application/x-www-form-urlencoded; charset=UTF-8');
			xhttp.send(data);
		});
		promise.abort = function abort() {
			xhttp.abort();
		};
		return promise;
	}

	function classed(classes) {
		return R_COMMENTS_CLASS_PREFIX + classes;
	}

	const Comment = {

		isLoggedIn: false,
		openLinksInNewTab: false,

		getHtml(json, listing) {
			if (!json || !json.id) return this.noReplyHtml();

			this.data = json;
			this.listing = listing;
			const d = this.data;
			const commentHtml = `<div>${decodeHTML(d.body_html)}</div>`;
			const tagline = this.buildTagline();
			const arrows = this.arrows();

			let bodyHtml = `<div>${commentHtml}</div>`;

			if (this.openLinksInNewTab) {
				const regex = /(<a\s)(.*<\/a>)/;
				bodyHtml = bodyHtml.replace(regex, '$1target="_blank" $2');
			}

			const wrapperOpen = `<div id="${d.id}" class="${classed('comment comment thing')}">`;
			const wrapperClose = '</div>';
			const entry = `<div class="entry">
				${tagline}
				${bodyHtml}
				${this.nextReply(!!d.replies)}
				<div class="children"></div>
				</div>
			`;

			return wrapperOpen + arrows + entry + wrapperClose;
		},

		noReplyHtml() {
			return `<div class="${classed('comment comment thing')}">Oops, no more replies.</div>`;
		},

		buildTagline() {
			return `<div class="tagline">${this.authorTag() + this.voteTag()}</div>`;
		},

		voteTag() {
			const votes = this.data.ups - this.data.downs;
			const unvoted = `<span class="score unvoted">${votes} points</span>`;
			const likes = `<span class="score likes">${votes + 1} points</span>`;
			const dislikes = `<span class="score dislikes">${votes - 1} points</span>`;
			return `<span>${dislikes + unvoted + likes}</span>`;
		},

		nextReply(hasChildren) {
			const _class = classed(hasChildren ? 'next_reply' : 'no_reply');
			const html = hasChildren ? NEXT_REPLY_TEXT : 'No Replies';
			return `<div class="${_class}" style="padding-top:5px">${html}</div>`;
		},

		authorTag() {
			const author = this.data.author;
			const op = this.listing && this.listing.author === author ? 'submitter' : '';
			return `<a class="author ${op}" href="/user/${author}">${author}</a>`;
		},

		arrows() {
			if (!this.isLoggedIn) return '';
			const arrowDiv = window.document.createElement('div');
			const arrowUp = window.document.createElement('div');
			const arrowDown = window.document.createElement('div');
			arrowDiv.className = classed('arrows unvoted');
			arrowUp.className = 'arrow up';
			arrowDown.className = 'arrow down';
			arrowDiv.appendChild(arrowUp);
			arrowDiv.appendChild(arrowDown);
			return this.applyVote(arrowDiv, this.data.likes).outerHTML;
		},

		applyVote(arrows, vote) {
			const upArrow = arrows.querySelector('.arrow.up, .arrow.upmod');
			const downArrow = arrows.querySelector('.arrow.down, .arrow.downmod');
			// Reset - gross, could find a better way of doing this.
			arrows.classList.remove('unvoted');
			arrows.classList.remove('likes');
			arrows.classList.remove('dislikes');
			upArrow.classList.remove('upmod');
			upArrow.classList.add('up');
			downArrow.classList.remove('downmod');
			downArrow.classList.add('down');

			// Switch statement with boolean cases? #yolo(?)
			switch (vote) {
			case 1:
			case true:
				arrows.classList.add('likes');
				upArrow.classList.remove('up');
				upArrow.classList.add('upmod');
				break;
			case -1:
			case false:
				arrows.classList.add('dislikes');
				downArrow.classList.remove('down');
				downArrow.classList.add('downmod');
				break;
			default:
				arrows.classList.add('unvoted');
				if (arrows.querySelector('.score')) {
					arrows.querySelector('.score').classList.add('unovoted');
				}
			}

			return arrows;
		},
	};

	const rCommentsView = {
		show(el, json, listing) {
			const commentHtml = Comment.getHtml(json, listing);
			let popup;

			if (this.isFirstComment(el)) {
				popup = this.popup(el);
				popup.querySelector(`.${classed('content')}`).innerHTML = commentHtml;
				popup.style.display = 'block';
			} else {
				const content = el.querySelector('._rcomments_content, .children');
				const loading = content.getElementsByClassName(classed('loading'))[0];
				if (loading) {
					loading.parentNode.removeChild(loading);
				}
				content.innerHTML = commentHtml + content.innerHTML;
			}
		},

		getPopup() {
			if (!this._popup) {
				const popup = window.document.createElement('div');
				const nextCommentDiv = window.document.createElement('div');
				const contentDiv = window.document.createElement('div');
				nextCommentDiv.className = classed('next_comment');
				nextCommentDiv.innerHTML = NEXT_COMMENT_TEXT;
				contentDiv.className = classed('content');
				popup.id = R_COMMENTS_ID;
				popup.style.display = 'none';
				popup.appendChild(nextCommentDiv);
				popup.appendChild(contentDiv);
				window.document.body.appendChild(popup);
				popup.addEventListener('mouseleave', this.hidePopup.bind(this));
				this._popup = popup;
			}
			return this._popup;
		},

		popup(el) {
			const popup = this.getPopup();
			const nextCommentNone = popup.getElementsByClassName(classed('next_comment_none'))[0];

			if (nextCommentNone) {
				nextCommentNone.innerHTML = NEXT_COMMENT_TEXT;
				nextCommentNone.classList = [classed('next_comment')];
			}

			const clientRect = el.getBoundingClientRect();

			if (this.isFirstComment(el)) {
				const windowOffsetY = window.pageYOffset;
				const windowOffsetX = window.pageXOffset;
				const top = Math.round(clientRect.top + clientRect.height + windowOffsetY);
				const left = Math.round(clientRect.left + windowOffsetX);
				const nextComment = popup.getElementsByClassName(classed('next_comment'))[0];
				if (nextComment) {
					nextComment.innerHTML = NEXT_COMMENT_TEXT;
				}
				popup.style.top = `${top}px`;
				popup.style.left = `${left}px`;
			}

			return popup;
		},

		hidePopup() {
			if (this._popup) this._popup.style.display = 'none';
		},

		isFirstComment(el) {
			return el.tagName.toLowerCase() === 'a';
		},

		loading(el) {
			const isFirst = this.isFirstComment(el);
			const loadingClasses = `${classed('loading')} ${classed('comment comment thing')}`;
			const span = '<span>Fetching comment...</span>';
			const loadingContent = `<div class="${loadingClasses}">${span}</div>`;
			if (isFirst) {
				const popup = this.popup(el);
				popup.querySelector(`.${classed('content')}`).innerHTML = loadingContent;
				popup.style.display = 'block';
			} else {
				const children = el.querySelector('._rcomments_content, .children');
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

		updateParentComment(el, isLastReply) {
			if (!isLastReply) return;

			let container;
			for (let i = 0; i < el.children.length; i += 1) {
				if (el.children[i].classList.contains('entry')) {
					container = el.children[i].querySelector(`.${classed('next_reply')}`);
					break;
				}
			}

			if (!container) {
				container = this._popup.querySelector(`.${classed('next_comment')}`);
			}

			if (container.classList.contains(classed('next_comment'))) {
				container.classList.remove(classed('next_comment'));
				container.classList.add(classed('next_comment_none'));
				container.innerHTML = 'No more Comments';
			} else {
				container.classList.remove(classed('next_reply'));
				container.classList.add(classed('no_reply'));
				container.innerHTML = 'No More replies';
			}
		},

		handleError(el, error) {
			const errorHtml = `<div class="${classed('error')}">${error}</div>`;

			if (this.isFirstComment(el)) {
				this.popup(el).querySelector(`.${classed('content')}`).innerHTML = errorHtml;
			} else {
				const node = el.querySelector('._rcomments_content, .children');
				node.innerHTML = errorHtml + node.innerHTML;
				const loading = node.querySelector(`.${classed('loading')}`);
				if (loading) {
					loading.remove();
				}
			}
		},
	};

	const rCommentsModel = {

		listingCache: {},
		htmlCache: {},
		commentStatus: {},
		currentListing: {},

		getRequestData(url, commentId) {
			const params = this.requestParams(url, commentId);

			const data = {
				url,
				params,
			};

			if (!commentId) data.cached = this.cache(url);

			return data;
		},

		requestParams(url, commentId) {
			const key = this.genKey(url, commentId);
			let params = Object.assign({}, this.commentStatus[key] || {});

			if (!params.sort) {
				params = {
					depth: (commentId ? 2 : 1),
					limit: (commentId ? 1 : 0), // Incremented below
					sort: 'top',
				};

				if (commentId) params.comment = commentId;
			}

			params.limit += 1;

			return params;
		},

		registerComment(url, data, commentId) {
			const key = this.genKey(url, commentId);
			const params = this.requestParams(url, commentId);
			const listingJson = this.extractListingJson(data);
			const commentData = this.extractCommentData(data, params);

			if (!commentData) return false;
			this.commentStatus[key] = params;
			this.setCurrentListing(commentData.json.id, listingJson);
			return commentData;
		},

		extractListingJson(data) {
			return data[0].data.children[0].data;
		},

		extractCommentData(data, params) {
			const isCommentReply = params.depth === 2;
			const hasCommentIndex = params.commentIndex !== undefined;
			let commentIndex = hasCommentIndex ? params.commentIndex : params.limit - 1;
			let commentList = data[1].data.children;

			if (isCommentReply) {
				commentIndex -= 1;
				commentList = commentList[0].data.replies.data;
				if (!commentList) return null; // Sometimes reddit lies to us. See below.
				commentList = commentList.children;
			}

			if (params.commentIndex !== undefined) {
				params.commentIndex += 1;
			}

			// Reddit had replied to parent comment saying there were
			// more replies. They lied.
			if (!commentList[commentIndex]) {
				return null;
			}

			return {
				kind: commentList[commentIndex].kind,
				json: commentList[commentIndex].data,
				isLastReply: !commentList[commentIndex + 1], // "More comments"
			};
		},

		genKey(url, commentId) {
			url = this.cleanUrl(url);
			return commentId ? url + commentId : url;
		},

		getUrl(commentId) {
			const listing = this.listingCache[commentId];
			return listing ? listing.permalink : this.currentListing.permalink;
		},

		cache(url, args) {
			url = this.cleanUrl(url);

			if (args) {
				this.htmlCache[url] = args;
			}

			return this.htmlCache[url];
		},

		setCurrentListing(commentId, data) {
			if (data) {
				this.listingCache[commentId] = data;
			}
			this.currentListing = this.listingCache[commentId];
		},

		cleanUrl(url) {
			return url.slice(url.indexOf('/r/')); // Ok now I'm getting sloppy.
		},
	};

	const rCommentsController = {

		model: rCommentsModel,
		view: rCommentsView,
		request: new window.XMLHttpRequest(),
		go: false,
		disableRequest: false,

		init() {
			const popup = this.view.getPopup();

			_request('/api/me.json').then((response) => {
				if (!response || !response.data || !response.data.modhash) return;
				this.modhash = response.data.modhash;

				// Ummmmmmmm..... nothing to see here, move along
				// This is super hacky.
				// BUT WHATEVER WORKS YO
				Comment.openLinksInNewTab = /('|")new_window('|")\s?:\s?true/.test(window.config.innerHTML);
				Comment.isLoggedIn = true; // Sure... this works.
			});

			popup.addEventListener('click', (e) => {
				if (e.target.className === '_rcomments_next_reply') {
					this.renderCommentFromElement(e.target.parentElement.parentElement);
				} else if (e.target.className === '_rcomments_next_comment') {
					this.renderCommentFromElement(e.target.parentElement);
				} else if (e.target.classList && e.target.classList[0] === 'arrow') {
					e.stopImmediatePropagation();
					this.handleVote(e.target);
				}
				return false;
			});

			let active = false;
			window.document.body.addEventListener('mousemove', (e) => {
				let a = e.target.nodeName === 'A' ? e.target : false;
				if (a && !(a.classList.contains('comments') || a.classList.contains('search-comments'))) {
					// Not a comment anchor.
					a = false;
				}

				if (!active && !a) {
					// Exit early if non active and not an anchor
					return;
				}
				if (active && a && a.href === active.href) {
					// Exit early if on the same anchor
					return;
				}

				if (!active && a) {
					// Hovering over anchor for the first tme
					active = e.target;
					this.handleAnchorMouseEnter(a);
				} else if (active) {
					this.handleAnchorMouseLeave(e, active);
					active = false;
				}
			});
		},

		findClosestThing(node) {
			while (node) {
				if (node.classList && node.classList.contains('thing')) {
					return node;
				}
				node = node.parentNode;
				if (node.tagName.toLowerCase() === 'body') {
					break;
				}
			}
			return false;
		},

		renderCommentFromElement(el, init) {
			if (this.disableRequest) return;
			const request = this.request;
			const commentId = !init && this.findClosestThing(el).id;
			const isNextComment = el.id === '_rcomment_div';
			let url = el.href || this.model.getUrl(commentId);

			// Sometimes the URL contains query parameters we don't want.
			// This removes them.
			if (url === el.href && el.nodeName === 'A') {
				url = url.slice(0, el.search ? url.indexOf(el.search) : url.length);
			}
			url += '.json';

			const requestData = this.model.getRequestData(url, commentId);

			this.view.loading(el);
			request.abort();

			if (requestData.cached && !isNextComment) {
				const content = requestData.cached.content;
				this.view.loadContentHtml(el, content);
				const id = this.view.getPopup().querySelector('._rcomments_comment').id;
				this.model.setCurrentListing(id);
				return;
			}

			this.executeCommentRequest(el, commentId, {
				url: requestData.url,
				data: requestData.params,
				timeout: 4000,
			}).then(this.showComment.bind(this));
		},

		executeCommentRequest(el, commentId, parameters) {
			this.disableRequest = true;
			this.request = _request(parameters);
			const onSuccess = this.getCommentData(el, parameters.url, commentId).bind(this);
			const onFail = this.handleCommentFail(el).bind(this);
			return this.request.then(onSuccess, onFail);
		},

		getCommentData(el, url, commentId) {
			return (data) => {
				let commentData = this.model.registerComment(url, data, commentId);
				let isLastReply;
				if (commentData && commentData.kind === 'more') {
					// Sometimes, Reddit responds with a "more" thing rather than the
					// actual comment. We'll handle it by upping the limit parameter
					// on the request, which seems to force the "more" thing to expand
					// to actual comments
					return this.handleMoreThing(el, url, commentId);
				}

				if (commentData) {
					isLastReply = commentData.isLastReply;
				} else {
					isLastReply = true;
					commentData = {};
				}
				return {
					el,
					isLastReply,
					url,
					commentJson: commentData.json,
					commentId: commentData.json && commentData.json.id,
				};
			};
		},

		handleMoreThing(el, url, commentId) {
			this.request.abort();
			const params = this.model.requestParams(url, commentId);
			params.commentIndex = params.limit - 2;
			params.limit += 1;
			this.model.commentStatus[this.model.genKey(url, commentId)] = params;
			return this.executeCommentRequest(el, commentId, {
				url,
				data: params,
				timeout: 4000,
			}).then(this.showComment.bind(this));
		},

		showComment(data) {
			this.disableRequest = false;
			if (!data) {
				// Something went wrong earlier
				return;
			}
			const { commentJson, isLastReply, commentId, url, el } = data;
			this.view.show(el, commentJson, this.model.currentListing);
			this.view.updateParentComment(el, isLastReply);
			this.updateCache(url, commentId);
		},

		handleCommentFail(el) {
			return () => {
				this.view.handleError(el, 'Error: Reddit did not respond.');
				this.disableRequest = false;
			};
		},

		updateCache(url, commentId) {
			if (!commentId) return;

			this.model.cache(url, {
				content: this.view.contentHtml(),
				commentId,
			});
		},

		handleAnchorMouseEnter(commentAnchor) {
			if (commentAnchor.text.split(' ').length <= 1) return;
			this.go = true;
			setTimeout(() => {
				if (this.go) this.renderCommentFromElement(commentAnchor, true);
			}, 250);
		},

		handleAnchorMouseLeave(e, commentAnchor) {
			const bbox = commentAnchor.getBoundingClientRect();
			const bottom = bbox.top + window.pageYOffset + bbox.height;

			this.go = false;
			// Do stuff only if exiting anchor not through comment.
			if (e.pageY >= bottom) return;
			this.request.abort();
			this.view.hidePopup();
		},

		handleVote(arrow) {
			if (!this.modhash) return;

			const VOTE_URL = '/api/vote/.json';

			const parentComment = getFirstParent(arrow, `.${classed('comment')}`);
			const id = parentComment && (`t1_${parentComment.id}`);
			const url = `${this.model.currentListing.permalink}.json`;
			const commentId = getFirstParent(arrow, '.comment').id;
			let dir;

			if (arrow.classList.contains('up')) {
				dir = 1;
			} else if (arrow.classList.contains('down')) {
				dir = -1;
			} else {
				dir = 0;
			}

			const data = {
				id,
				dir,
				uh: this.modhash,
			};

			_request(VOTE_URL, { type: 'POST', data });
			Comment.applyVote(arrow.parentElement, dir);
			this.updateCache(url, commentId);
		},
	};

	rCommentsController.init();
})(window);
