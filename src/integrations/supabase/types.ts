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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          id: string
          message: string | null
          name: string
          phone: string
          preferred_date: string
          preferred_time: string
          service: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          name: string
          phone: string
          preferred_date: string
          preferred_time: string
          service: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string
          preferred_date?: string
          preferred_time?: string
          service?: string
          status?: string
        }
        Relationships: []
      }
      appraisal_responses: {
        Row: {
          absence_notification_evidence: string | null
          absence_notification_rating: number | null
          appraisal_id: string
          approved_leave_days: number | null
          attendance_overall_comments: string | null
          challenging_case_summary: string | null
          clinical_development_summary: string | null
          clinical_documentation_evidence: string | null
          clinical_documentation_rating: number | null
          clinical_knowledge_evidence: string | null
          clinical_knowledge_rating: number | null
          clinical_strength_summary: string | null
          compassion_empathy_evidence: string | null
          compassion_empathy_rating: number | null
          competency_responses: Json | null
          complaints_pending: number | null
          complaints_resolved: number | null
          created_at: string
          cultural_sensitivity_evidence: string | null
          cultural_sensitivity_rating: number | null
          days_present: number | null
          development_objectives: Json | null
          diagnostic_accuracy_evidence: string | null
          diagnostic_accuracy_rating: number | null
          early_departures: number | null
          emergency_response_evidence: string | null
          emergency_response_rating: number | null
          evaluator_id: string
          evaluator_role: string
          guidelines_adherence_evidence: string | null
          guidelines_adherence_rating: number | null
          id: string
          informed_consent_evidence: string | null
          informed_consent_rating: number | null
          kpi_responses: Json | null
          late_arrivals: number | null
          medication_management_evidence: string | null
          medication_management_rating: number | null
          oncall_compliance_evidence: string | null
          oncall_compliance_rating: number | null
          ontime_arrival_evidence: string | null
          ontime_arrival_rating: number | null
          patient_communication_evidence: string | null
          patient_communication_rating: number | null
          patient_complaints_count: number | null
          patient_reviews_count: number | null
          patient_satisfaction_score: number | null
          patient_satisfaction_source: string | null
          procedural_competence_evidence: string | null
          procedural_competence_rating: number | null
          response_complaints_evidence: string | null
          response_complaints_rating: number | null
          schedule_adherence_evidence: string | null
          schedule_adherence_rating: number | null
          section_b_score: number | null
          section_c_score: number | null
          section_d_score: number | null
          section_e_score: number | null
          status: string
          total_working_days: number | null
          treatment_planning_evidence: string | null
          treatment_planning_rating: number | null
          unapproved_absences: number | null
          updated_at: string
        }
        Insert: {
          absence_notification_evidence?: string | null
          absence_notification_rating?: number | null
          appraisal_id: string
          approved_leave_days?: number | null
          attendance_overall_comments?: string | null
          challenging_case_summary?: string | null
          clinical_development_summary?: string | null
          clinical_documentation_evidence?: string | null
          clinical_documentation_rating?: number | null
          clinical_knowledge_evidence?: string | null
          clinical_knowledge_rating?: number | null
          clinical_strength_summary?: string | null
          compassion_empathy_evidence?: string | null
          compassion_empathy_rating?: number | null
          competency_responses?: Json | null
          complaints_pending?: number | null
          complaints_resolved?: number | null
          created_at?: string
          cultural_sensitivity_evidence?: string | null
          cultural_sensitivity_rating?: number | null
          days_present?: number | null
          development_objectives?: Json | null
          diagnostic_accuracy_evidence?: string | null
          diagnostic_accuracy_rating?: number | null
          early_departures?: number | null
          emergency_response_evidence?: string | null
          emergency_response_rating?: number | null
          evaluator_id: string
          evaluator_role: string
          guidelines_adherence_evidence?: string | null
          guidelines_adherence_rating?: number | null
          id?: string
          informed_consent_evidence?: string | null
          informed_consent_rating?: number | null
          kpi_responses?: Json | null
          late_arrivals?: number | null
          medication_management_evidence?: string | null
          medication_management_rating?: number | null
          oncall_compliance_evidence?: string | null
          oncall_compliance_rating?: number | null
          ontime_arrival_evidence?: string | null
          ontime_arrival_rating?: number | null
          patient_communication_evidence?: string | null
          patient_communication_rating?: number | null
          patient_complaints_count?: number | null
          patient_reviews_count?: number | null
          patient_satisfaction_score?: number | null
          patient_satisfaction_source?: string | null
          procedural_competence_evidence?: string | null
          procedural_competence_rating?: number | null
          response_complaints_evidence?: string | null
          response_complaints_rating?: number | null
          schedule_adherence_evidence?: string | null
          schedule_adherence_rating?: number | null
          section_b_score?: number | null
          section_c_score?: number | null
          section_d_score?: number | null
          section_e_score?: number | null
          status?: string
          total_working_days?: number | null
          treatment_planning_evidence?: string | null
          treatment_planning_rating?: number | null
          unapproved_absences?: number | null
          updated_at?: string
        }
        Update: {
          absence_notification_evidence?: string | null
          absence_notification_rating?: number | null
          appraisal_id?: string
          approved_leave_days?: number | null
          attendance_overall_comments?: string | null
          challenging_case_summary?: string | null
          clinical_development_summary?: string | null
          clinical_documentation_evidence?: string | null
          clinical_documentation_rating?: number | null
          clinical_knowledge_evidence?: string | null
          clinical_knowledge_rating?: number | null
          clinical_strength_summary?: string | null
          compassion_empathy_evidence?: string | null
          compassion_empathy_rating?: number | null
          competency_responses?: Json | null
          complaints_pending?: number | null
          complaints_resolved?: number | null
          created_at?: string
          cultural_sensitivity_evidence?: string | null
          cultural_sensitivity_rating?: number | null
          days_present?: number | null
          development_objectives?: Json | null
          diagnostic_accuracy_evidence?: string | null
          diagnostic_accuracy_rating?: number | null
          early_departures?: number | null
          emergency_response_evidence?: string | null
          emergency_response_rating?: number | null
          evaluator_id?: string
          evaluator_role?: string
          guidelines_adherence_evidence?: string | null
          guidelines_adherence_rating?: number | null
          id?: string
          informed_consent_evidence?: string | null
          informed_consent_rating?: number | null
          kpi_responses?: Json | null
          late_arrivals?: number | null
          medication_management_evidence?: string | null
          medication_management_rating?: number | null
          oncall_compliance_evidence?: string | null
          oncall_compliance_rating?: number | null
          ontime_arrival_evidence?: string | null
          ontime_arrival_rating?: number | null
          patient_communication_evidence?: string | null
          patient_communication_rating?: number | null
          patient_complaints_count?: number | null
          patient_reviews_count?: number | null
          patient_satisfaction_score?: number | null
          patient_satisfaction_source?: string | null
          procedural_competence_evidence?: string | null
          procedural_competence_rating?: number | null
          response_complaints_evidence?: string | null
          response_complaints_rating?: number | null
          schedule_adherence_evidence?: string | null
          schedule_adherence_rating?: number | null
          section_b_score?: number | null
          section_c_score?: number | null
          section_d_score?: number | null
          section_e_score?: number | null
          status?: string
          total_working_days?: number | null
          treatment_planning_evidence?: string | null
          treatment_planning_rating?: number | null
          unapproved_absences?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appraisal_responses_appraisal_id_fkey"
            columns: ["appraisal_id"]
            isOneToOne: false
            referencedRelation: "performance_appraisals"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          accuracy_meters: number | null
          created_at: string
          face_verified: boolean
          id: string
          latitude: number | null
          longitude: number | null
          punch_time: string
          punch_type: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          accuracy_meters?: number | null
          created_at?: string
          face_verified?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          punch_time?: string
          punch_type: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          accuracy_meters?: number | null
          created_at?: string
          face_verified?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          punch_time?: string
          punch_type?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "geofence_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          name_en: string | null
          name_ms: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_en?: string | null
          name_ms?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_en?: string | null
          name_ms?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category_id: string | null
          content: string
          content_en: string | null
          content_ms: string | null
          created_at: string
          excerpt_en: string | null
          excerpt_ms: string | null
          featured_image: string | null
          id: string
          published: boolean
          published_at: string | null
          reading_time: number | null
          scheduled_at: string | null
          slug: string
          title: string
          title_en: string | null
          title_ms: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content: string
          content_en?: string | null
          content_ms?: string | null
          created_at?: string
          excerpt_en?: string | null
          excerpt_ms?: string | null
          featured_image?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          reading_time?: number | null
          scheduled_at?: string | null
          slug: string
          title: string
          title_en?: string | null
          title_ms?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content?: string
          content_en?: string | null
          content_ms?: string | null
          created_at?: string
          excerpt_en?: string | null
          excerpt_ms?: string | null
          featured_image?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          reading_time?: number | null
          scheduled_at?: string | null
          slug?: string
          title?: string
          title_en?: string | null
          title_ms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_transcripts: {
        Row: {
          additional_notes: string | null
          allergies: string | null
          assessment: string | null
          chief_complaint: string | null
          created_at: string
          examination_findings: string | null
          family_history: string | null
          history_present_illness: string | null
          id: string
          is_finalized: boolean | null
          past_medical_history: string | null
          plan: string | null
          raw_transcript: Json | null
          room_id: string
          social_history: string | null
          updated_at: string
        }
        Insert: {
          additional_notes?: string | null
          allergies?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          examination_findings?: string | null
          family_history?: string | null
          history_present_illness?: string | null
          id?: string
          is_finalized?: boolean | null
          past_medical_history?: string | null
          plan?: string | null
          raw_transcript?: Json | null
          room_id: string
          social_history?: string | null
          updated_at?: string
        }
        Update: {
          additional_notes?: string | null
          allergies?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          examination_findings?: string | null
          family_history?: string | null
          history_present_illness?: string | null
          id?: string
          is_finalized?: boolean | null
          past_medical_history?: string | null
          plan?: string | null
          raw_transcript?: Json | null
          room_id?: string
          social_history?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_transcripts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "video_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_images: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          id: string
          tags: string[] | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          tags?: string[] | null
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          tags?: string[] | null
          url?: string
        }
        Relationships: []
      }
      geofence_zones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          radius_meters: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          radius_meters?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          radius_meters?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_appraisals: {
        Row: {
          appraisal_period_from: string
          appraisal_period_to: string
          appraisal_type: string
          created_at: string
          created_by: string
          date_of_appraisal: string | null
          doctor_id: string
          id: string
          overall_weighted_score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          appraisal_period_from: string
          appraisal_period_to: string
          appraisal_type?: string
          created_at?: string
          created_by: string
          date_of_appraisal?: string | null
          doctor_id: string
          id?: string
          overall_weighted_score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          appraisal_period_from?: string
          appraisal_period_to?: string
          appraisal_type?: string
          created_at?: string
          created_by?: string
          date_of_appraisal?: string | null
          doctor_id?: string
          id?: string
          overall_weighted_score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_appraisals_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name_en: string | null
          name_ms: string
          published: boolean
          rating: number
          text_en: string | null
          text_ms: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name_en?: string | null
          name_ms: string
          published?: boolean
          rating: number
          text_en?: string | null
          text_ms: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name_en?: string | null
          name_ms?: string
          published?: boolean
          rating?: number
          text_en?: string | null
          text_ms?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_rosters: {
        Row: {
          created_at: string
          created_by: string
          id: string
          month: number
          roster_data: Json
          roster_type: string
          staff_list: Json
          updated_at: string
          warnings: Json
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          month: number
          roster_data?: Json
          roster_type: string
          staff_list?: Json
          updated_at?: string
          warnings?: Json
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          month?: number
          roster_data?: Json
          roster_type?: string
          staff_list?: Json
          updated_at?: string
          warnings?: Json
          year?: number
        }
        Relationships: []
      }
      staff_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          related_task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          related_task_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          related_task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_notifications_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "staff_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_tasks: {
        Row: {
          assigned_to: string
          color: string
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          end_date: string | null
          id: string
          is_completed: boolean
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          color?: string
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_completed?: boolean
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          color?: string
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_completed?: boolean
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_zone_assignments: {
        Row: {
          created_at: string
          days_of_week: number[]
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          user_id: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          user_id: string
          zone_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          user_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_zone_assignments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "geofence_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      task_delete_requests: {
        Row: {
          created_at: string
          id: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_delete_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "staff_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          bio_en: string | null
          bio_ms: string | null
          created_at: string
          display_order: number | null
          expertise_en: string[] | null
          expertise_ms: string[] | null
          id: string
          is_active: boolean | null
          name_en: string
          name_ms: string
          photo_url: string | null
          qualifications: string[] | null
          title_en: string | null
          title_ms: string | null
          type: string
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          bio_en?: string | null
          bio_ms?: string | null
          created_at?: string
          display_order?: number | null
          expertise_en?: string[] | null
          expertise_ms?: string[] | null
          id?: string
          is_active?: boolean | null
          name_en: string
          name_ms: string
          photo_url?: string | null
          qualifications?: string[] | null
          title_en?: string | null
          title_ms?: string | null
          type: string
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          bio_en?: string | null
          bio_ms?: string | null
          created_at?: string
          display_order?: number | null
          expertise_en?: string[] | null
          expertise_ms?: string[] | null
          id?: string
          is_active?: boolean | null
          name_en?: string
          name_ms?: string
          photo_url?: string | null
          qualifications?: string[] | null
          title_en?: string | null
          title_ms?: string | null
          type?: string
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_type: string
          room_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_type: string
          room_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_type?: string
          room_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_payments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "video_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      video_rooms: {
        Row: {
          call_ended_at: string | null
          call_started_at: string | null
          created_at: string
          created_by: string | null
          current_offer: Json | null
          deposit_amount: number
          ice_candidates: Json | null
          id: string
          notes: string | null
          patient_email: string | null
          patient_name: string
          patient_phone: string
          per_minute_rate: number
          room_code: string
          sdp_answer: Json | null
          sdp_offer: Json | null
          status: string
          total_amount: number | null
          total_duration_seconds: number | null
          updated_at: string
        }
        Insert: {
          call_ended_at?: string | null
          call_started_at?: string | null
          created_at?: string
          created_by?: string | null
          current_offer?: Json | null
          deposit_amount?: number
          ice_candidates?: Json | null
          id?: string
          notes?: string | null
          patient_email?: string | null
          patient_name: string
          patient_phone: string
          per_minute_rate?: number
          room_code: string
          sdp_answer?: Json | null
          sdp_offer?: Json | null
          status?: string
          total_amount?: number | null
          total_duration_seconds?: number | null
          updated_at?: string
        }
        Update: {
          call_ended_at?: string | null
          call_started_at?: string | null
          created_at?: string
          created_by?: string | null
          current_offer?: Json | null
          deposit_amount?: number
          ice_candidates?: Json | null
          id?: string
          notes?: string | null
          patient_email?: string | null
          patient_name?: string
          patient_phone?: string
          per_minute_rate?: number
          room_code?: string
          sdp_answer?: Json | null
          sdp_offer?: Json | null
          status?: string
          total_amount?: number | null
          total_duration_seconds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff" | "guest"
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
      app_role: ["admin", "staff", "guest"],
    },
  },
} as const
