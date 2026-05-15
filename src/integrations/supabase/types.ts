export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _imp_auth_identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json | null
          last_sign_in_at: string | null
          provider: string | null
          provider_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          identity_data?: Json | null
          last_sign_in_at?: string | null
          provider?: string | null
          provider_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json | null
          last_sign_in_at?: string | null
          provider?: string | null
          provider_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _imp_auth_users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean | null
          is_sso_user: boolean | null
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean | null
          is_sso_user?: boolean | null
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean | null
          is_sso_user?: boolean | null
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _imp_coin_balances: {
        Row: {
          balance: number | null
          id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          balance?: number | null
          id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          balance?: number | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _imp_coin_orders: {
        Row: {
          coin_amount: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          package_id: string | null
          payment_gateway_order_id: string | null
          payment_method: string | null
          payment_proof_url: string | null
          phone: string | null
          price: string | null
          short_id: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          coin_amount?: number | null
          created_at?: string | null
          expires_at?: string | null
          id: string
          package_id?: string | null
          payment_gateway_order_id?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          phone?: string | null
          price?: string | null
          short_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          coin_amount?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          package_id?: string | null
          payment_gateway_order_id?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          phone?: string | null
          price?: string | null
          short_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _imp_coin_transactions: {
        Row: {
          amount: number | null
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          description?: string | null
          id: string
          reference_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _imp_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      active_show_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_show_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "active_show_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      active_show_tokens: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          max_devices: number
          revoked: boolean
          show_id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          max_devices?: number
          revoked?: boolean
          show_id: string
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          max_devices?: number
          revoked?: boolean
          show_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_show_tokens_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "active_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      active_shows: {
        Row: {
          admin_alias: string | null
          category: string
          created_at: string
          description: string
          id: string
          image_url: string
          is_active: boolean
          is_live: boolean
          lineup: string[]
          live_auto_schedule: boolean
          live_password: string
          live_require_password: boolean
          live_sources: Json
          live_type: string
          live_url: string
          pakasir_amount: number
          price_replay: number
          price_replay_coins: number
          price_show: number
          price_show_coins: number
          replay_enabled: boolean
          replay_id: string | null
          replay_m3u8_url: string
          replay_mode: boolean
          replay_youtube_url: string
          show_date: string
          show_time: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          admin_alias?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string
          is_active?: boolean
          is_live?: boolean
          lineup?: string[]
          live_auto_schedule?: boolean
          live_password?: string
          live_require_password?: boolean
          live_sources?: Json
          live_type?: string
          live_url?: string
          pakasir_amount?: number
          price_replay?: number
          price_replay_coins?: number
          price_show?: number
          price_show_coins?: number
          replay_enabled?: boolean
          replay_id?: string | null
          replay_m3u8_url?: string
          replay_mode?: boolean
          replay_youtube_url?: string
          show_date: string
          show_time?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          admin_alias?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string
          is_active?: boolean
          is_live?: boolean
          lineup?: string[]
          live_auto_schedule?: boolean
          live_password?: string
          live_require_password?: boolean
          live_sources?: Json
          live_type?: string
          live_url?: string
          pakasir_amount?: number
          price_replay?: number
          price_replay_coins?: number
          price_show?: number
          price_show_coins?: number
          replay_enabled?: boolean
          replay_id?: string | null
          replay_m3u8_url?: string
          replay_mode?: boolean
          replay_youtube_url?: string
          show_date?: string
          show_time?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      blocked_browsers: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          reason: string
          unblocked: boolean
          updated_at: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          reason?: string
          unblocked?: boolean
          updated_at?: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          reason?: string
          unblocked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bot_admins: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_commands: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          id: string
          is_dynamic: boolean
          response_template: string
          sort_order: number
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          is_dynamic?: boolean
          response_template?: string
          sort_order?: number
          trigger: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          is_dynamic?: boolean
          response_template?: string
          sort_order?: number
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_inbox_dedup: {
        Row: {
          id: string
          message_hash: string
          phone: string
          received_at: string
        }
        Insert: {
          id?: string
          message_hash: string
          phone: string
          received_at?: string
        }
        Update: {
          id?: string
          message_hash?: string
          phone?: string
          received_at?: string
        }
        Relationships: []
      }
      bot_inbox_events: {
        Row: {
          command: string | null
          created_at: string
          detail: Json | null
          device: string | null
          event_name: string
          from_me: boolean | null
          id: string
          inbox_id: string | null
          message: string | null
          phone: string | null
        }
        Insert: {
          command?: string | null
          created_at?: string
          detail?: Json | null
          device?: string | null
          event_name: string
          from_me?: boolean | null
          id?: string
          inbox_id?: string | null
          message?: string | null
          phone?: string | null
        }
        Update: {
          command?: string | null
          created_at?: string
          detail?: Json | null
          device?: string | null
          event_name?: string
          from_me?: boolean | null
          id?: string
          inbox_id?: string | null
          message?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      bot_rate_limit: {
        Row: {
          last_sent_at: string
          phone: string
        }
        Insert: {
          last_sent_at?: string
          phone: string
        }
        Update: {
          last_sent_at?: string
          phone?: string
        }
        Relationships: []
      }
      chat_blocks: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          last_name: string
          reason: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          last_name?: string
          reason?: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          last_name?: string
          reason?: string
        }
        Relationships: []
      }
      coin_balances: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coin_packages: {
        Row: {
          coins: number
          created_at: string
          enabled: boolean
          id: string
          label: string
          price_idr: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          coins?: number
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          price_idr?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          coins?: number
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          price_idr?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      coin_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          meta: Json
          reason: string
          related_order_id: string | null
          related_replay_id: string | null
          related_show_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          meta?: Json
          reason: string
          related_order_id?: string | null
          related_replay_id?: string | null
          related_show_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          meta?: Json
          reason?: string
          related_order_id?: string | null
          related_replay_id?: string | null
          related_show_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          created_at: string
          id: string
          message: string
          name: string
          replay_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          name?: string
          replay_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          name?: string
          replay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_replay_id_fkey"
            columns: ["replay_id"]
            isOneToOne: false
            referencedRelation: "replays"
            referencedColumns: ["id"]
          },
        ]
      }
      live_config_private: {
        Row: {
          enabled: boolean
          id: string
          lineup: string[]
          password: string
          require_password: boolean
          sources: Json
          title: string
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          lineup?: string[]
          password?: string
          require_password?: boolean
          sources?: Json
          title?: string
          type?: string
          updated_at?: string
          url?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          lineup?: string[]
          password?: string
          require_password?: boolean
          sources?: Json
          title?: string
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      live_messages: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          is_admin: boolean
          message: string
          name: string
          pinned: boolean
          reply_to_id: string | null
        }
        Insert: {
          browser_id?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          message: string
          name?: string
          pinned?: boolean
          reply_to_id?: string | null
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          message?: string
          name?: string
          pinned?: boolean
          reply_to_id?: string | null
        }
        Relationships: []
      }
      live_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "live_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      live_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          max_devices: number
          revoked: boolean
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          max_devices?: number
          revoked?: boolean
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          max_devices?: number
          revoked?: boolean
          token?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          id: string
          identifier: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: string
          identifier: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          id?: string
          identifier?: string
          success?: boolean
        }
        Relationships: []
      }
      master_passwords: {
        Row: {
          created_at: string
          id: string
          month: string
          password: string
          paused: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          password: string
          paused?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          password?: string
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          created_at: string
          id: string
          name: string
          photo_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          photo_url?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          photo_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          last_seen: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          last_seen?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          last_seen?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "membership_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tokens: {
        Row: {
          created_at: string
          created_by: string
          duration_days: number
          expires_at: string
          id: string
          includes_replays: boolean
          label: string
          manual_resets_max: number
          manual_resets_used: number
          max_devices: number
          password: string
          phone: string
          revoked: boolean
          starts_at: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          duration_days?: number
          expires_at: string
          id?: string
          includes_replays?: boolean
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          password?: string
          phone?: string
          revoked?: boolean
          starts_at?: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_days?: number
          expires_at?: string
          id?: string
          includes_replays?: boolean
          label?: string
          manual_resets_max?: number
          manual_resets_used?: number
          max_devices?: number
          password?: string
          phone?: string
          revoked?: boolean
          starts_at?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          access_token: string | null
          amount: number
          coin_amount: number
          coin_package_id: string | null
          created_at: string
          id: string
          item_title: string
          kind: string
          paid_at: string | null
          pakasir_order_id: string | null
          pakasir_qr_url: string
          replay_id: string | null
          show_id: string | null
          status: string
          token_sent_at: string | null
          updated_at: string
          user_id: string | null
          user_phone: string
        }
        Insert: {
          access_token?: string | null
          amount?: number
          coin_amount?: number
          coin_package_id?: string | null
          created_at?: string
          id?: string
          item_title?: string
          kind?: string
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          replay_id?: string | null
          show_id?: string | null
          status?: string
          token_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
          user_phone: string
        }
        Update: {
          access_token?: string | null
          amount?: number
          coin_amount?: number
          coin_package_id?: string | null
          created_at?: string
          id?: string
          item_title?: string
          kind?: string
          paid_at?: string | null
          pakasir_order_id?: string | null
          pakasir_qr_url?: string
          replay_id?: string | null
          show_id?: string | null
          status?: string
          token_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
          user_phone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      ratings: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          rating: number
          replay_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          rating: number
          replay_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          rating?: number
          replay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_replay_id_fkey"
            columns: ["replay_id"]
            isOneToOne: false
            referencedRelation: "replays"
            referencedColumns: ["id"]
          },
        ]
      }
      replay_personal_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          max_devices: number
          replay_id: string
          revoked: boolean
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          max_devices?: number
          replay_id: string
          revoked?: boolean
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          max_devices?: number
          replay_id?: string
          revoked?: boolean
          token?: string
        }
        Relationships: []
      }
      replay_token_devices: {
        Row: {
          browser_id: string
          created_at: string
          id: string
          token_id: string
        }
        Insert: {
          browser_id: string
          created_at?: string
          id?: string
          token_id: string
        }
        Update: {
          browser_id?: string
          created_at?: string
          id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replay_token_devices_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "replay_personal_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      replays: {
        Row: {
          access_token: string | null
          admin_alias: string
          created_at: string
          criteria: string
          date: string
          featured_member: string
          id: string
          image_url: string
          lineup: string[]
          m3u8_url: string
          password: string
          price_coins: number
          show_name: string
          show_time: string | null
          source_type: string
          sources: Json
          title: string
          updated_at: string
          view_count: number
          youtube_id: string
        }
        Insert: {
          access_token?: string | null
          admin_alias?: string
          created_at?: string
          criteria?: string
          date: string
          featured_member?: string
          id?: string
          image_url?: string
          lineup?: string[]
          m3u8_url?: string
          password: string
          price_coins?: number
          show_name?: string
          show_time?: string | null
          source_type?: string
          sources?: Json
          title: string
          updated_at?: string
          view_count?: number
          youtube_id?: string
        }
        Update: {
          access_token?: string | null
          admin_alias?: string
          created_at?: string
          criteria?: string
          date?: string
          featured_member?: string
          id?: string
          image_url?: string
          lineup?: string[]
          m3u8_url?: string
          password?: string
          price_coins?: number
          show_name?: string
          show_time?: string | null
          source_type?: string
          sources?: Json
          title?: string
          updated_at?: string
          view_count?: number
          youtube_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      token_deliveries: {
        Row: {
          access_token: string
          id: string
          link: string
          order_id: string | null
          phone: string
          replay_id: string | null
          replay_title: string
          requested_by: string
          sent_at: string
          source: string
        }
        Insert: {
          access_token: string
          id?: string
          link?: string
          order_id?: string | null
          phone: string
          replay_id?: string | null
          replay_title?: string
          requested_by?: string
          sent_at?: string
          source?: string
        }
        Update: {
          access_token?: string
          id?: string
          link?: string
          order_id?: string | null
          phone?: string
          replay_id?: string | null
          replay_title?: string
          requested_by?: string
          sent_at?: string
          source?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wa_outbox: {
        Row: {
          created_at: string
          error: string | null
          fonnte_response: Json | null
          id: string
          message: string
          phone: string
          related_order_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          fonnte_response?: Json | null
          id?: string
          message: string
          phone: string
          related_order_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          fonnte_response?: Json | null
          id?: string
          message?: string
          phone?: string
          related_order_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_outbox_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_clear_live_messages: { Args: never; Returns: number }
      check_login_lock: {
        Args: { _identifier: string }
        Returns: {
          fail_count: number
          locked: boolean
          seconds_remaining: number
        }[]
      }
      cron_clear_live_messages: { Args: never; Returns: undefined }
      debit_coins_for_purchase: {
        Args: {
          _meta?: Json
          _price: number
          _reason: string
          _replay_id: string
          _show_id: string
          _user_id: string
        }
        Returns: number
      }
      email_for_phone: { Args: { _phone: string }; Returns: string }
      get_active_live: {
        Args: never
        Returns: {
          category: string
          id: string
          image_url: string
          is_live: boolean
          lineup: string[]
          live_auto_schedule: boolean
          live_require_password: boolean
          live_sources: Json
          live_type: string
          replay_mode: boolean
          show_date: string
          show_time: string
          title: string
        }[]
      }
      get_live_status: {
        Args: never
        Returns: {
          enabled: boolean
          lineup: string[]
          require_password: boolean
          sources: Json
          title: string
          type: string
        }[]
      }
      grant_coins: {
        Args: {
          _delta: number
          _meta?: Json
          _order_id?: string
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_view_count: { Args: { _replay_id: string }; Returns: number }
      phone_exists: { Args: { _phone: string }; Returns: boolean }
      rate_replay: {
        Args: { _browser_id: string; _rating: number; _replay_id: string }
        Returns: undefined
      }
      record_login_attempt: {
        Args: { _identifier: string; _success: boolean }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
