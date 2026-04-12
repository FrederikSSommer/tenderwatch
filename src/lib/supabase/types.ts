/* eslint-disable @typescript-eslint/no-explicit-any */
export type Database = {
  public: {
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
    Tables: {
      companies: {
        Row: {
          id: string
          user_id: string
          name: string
          industry: string | null
          country_code: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          industry?: string | null
          country_code?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          industry?: string | null
          country_code?: string
          created_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: 'free' | 'starter' | 'professional' | 'team'
          status: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'free' | 'starter' | 'professional' | 'team'
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'free' | 'starter' | 'professional' | 'team'
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_profiles: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          cpv_codes: string[]
          keywords: string[]
          exclude_keywords: string[]
          countries: string[]
          min_value_eur: number | null
          max_value_eur: number | null
          procedure_types: string[]
          active: boolean
          notify_email: boolean
          notify_push: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name?: string
          description?: string | null
          cpv_codes?: string[]
          keywords?: string[]
          exclude_keywords?: string[]
          countries?: string[]
          min_value_eur?: number | null
          max_value_eur?: number | null
          procedure_types?: string[]
          active?: boolean
          notify_email?: boolean
          notify_push?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          cpv_codes?: string[]
          keywords?: string[]
          exclude_keywords?: string[]
          countries?: string[]
          min_value_eur?: number | null
          max_value_eur?: number | null
          procedure_types?: string[]
          active?: boolean
          notify_email?: boolean
          notify_push?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenders: {
        Row: {
          id: string
          source: 'ted' | 'mitudbud'
          external_id: string
          title: string
          description: string | null
          buyer_name: string | null
          buyer_country: string | null
          cpv_codes: string[]
          procedure_type: string | null
          tender_type: string | null
          estimated_value_eur: number | null
          currency: string
          submission_deadline: string | null
          publication_date: string
          document_url: string | null
          ted_url: string | null
          language: string
          ai_summary: string | null
          ai_summary_generated_at: string | null
          raw_data: any | null
          created_at: string
        }
        Insert: {
          id?: string
          source: 'ted' | 'mitudbud'
          external_id: string
          title: string
          description?: string | null
          buyer_name?: string | null
          buyer_country?: string | null
          cpv_codes?: string[]
          procedure_type?: string | null
          tender_type?: string | null
          estimated_value_eur?: number | null
          currency?: string
          submission_deadline?: string | null
          publication_date: string
          document_url?: string | null
          ted_url?: string | null
          language?: string
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          raw_data?: any | null
          created_at?: string
        }
        Update: {
          id?: string
          source?: 'ted' | 'mitudbud'
          external_id?: string
          title?: string
          description?: string | null
          buyer_name?: string | null
          buyer_country?: string | null
          cpv_codes?: string[]
          procedure_type?: string | null
          tender_type?: string | null
          estimated_value_eur?: number | null
          currency?: string
          submission_deadline?: string | null
          publication_date?: string
          document_url?: string | null
          ted_url?: string | null
          language?: string
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          raw_data?: any | null
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          tender_id: string
          profile_id: string
          user_id: string
          relevance_score: number
          matched_cpv: string[]
          matched_keywords: string[]
          ai_reason: string | null
          notified: boolean
          notified_at: string | null
          seen: boolean
          bookmarked: boolean
          dismissed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tender_id: string
          profile_id: string
          user_id: string
          relevance_score: number
          matched_cpv?: string[]
          matched_keywords?: string[]
          ai_reason?: string | null
          notified?: boolean
          notified_at?: string | null
          seen?: boolean
          bookmarked?: boolean
          dismissed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tender_id?: string
          profile_id?: string
          user_id?: string
          relevance_score?: number
          matched_cpv?: string[]
          matched_keywords?: string[]
          ai_reason?: string | null
          notified?: boolean
          notified_at?: string | null
          seen?: boolean
          bookmarked?: boolean
          dismissed?: boolean
          created_at?: string
        }
        Relationships: []
      }
      followed_buyers: {
        Row: {
          id: string
          user_id: string
          buyer_name: string
          buyer_country: string | null
          ted_search_term: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          buyer_name: string
          buyer_country?: string | null
          ted_search_term?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          buyer_name?: string
          buyer_country?: string | null
          ted_search_term?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          channel: 'email' | 'push'
          tender_count: number
          sent_at: string
        }
        Insert: {
          id?: string
          user_id: string
          channel: 'email' | 'push'
          tender_count: number
          sent_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          channel?: 'email' | 'push'
          tender_count?: number
          sent_at?: string
        }
        Relationships: []
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
