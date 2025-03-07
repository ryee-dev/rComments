import { _request, RequestOptions } from "../Request";
import { genKey } from "../Store";
import { RequestParams } from "../types/types";

type PostContentCacheValue = {
  responseData: any;
  params: RequestParams;
};

const dataCache = new Map<string, PostContentCacheValue>();

const DEFAULT_REQUEST_PARAMS: RequestParams = {
  commentIndex: 0,
  depth: 0,
  limit: 1,
  sort: "top"
};

/**
 * Fetches post content from Reddit's API and caches the results.
 * Similar to getCommentData but simplified for post content.
 */
export async function getPostContent(
  requestOptions: RequestOptions<RequestParams>
): Promise<any> {
  const key = genKey(requestOptions.url, "post_content");
  let cachedData = dataCache.get(key);

  if (!cachedData) {
    cachedData = await fetchPostContent(requestOptions);
    dataCache.set(key, cachedData);
  }

  return cachedData.responseData;
}

async function fetchPostContent(
  requestOptions: RequestOptions<RequestParams>
): Promise<PostContentCacheValue> {
  const response = await _request<RequestParams, any>({
    url: requestOptions.url,
    data: { ...DEFAULT_REQUEST_PARAMS, ...requestOptions.data }
  });

  // Extract the post content from the response
  if (response && response[0]?.data?.children?.[0]?.data) {
    const post = response[0].data.children[0].data;
    let content = post.selftext || ''; // Use raw text instead of HTML

    // Handle different types of content
    if (!content && post.url) {
      // For link posts
      content = post.url;
    } else if (!content && post.media?.reddit_video) {
      // For video posts
      content = `[Video] ${post.media.reddit_video.fallback_url}`;
    } else if (!content) {
      content = "No content available";
    }

    return {
      responseData: {
        content,
        title: post.title,
        author: post.author,
        score: post.score,
        subreddit: post.subreddit_name_prefixed,
      },
      params: { ...DEFAULT_REQUEST_PARAMS, ...requestOptions.data }
    };
  }

  throw new Error("Could not find post content");
} 