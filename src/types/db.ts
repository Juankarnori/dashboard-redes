/**
 * Tipos de la base de datos, escritos a mano a partir de
 * supabase/migrations/0001_init.sql.
 *
 * Cuando el proyecto esté enlazado a una instancia real de Supabase,
 * regenera este archivo con:
 *   npx supabase gen types typescript --project-id <id> > src/types/db.ts
 * (y vuelve a añadir los tipos de dominio de más abajo si los sigues
 * necesitando).
 */

export type Platform = "instagram" | "facebook" | "tiktok";
export type ContentType = "post" | "reel" | "story" | "carousel" | "video";
export type AccountRole = "business" | "creator" | "page";
export type AccountStatus = "active" | "expired" | "revoked";
export type RecommendationStatus = "pending" | "in_progress" | "published";
export type AlertType = "engagement_drop" | "no_posts_streak";
export type AlertSeverity = "warning" | "info";

export interface Database {
  public: {
    Tables: {
      brands: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          color?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["brands"]["Insert"]>;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          brand_id: string;
          platform: Platform;
          role: AccountRole;
          external_id: string;
          username: string | null;
          display_name: string | null;
          profile_image_url: string | null;
          access_token: string;
          // Solo TikTok (por ahora): el access token expira a las 24h y se
          // refresca activamente con esto. Meta lo deja en null.
          refresh_token: string | null;
          token_expires_at: string | null;
          parent_account_id: string | null;
          meta: Record<string, unknown>;
          status: AccountStatus;
          connected_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          platform: Platform;
          role: AccountRole;
          external_id: string;
          username?: string | null;
          display_name?: string | null;
          profile_image_url?: string | null;
          access_token: string;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          parent_account_id?: string | null;
          meta?: Record<string, unknown>;
          status?: AccountStatus;
          connected_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "accounts_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accounts_parent_account_id_fkey";
            columns: ["parent_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_sessions: {
        Row: {
          id: string;
          owner_id: string;
          brand_id: string;
          provider: Platform;
          user_access_token: string;
          available_pages: MetaAvailablePage[];
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          brand_id: string;
          provider?: Platform;
          user_access_token: string;
          available_pages?: MetaAvailablePage[];
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["oauth_sessions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "oauth_sessions_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      content: {
        Row: {
          id: string;
          account_id: string;
          external_id: string;
          type: ContentType;
          caption: string | null;
          media_url: string | null;
          thumbnail_url: string | null;
          permalink: string | null;
          published_at: string | null;
          expires_at: string | null;
          meta: Record<string, unknown>;
          first_seen_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          external_id: string;
          type: ContentType;
          caption?: string | null;
          media_url?: string | null;
          thumbnail_url?: string | null;
          permalink?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          meta?: Record<string, unknown>;
          first_seen_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["content"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "content_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      content_metrics: {
        Row: {
          id: string;
          content_id: string;
          captured_at: string;
          reach: number | null;
          impressions: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
          saves: number | null;
          metrics: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          content_id: string;
          captured_at?: string;
          reach?: number | null;
          impressions?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          saves?: number | null;
          metrics?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["content_metrics"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "content_metrics_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      audience_snapshot: {
        Row: {
          id: string;
          account_id: string;
          captured_at: string;
          followers: number | null;
          follows: number | null;
          media_count: number | null;
          demographics: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          account_id: string;
          captured_at?: string;
          followers?: number | null;
          follows?: number | null;
          media_count?: number | null;
          demographics?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["audience_snapshot"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "audience_snapshot_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendations: {
        Row: {
          id: string;
          brand_id: string;
          account_id: string | null;
          kind: string;
          title: string | null;
          body: string | null;
          data: Record<string, unknown>;
          status: RecommendationStatus;
          generated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          account_id?: string | null;
          kind: string;
          title?: string | null;
          body?: string | null;
          data?: Record<string, unknown>;
          status?: RecommendationStatus;
          generated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recommendations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "recommendations_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendations_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      campaigns: {
        Row: {
          id: string;
          brand_id: string;
          name: string;
          objective: string | null;
          color: string;
          start_date: string;
          end_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          name: string;
          objective?: string | null;
          color?: string;
          start_date: string;
          end_date: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      content_calendar: {
        Row: {
          id: string;
          brand_id: string;
          platform: Platform | null;
          scheduled_for: string | null;
          idea: string | null;
          status: string;
          source_rec_id: string | null;
          campaign_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          platform?: Platform | null;
          scheduled_for?: string | null;
          idea?: string | null;
          status?: string;
          source_rec_id?: string | null;
          campaign_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["content_calendar"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "content_calendar_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_calendar_source_rec_id_fkey";
            columns: ["source_rec_id"];
            isOneToOne: false;
            referencedRelation: "recommendations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_calendar_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_logs: {
        Row: {
          id: string;
          account_id: string | null;
          started_at: string;
          finished_at: string | null;
          status: string | null;
          items_synced: number;
          error: string | null;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          started_at?: string;
          finished_at?: string | null;
          status?: string | null;
          items_synced?: number;
          error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sync_logs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sync_logs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          id: string;
          brand_id: string;
          account_id: string;
          type: AlertType;
          severity: AlertSeverity;
          title: string;
          body: string;
          data: Record<string, unknown>;
          detected_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          account_id: string;
          type: AlertType;
          severity: AlertSeverity;
          title: string;
          body: string;
          data?: Record<string, unknown>;
          detected_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["alerts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "alerts_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      trends: {
        Row: {
          id: string;
          brand_id: string;
          topic: string;
          summary: string | null;
          source_url: string | null;
          data: Record<string, unknown>;
          captured_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          topic: string;
          summary?: string | null;
          source_url?: string | null;
          data?: Record<string, unknown>;
          captured_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["trends"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "trends_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          content_id: string;
          platform_comment_id: string;
          parent_comment_id: string | null;
          author_name: string | null;
          author_platform_id: string | null;
          text: string;
          like_count: number | null;
          commented_at: string | null;
          replied: boolean;
          is_business_reply: boolean;
          synced_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          platform_comment_id: string;
          parent_comment_id?: string | null;
          author_name?: string | null;
          author_platform_id?: string | null;
          text: string;
          like_count?: number | null;
          commented_at?: string | null;
          replied?: boolean;
          is_business_reply?: boolean;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["comments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "comments_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey";
            columns: ["parent_comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      platform_t: Platform;
      content_type_t: ContentType;
      account_role_t: AccountRole;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Una Page de Facebook disponible para el usuario de Meta autenticado. */
export interface MetaAvailablePage {
  page_id: string;
  page_name: string;
  page_access_token: string; // se cifra antes de persistir en accounts
  instagram_business_account_id?: string;
  instagram_username?: string;
  profile_picture_url?: string;
}
