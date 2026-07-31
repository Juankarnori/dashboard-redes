import type { PlatformProvider, ProviderAccount, ProviderContentItem, ProviderComment } from "./types";
import {
  fetchInstagramMedia,
  fetchInstagramStories,
  fetchMediaInsights,
  fetchInstagramAudience,
  fetchInstagramDemographics,
  checkEngagementEligibility,
  fetchInstagramComments,
  postInstagramCommentReply,
  type IgMedia,
  type IgComment,
} from "@/lib/meta/instagram";

function flattenIgComments(comments: IgComment[]): ProviderComment[] {
  const flat: ProviderComment[] = [];
  for (const c of comments) {
    flat.push({
      externalId: c.id,
      authorName: c.username,
      text: c.text,
      likeCount: c.like_count,
      commentedAt: c.timestamp,
    });
    for (const reply of c.replies?.data ?? []) {
      flat.push({
        externalId: reply.id,
        parentExternalId: c.id,
        authorName: reply.username,
        text: reply.text,
        likeCount: reply.like_count,
        commentedAt: reply.timestamp,
      });
    }
  }
  return flat;
}

function mapMediaType(m: IgMedia): ProviderContentItem["type"] {
  if (m.media_product_type === "STORY") return "story";
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (m.media_type === "VIDEO") return "video";
  return "post";
}

async function toContentItem(
  media: IgMedia,
  token: string,
  engagementEligible: boolean
): Promise<ProviderContentItem> {
  const insights = await fetchMediaInsights(media.id, media.media_product_type, token, engagementEligible);
  const isStory = media.media_product_type === "STORY";
  const isReel = media.media_product_type === "REELS";

  return {
    externalId: media.id,
    type: mapMediaType(media),
    caption: media.caption,
    mediaUrl: media.media_url,
    thumbnailUrl: media.thumbnail_url ?? media.media_url,
    permalink: media.permalink,
    publishedAt: media.timestamp,
    expiresAt: isStory
      ? new Date(new Date(media.timestamp).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : undefined,
    metrics: {
      reach: insights.reach,
      // 'impressions' es el nombre de columna en content_metrics; desde
      // Graph API v22.0 el dato viene en la métrica unificada 'views'.
      impressions: insights.views,
      likes: media.like_count ?? insights.likes,
      comments: media.comments_count ?? insights.comments,
      shares: insights.shares,
      saves: insights.saved,
      extra:
        isStory || isReel
          ? {
              ...(isStory && {
                replies: insights.replies,
                taps_forward: insights.taps_forward,
                taps_back: insights.taps_back,
                exits: insights.exits,
              }),
              ...(isReel && {
                reposts: insights.reposts,
                reels_skip_rate: insights.reels_skip_rate,
              }),
            }
          : undefined,
    },
  };
}

export const instagramProvider: PlatformProvider = {
  platform: "instagram",

  async fetchContent(account: ProviderAccount) {
    const { eligible, followers } = await checkEngagementEligibility(
      account.externalId,
      account.accessToken
    );
    if (!eligible) {
      console.warn(
        `IG ${account.externalId}: ${followers} seguidores (<1000) — Meta no expone insights de engagement bajo ese umbral. Se sincronizan solo conteos básicos (likes/comments del endpoint de media).`
      );
    }
    const media = await fetchInstagramMedia(account.externalId, account.accessToken);
    return Promise.all(media.map((m) => toContentItem(m, account.accessToken, eligible)));
  },

  async fetchStories(account: ProviderAccount) {
    const { eligible } = await checkEngagementEligibility(account.externalId, account.accessToken);
    const stories = await fetchInstagramStories(account.externalId, account.accessToken);
    return Promise.all(stories.map((s) => toContentItem(s, account.accessToken, eligible)));
  },

  async fetchAudience(account: ProviderAccount) {
    const [audience, demographics] = await Promise.all([
      fetchInstagramAudience(account.externalId, account.accessToken),
      fetchInstagramDemographics(account.externalId, account.accessToken),
    ]);
    return {
      followers: audience.followers_count,
      follows: audience.follows_count,
      mediaCount: audience.media_count,
      demographics,
    };
  },

  async fetchComments(contentExternalId: string, account: ProviderAccount) {
    const comments = await fetchInstagramComments(contentExternalId, account.accessToken);
    return flattenIgComments(comments);
  },

  async postCommentReply(commentExternalId: string, message: string, account: ProviderAccount) {
    return postInstagramCommentReply(commentExternalId, message, account.accessToken);
  },
};
