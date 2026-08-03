import type { PlatformProvider, ProviderAccount, ProviderContentItem, ProviderComment, PublishInput, PublishResult } from "./types";
import {
  fetchFacebookPosts,
  fetchPostInsights,
  fetchFacebookAudience,
  fetchFacebookComments,
  postFacebookCommentReply,
  publishFacebookPhoto,
  publishFacebookVideo,
  type FbPost,
  type FbComment,
} from "@/lib/meta/facebook";

function flattenFbComments(comments: FbComment[]): ProviderComment[] {
  const flat: ProviderComment[] = [];
  for (const c of comments) {
    flat.push({
      externalId: c.id,
      authorName: c.from?.name,
      authorPlatformId: c.from?.id,
      text: c.message,
      likeCount: c.like_count,
      commentedAt: c.created_time,
    });
    for (const reply of c.comments?.data ?? []) {
      flat.push({
        externalId: reply.id,
        parentExternalId: c.id,
        authorName: reply.from?.name,
        authorPlatformId: reply.from?.id,
        text: reply.message,
        likeCount: reply.like_count,
        commentedAt: reply.created_time,
      });
    }
  }
  return flat;
}

function mapPostType(post: FbPost): ProviderContentItem["type"] {
  const mediaType = post.attachments?.data?.[0]?.media_type;
  if (mediaType === "video") return "video";
  if ((post.attachments?.data?.length ?? 0) > 1) return "carousel";
  return "post";
}

async function toContentItem(post: FbPost, token: string): Promise<ProviderContentItem> {
  const isVideo = mapPostType(post) === "video";
  const insights = await fetchPostInsights(post.id, token, isVideo);

  return {
    externalId: post.id,
    type: mapPostType(post),
    caption: post.message,
    mediaUrl: post.attachments?.data?.[0]?.media?.image?.src,
    thumbnailUrl: post.full_picture ?? post.attachments?.data?.[0]?.media?.image?.src,
    permalink: post.permalink_url,
    publishedAt: post.created_time,
    metrics: {
      reach: insights.post_impressions_unique,
      // Solo posts de video traen 'post_video_views' (ver nota en lib/meta/facebook.ts).
      impressions: insights.post_video_views,
      likes: post.reactions?.summary?.total_count,
      comments: post.comments?.summary?.total_count,
      shares: post.shares?.count,
    },
  };
}

export const facebookProvider: PlatformProvider = {
  platform: "facebook",

  async fetchContent(account: ProviderAccount) {
    const posts = await fetchFacebookPosts(account.externalId, account.accessToken);
    return Promise.all(posts.map((p) => toContentItem(p, account.accessToken)));
  },

  // Facebook no expone un endpoint de Page Stories confiable vía Graph
  // API — se omite por ahora. fetchStories queda sin implementar
  // (undefined), el sync lo detecta y lo salta para esta red.

  async fetchAudience(account: ProviderAccount) {
    const audience = await fetchFacebookAudience(account.externalId, account.accessToken);
    return {
      followers: audience.followers_count ?? audience.fan_count,
    };
  },

  async fetchComments(contentExternalId: string, account: ProviderAccount) {
    const comments = await fetchFacebookComments(contentExternalId, account.accessToken);
    return flattenFbComments(comments);
  },

  async postCommentReply(commentExternalId: string, message: string, account: ProviderAccount) {
    return postFacebookCommentReply(commentExternalId, message, account.accessToken);
  },

  // Sin container ni paso de estado — un solo llamado y listo.
  async publishContent(input: PublishInput, account: ProviderAccount): Promise<PublishResult> {
    const result =
      input.mediaType === "video"
        ? await publishFacebookVideo(account.externalId, account.accessToken, {
            videoUrl: input.mediaUrl,
            caption: input.caption,
          })
        : await publishFacebookPhoto(account.externalId, account.accessToken, {
            imageUrl: input.mediaUrl,
            caption: input.caption,
          });

    return { kind: "published", externalId: result.postId, permalink: result.permalink };
  },
};
