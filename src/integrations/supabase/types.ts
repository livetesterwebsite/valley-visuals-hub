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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      points_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          description: string
          id: string
          order_id: string | null
          type: Database["public"]["Enums"]["loyalty_entry_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          description: string
          id?: string
          order_id?: string | null
          type: Database["public"]["Enums"]["loyalty_entry_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          description?: string
          id?: string
          order_id?: string | null
          type?: Database["public"]["Enums"]["loyalty_entry_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birthday: string | null
          created_at: string
          full_name: string
          id: string
          member_id: string
          phone: string | null
          referral_code: string
          referral_credited: boolean
          referred_by: string | null
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          full_name?: string
          id: string
          member_id: string
          phone?: string | null
          referral_code: string
          referral_credited?: boolean
          referred_by?: string | null
        }
        Update: {
          birthday?: string | null
          created_at?: string
          full_name?: string
          id?: string
          member_id?: string
          phone?: string | null
          referral_code?: string
          referral_credited?: boolean
          referred_by?: string | null
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          end_date: string
          id: string
          multiplier: number
          start_date: string
          title: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          multiplier: number
          start_date: string
          title: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          multiplier?: number
          start_date?: string
          title?: string
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          reward_id: string
          status: Database["public"]["Enums"]["redemption_status"]
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          reward_id: string
          status?: Database["public"]["Enums"]["redemption_status"]
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          reward_id?: string
          status?: Database["public"]["Enums"]["redemption_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          points_cost: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          points_cost: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          points_cost?: number
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_loyalty: { Args: never; Returns: Json }
      get_my_redemptions: {
        Args: never
        Returns: {
          r_code: string
          r_created_at: string
          r_expires_at: string
          r_id: string
          r_is_birthday: boolean
          r_reward_description: string
          r_reward_name: string
          r_status: Database["public"]["Enums"]["redemption_status"]
        }[]
      }
      get_my_referrals: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_redemption_used: { Args: { _code: string }; Returns: boolean }
      member_earned_12m: { Args: { _uid: string }; Returns: number }
      member_tier: { Args: { _uid: string }; Returns: string }
      redeem_reward: {
        Args: { _reward_id: string }
        Returns: {
          redemption_code: string
          redemption_expires_at: string
          redemption_id: string
        }[]
      }
      refresh_member: { Args: { _uid: string }; Returns: undefined }
      require_staff: { Args: never; Returns: undefined }
      set_my_birthday: { Args: { _birthday: string }; Returns: undefined }
      staff_award_purchase: {
        Args: { _amount: number; _member: string; _note: string }
        Returns: number
      }
      staff_lookup_member: {
        Args: { _query: string; _staff: string }
        Returns: {
          m_balance: number
          m_full_name: string
          m_member_id: string
          m_phone: string
          m_tier: string
          m_user_id: string
        }[]
      }
      staff_lookup_redemption: {
        Args: { _code: string; _staff: string }
        Returns: {
          r_code: string
          r_expires_at: string
          r_member_id: string
          r_member_name: string
          r_reward_name: string
          r_status: string
        }[]
      }
      staff_recent_awards: {
        Args: never
        Returns: {
          a_created_at: string
          a_delta: number
          a_description: string
          a_id: string
          a_member_id: string
          a_member_name: string
          a_type: Database["public"]["Enums"]["loyalty_entry_type"]
        }[]
      }
      staff_find_member: {
        Args: { _query: string }
        Returns: {
          balance: number
          full_name: string
          member_id: string
          phone: string
          tier: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "member" | "staff" | "admin"
      loyalty_entry_type:
        | "earn"
        | "redeem"
        | "bonus"
        | "birthday"
        | "referral"
        | "expire"
        | "adjustment"
      redemption_status: "pending" | "used" | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["member", "staff", "admin"],
      loyalty_entry_type: [
        "earn",
        "redeem",
        "bonus",
        "birthday",
        "referral",
        "expire",
        "adjustment",
      ],
      redemption_status: ["pending", "used", "expired"],
    },
  },
} as const
