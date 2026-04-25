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
      appointment_submission_log: {
        Row: {
          created_at: string
          id: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string
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
      attendance_payroll_records: {
        Row: {
          actual_clock_in: string | null
          actual_clock_out: string | null
          approved_overtime_hours: number | null
          created_at: string | null
          date: string
          id: string
          late_minutes: number | null
          overtime_hours: number | null
          payable_day: boolean | null
          payroll_locked: boolean | null
          remarks: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          shift_assigned: string | null
          total_worked_hours: number | null
          unpaid_leave: boolean | null
          user_id: string
          working_status: string | null
        }
        Insert: {
          actual_clock_in?: string | null
          actual_clock_out?: string | null
          approved_overtime_hours?: number | null
          created_at?: string | null
          date: string
          id?: string
          late_minutes?: number | null
          overtime_hours?: number | null
          payable_day?: boolean | null
          payroll_locked?: boolean | null
          remarks?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          shift_assigned?: string | null
          total_worked_hours?: number | null
          unpaid_leave?: boolean | null
          user_id: string
          working_status?: string | null
        }
        Update: {
          actual_clock_in?: string | null
          actual_clock_out?: string | null
          approved_overtime_hours?: number | null
          created_at?: string | null
          date?: string
          id?: string
          late_minutes?: number | null
          overtime_hours?: number | null
          payable_day?: boolean | null
          payroll_locked?: boolean | null
          remarks?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          shift_assigned?: string | null
          total_worked_hours?: number | null
          unpaid_leave?: boolean | null
          user_id?: string
          working_status?: string | null
        }
        Relationships: []
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
      circular_notice_acknowledgements: {
        Row: {
          acknowledged_at: string
          id: string
          notice_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          notice_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          notice_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circular_notice_acknowledgements_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "circular_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      circular_notices: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          priority: string
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinic_appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          created_at: string
          doctor_id: string | null
          id: string
          notes: string | null
          patient_id: string
          status: Database["public"]["Enums"]["clinic_appointment_status"]
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["clinic_appointment_status"]
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["clinic_appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_feedback_form_fields: {
        Row: {
          created_at: string
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      clinic_preferences: {
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
      clinic_reviews: {
        Row: {
          created_at: string
          google_review_id: string | null
          google_synced: boolean
          id: string
          patient_id: string | null
          patient_name: string
          rating: number
          review_text: string | null
          source: string
          status: string
          whatsapp_sent: boolean
        }
        Insert: {
          created_at?: string
          google_review_id?: string | null
          google_synced?: boolean
          id?: string
          patient_id?: string | null
          patient_name: string
          rating: number
          review_text?: string | null
          source?: string
          status?: string
          whatsapp_sent?: boolean
        }
        Update: {
          created_at?: string
          google_review_id?: string | null
          google_synced?: boolean
          id?: string
          patient_id?: string | null
          patient_name?: string
          rating?: number
          review_text?: string | null
          source?: string
          status?: string
          whatsapp_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clinic_reviews_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_items: {
        Row: {
          consultation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          dosage: string | null
          dosage_qty: number | null
          dosage_unit: string | null
          duration: string | null
          frequency: string | null
          id: string
          indication: string | null
          instruction: string | null
          item_id: string | null
          item_name: string
          package_id: string | null
          precaution: string | null
          price: number
          price_tier: string | null
          quantity: number
          service_id: string | null
          unit_cost: number
        }
        Insert: {
          consultation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          dosage?: string | null
          dosage_qty?: number | null
          dosage_unit?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          indication?: string | null
          instruction?: string | null
          item_id?: string | null
          item_name: string
          package_id?: string | null
          precaution?: string | null
          price?: number
          price_tier?: string | null
          quantity?: number
          service_id?: string | null
          unit_cost?: number
        }
        Update: {
          consultation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          dosage?: string | null
          dosage_qty?: number | null
          dosage_unit?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          indication?: string | null
          instruction?: string | null
          item_id?: string | null
          item_name?: string
          package_id?: string | null
          precaution?: string | null
          price?: number
          price_tier?: string | null
          quantity?: number
          service_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultation_items_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
      consultations: {
        Row: {
          case_note: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          diagnosis_id: string | null
          diagnosis_text: string
          dispense_note: string
          doctor_id: string
          id: string
          patient_id: string
          queue_entry_id: string
          status: string
          updated_at: string
        }
        Insert: {
          case_note?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          diagnosis_id?: string | null
          diagnosis_text?: string
          dispense_note?: string
          doctor_id: string
          id?: string
          patient_id: string
          queue_entry_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          case_note?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          diagnosis_id?: string | null
          diagnosis_text?: string
          dispense_note?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          queue_entry_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_diagnosis_id_fkey"
            columns: ["diagnosis_id"]
            isOneToOne: false
            referencedRelation: "diagnoses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "insight_financials_view"
            referencedColumns: ["queue_entry_id"]
          },
          {
            foreignKeyName: "consultations_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          briefing_selfie_url: string | null
          created_at: string
          evening_selfie_url: string | null
          id: string
          report_date: string
          stock_photo_1_url: string | null
          stock_photo_2_url: string | null
          updated_at: string
          user_id: string
          whatsapp_blast_count: number | null
        }
        Insert: {
          briefing_selfie_url?: string | null
          created_at?: string
          evening_selfie_url?: string | null
          id?: string
          report_date?: string
          stock_photo_1_url?: string | null
          stock_photo_2_url?: string | null
          updated_at?: string
          user_id: string
          whatsapp_blast_count?: number | null
        }
        Update: {
          briefing_selfie_url?: string | null
          created_at?: string
          evening_selfie_url?: string | null
          id?: string
          report_date?: string
          stock_photo_1_url?: string | null
          stock_photo_2_url?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_blast_count?: number | null
        }
        Relationships: []
      }
      diagnoses: {
        Row: {
          created_at: string
          group_category: string
          icd10_code: string | null
          id: string
          is_active: boolean
          name: string
          search_aliases: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_category?: string
          icd10_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          search_aliases?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_category?: string
          icd10_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          search_aliases?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      diagnoses_backup_20260425: {
        Row: {
          created_at: string | null
          group_category: string | null
          icd10_code: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          search_aliases: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_category?: string | null
          icd10_code?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          search_aliases?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_category?: string | null
          icd10_code?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          search_aliases?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      doctors: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          on_duty: boolean
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name: string
          on_duty?: boolean
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          on_duty?: boolean
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_doctors_profile"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_credentials: {
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
      einvoices: {
        Row: {
          consultation_id: string | null
          created_at: string
          error_details: Json | null
          id: string
          invoice_data: Json | null
          lhdn_long_id: string | null
          lhdn_uuid: string | null
          queue_entry_id: string
          status: string
          submission_uid: string | null
          updated_at: string
        }
        Insert: {
          consultation_id?: string | null
          created_at?: string
          error_details?: Json | null
          id?: string
          invoice_data?: Json | null
          lhdn_long_id?: string | null
          lhdn_uuid?: string | null
          queue_entry_id: string
          status?: string
          submission_uid?: string | null
          updated_at?: string
        }
        Update: {
          consultation_id?: string | null
          created_at?: string
          error_details?: Json | null
          id?: string
          invoice_data?: Json | null
          lhdn_long_id?: string | null
          lhdn_uuid?: string | null
          queue_entry_id?: string
          status?: string
          submission_uid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "einvoices_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "insight_financials_view"
            referencedColumns: ["queue_entry_id"]
          },
          {
            foreignKeyName: "einvoices_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
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
      google_business_tokens: {
        Row: {
          access_token: string
          business_account_id: string | null
          created_at: string
          expires_at: string
          id: string
          location_name: string | null
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          business_account_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          location_name?: string | null
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          business_account_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          location_name?: string | null
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      insurance_providers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          claim_due_date_type: string | null
          company_name: string | null
          company_reg_number: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          panel_code: string | null
          panel_type: string
          person_in_charge: string | null
          phone: string | null
          postcode: string | null
          price_tier: string | null
          state: string | null
          status: string
          submission_preference: string
          tin_number: string | null
          verification_link: string | null
          verification_type: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          claim_due_date_type?: string | null
          company_name?: string | null
          company_reg_number?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          panel_code?: string | null
          panel_type?: string
          person_in_charge?: string | null
          phone?: string | null
          postcode?: string | null
          price_tier?: string | null
          state?: string | null
          status?: string
          submission_preference?: string
          tin_number?: string | null
          verification_link?: string | null
          verification_type?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          claim_due_date_type?: string | null
          company_name?: string | null
          company_reg_number?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          panel_code?: string | null
          panel_type?: string
          person_in_charge?: string | null
          phone?: string | null
          postcode?: string | null
          price_tier?: string | null
          state?: string | null
          status?: string
          submission_preference?: string
          tin_number?: string | null
          verification_link?: string | null
          verification_type?: string
        }
        Relationships: []
      }
      inventory_item_prices: {
        Row: {
          created_at: string
          id: string
          item_id: string
          price: number
          tier_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          price?: number
          tier_key: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          price?: number
          tier_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_prices_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          allocated_quantity: number
          category: string
          cost_price: number
          created_at: string
          dosage_instructions: string | null
          dosage_instructions_enabled: boolean
          generic_name: string | null
          groups: string | null
          id: string
          latest_expiry_date: string | null
          location_id: string | null
          name: string
          nearest_expiry_date: string | null
          price_to_patient_max: number
          price_to_patient_min: number
          remarks: string | null
          standard_panel_price: number
          status: string
          stock: number
          stock_amount_warning: number | null
          stock_expiry_warning_days: number
          unit_of_measure: string | null
          updated_at: string
        }
        Insert: {
          allocated_quantity?: number
          category?: string
          cost_price?: number
          created_at?: string
          dosage_instructions?: string | null
          dosage_instructions_enabled?: boolean
          generic_name?: string | null
          groups?: string | null
          id?: string
          latest_expiry_date?: string | null
          location_id?: string | null
          name: string
          nearest_expiry_date?: string | null
          price_to_patient_max?: number
          price_to_patient_min?: number
          remarks?: string | null
          standard_panel_price?: number
          status?: string
          stock?: number
          stock_amount_warning?: number | null
          stock_expiry_warning_days?: number
          unit_of_measure?: string | null
          updated_at?: string
        }
        Update: {
          allocated_quantity?: number
          category?: string
          cost_price?: number
          created_at?: string
          dosage_instructions?: string | null
          dosage_instructions_enabled?: boolean
          generic_name?: string | null
          groups?: string | null
          id?: string
          latest_expiry_date?: string | null
          location_id?: string | null
          name?: string
          nearest_expiry_date?: string | null
          price_to_patient_max?: number
          price_to_patient_min?: number
          remarks?: string | null
          standard_panel_price?: number
          status?: string
          stock?: number
          stock_amount_warning?: number | null
          stock_expiry_warning_days?: number
          unit_of_measure?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          order_frequency: string | null
          remarks: string | null
          total_item: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_frequency?: string | null
          remarks?: string | null
          total_item?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_frequency?: string | null
          remarks?: string | null
          total_item?: number
        }
        Relationships: []
      }
      inventory_locations: {
        Row: {
          created_at: string
          id: string
          inventories: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventories?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          inventories?: string | null
          name?: string
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
      monthly_payroll_summaries: {
        Row: {
          absence_deduction: number | null
          created_at: string | null
          gross_pay: number | null
          id: string
          lateness_deduction: number | null
          month: number
          net_pay: number | null
          payroll_status: string | null
          total_absent_days: number | null
          total_allowances: number | null
          total_deductions: number | null
          total_late_incidents: number | null
          total_leave_days: number | null
          total_overtime_hours: number | null
          total_payable_overtime_hours: number | null
          total_payable_regular_hours: number | null
          total_present_days: number | null
          total_scheduled_days: number | null
          total_worked_hours: number | null
          unpaid_leave_count: number | null
          unpaid_leave_deduction: number | null
          updated_at: string | null
          user_id: string
          year: number
        }
        Insert: {
          absence_deduction?: number | null
          created_at?: string | null
          gross_pay?: number | null
          id?: string
          lateness_deduction?: number | null
          month: number
          net_pay?: number | null
          payroll_status?: string | null
          total_absent_days?: number | null
          total_allowances?: number | null
          total_deductions?: number | null
          total_late_incidents?: number | null
          total_leave_days?: number | null
          total_overtime_hours?: number | null
          total_payable_overtime_hours?: number | null
          total_payable_regular_hours?: number | null
          total_present_days?: number | null
          total_scheduled_days?: number | null
          total_worked_hours?: number | null
          unpaid_leave_count?: number | null
          unpaid_leave_deduction?: number | null
          updated_at?: string | null
          user_id: string
          year: number
        }
        Update: {
          absence_deduction?: number | null
          created_at?: string | null
          gross_pay?: number | null
          id?: string
          lateness_deduction?: number | null
          month?: number
          net_pay?: number | null
          payroll_status?: string | null
          total_absent_days?: number | null
          total_allowances?: number | null
          total_deductions?: number | null
          total_late_incidents?: number | null
          total_leave_days?: number | null
          total_overtime_hours?: number | null
          total_payable_overtime_hours?: number | null
          total_payable_regular_hours?: number | null
          total_present_days?: number | null
          total_scheduled_days?: number | null
          total_worked_hours?: number | null
          unpaid_leave_count?: number | null
          unpaid_leave_deduction?: number | null
          updated_at?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      packages: {
        Row: {
          cost: number
          created_at: string
          id: string
          items: Json | null
          name: string
          price: number
          standard_panel_price: number
          status: string
          stock: number
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          items?: Json | null
          name: string
          price?: number
          standard_panel_price?: number
          status?: string
          stock?: number
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          items?: Json | null
          name?: string
          price?: number
          standard_panel_price?: number
          status?: string
          stock?: number
        }
        Relationships: []
      }
      panel_claims: {
        Row: {
          amount: number
          claim_date: string
          claim_no: string
          created_at: string
          due_date: string | null
          id: string
          panel_id: string
          patient_id: string
          queue_entry_id: string | null
          received_amount: number | null
          remarks: string | null
          status: Database["public"]["Enums"]["panel_claim_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          claim_date?: string
          claim_no: string
          created_at?: string
          due_date?: string | null
          id?: string
          panel_id: string
          patient_id: string
          queue_entry_id?: string | null
          received_amount?: number | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["panel_claim_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          claim_date?: string
          claim_no?: string
          created_at?: string
          due_date?: string | null
          id?: string
          panel_id?: string
          patient_id?: string
          queue_entry_id?: string | null
          received_amount?: number | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["panel_claim_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_panel_claims_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_claims_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_claims_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_claims_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "insight_financials_view"
            referencedColumns: ["queue_entry_id"]
          },
          {
            foreignKeyName: "panel_claims_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_payment_methods: {
        Row: {
          created_at: string
          id: string
          name: string
          price_tier: string | null
          status: string
          verify_link: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price_tier?: string | null
          status?: string
          verify_link?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price_tier?: string | null
          status?: string
          verify_link?: string | null
        }
        Relationships: []
      }
      panel_price_overrides: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          override_price: number
          package_id: string | null
          panel_id: string
          service_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          override_price: number
          package_id?: string | null
          panel_id: string
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          override_price?: number
          package_id?: string | null
          panel_id?: string
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_price_overrides_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_price_overrides_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_price_overrides_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_price_overrides_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          allergies: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          gender: string | null
          id: string
          name: string
          national_id: string | null
          notes: string | null
          phone: string | null
          registration_date: string
          state_of_birth: string | null
          underlying_conditions: string | null
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          name: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          registration_date?: string
          state_of_birth?: string | null
          underlying_conditions?: string | null
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          name?: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          registration_date?: string
          state_of_birth?: string | null
          underlying_conditions?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_details: string | null
          created_at: string
          display_order: number
          id: string
          name: string
          provider_id: string | null
          status: string
          surcharge_percentage: number
          type: string
          updated_at: string
        }
        Insert: {
          account_details?: string | null
          created_at?: string
          display_order?: number
          id?: string
          name: string
          provider_id?: string | null
          status?: string
          surcharge_percentage?: number
          type: string
          updated_at?: string
        }
        Update: {
          account_details?: string | null
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          provider_id?: string | null
          status?: string
          surcharge_percentage?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          consultation_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          payment_method: string
          payment_type: string
          photo_url: string | null
          queue_entry_id: string
        }
        Insert: {
          amount?: number
          consultation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          payment_method: string
          payment_type?: string
          photo_url?: string | null
          queue_entry_id: string
        }
        Update: {
          amount?: number
          consultation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: string
          payment_type?: string
          photo_url?: string | null
          queue_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "insight_financials_view"
            referencedColumns: ["queue_entry_id"]
          },
          {
            foreignKeyName: "payments_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
        ]
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
      queue_entries: {
        Row: {
          assigned_doctor_id: string | null
          assigned_room_id: string | null
          called_at: string | null
          called_by_doctor_id: string | null
          clinic_status: Database["public"]["Enums"]["clinic_status"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          doctor_remarks: string | null
          id: string
          is_urgent: boolean
          panel_id: string | null
          patient_id: string
          payment_method: string | null
          queue_number: number | null
          source_appointment_id: string | null
          updated_at: string
          visit_notes: string | null
          visit_purpose: string
        }
        Insert: {
          assigned_doctor_id?: string | null
          assigned_room_id?: string | null
          called_at?: string | null
          called_by_doctor_id?: string | null
          clinic_status?: Database["public"]["Enums"]["clinic_status"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          doctor_remarks?: string | null
          id?: string
          is_urgent?: boolean
          panel_id?: string | null
          patient_id: string
          payment_method?: string | null
          queue_number?: number | null
          source_appointment_id?: string | null
          updated_at?: string
          visit_notes?: string | null
          visit_purpose?: string
        }
        Update: {
          assigned_doctor_id?: string | null
          assigned_room_id?: string | null
          called_at?: string | null
          called_by_doctor_id?: string | null
          clinic_status?: Database["public"]["Enums"]["clinic_status"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          doctor_remarks?: string | null
          id?: string
          is_urgent?: boolean
          panel_id?: string | null
          patient_id?: string
          payment_method?: string | null
          queue_number?: number | null
          source_appointment_id?: string | null
          updated_at?: string
          visit_notes?: string | null
          visit_purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_assigned_room_id_fkey"
            columns: ["assigned_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_called_by_doctor_id_fkey"
            columns: ["called_by_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
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
      room_assignments: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          room_id: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_assignments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          label: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      roster_zone_assignments: {
        Row: {
          created_at: string
          end_time: string
          id: string
          shift_key: string
          source: string
          start_time: string
          user_id: string
          work_date: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          shift_key: string
          source?: string
          start_time: string
          user_id: string
          work_date: string
          zone_id: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          shift_key?: string
          source?: string
          start_time?: string
          user_id?: string
          work_date?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_zone_assignments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "geofence_zones"
            referencedColumns: ["id"]
          },
        ]
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
      self_pay_payment_methods: {
        Row: {
          created_at: string
          id: string
          name: string
          price_tier: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price_tier?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price_tier?: string | null
          status?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          cost: number
          created_at: string
          description: string | null
          id: string
          name: string
          price_to_patient: number
          standard_panel_price: number
          status: string
          type: string
        }
        Insert: {
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_to_patient?: number
          standard_panel_price?: number
          status?: string
          type?: string
        }
        Update: {
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_to_patient?: number
          standard_panel_price?: number
          status?: string
          type?: string
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
      staff_onboarding: {
        Row: {
          company_policy_acknowledged: boolean | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          job_description_acknowledged: boolean | null
          job_scope_acknowledged: boolean | null
          onboarding_data: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_policy_acknowledged?: boolean | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          job_description_acknowledged?: boolean | null
          job_scope_acknowledged?: boolean | null
          onboarding_data?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_policy_acknowledged?: boolean | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          job_description_acknowledged?: boolean | null
          job_scope_acknowledged?: boolean | null
          onboarding_data?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_payroll_profiles: {
        Row: {
          absence_deduction: number | null
          account_holder_name: string | null
          admin_allowance: number | null
          apc_allowance: number | null
          bank_account_number: string | null
          bank_name: string | null
          basic_salary: number | null
          created_at: string | null
          custom_allowance: number | null
          custom_deduction: number | null
          daily_rate: number | null
          date_joined: string | null
          department: string | null
          eis_employee: number | null
          eis_employer: number | null
          employee_id: string | null
          employment_type: string | null
          epf_employee: number | null
          epf_employer: number | null
          epf_reference: string | null
          fixed_allowance: number | null
          full_name: string | null
          hourly_rate: number | null
          hrdf: number | null
          id: string
          job_title: string | null
          lateness_deduction: number | null
          meal_allowance: number | null
          mtd: number | null
          nric_passport: string | null
          oncall_allowance: number | null
          other_allowance_amount: number | null
          other_allowance_name: string | null
          other_statutory_ref: string | null
          overtime_eligible: boolean | null
          overtime_rate: number | null
          payroll_notes: string | null
          payroll_status: string | null
          project_allowance: number | null
          resignation_date: string | null
          salary_payment_type: string | null
          socso_employee: number | null
          socso_employer: number | null
          socso_reference: string | null
          tax_id: string | null
          team_leader_allowance: number | null
          telephone_allowance: number | null
          transport_allowance: number | null
          unpaid_leave_deduction: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          absence_deduction?: number | null
          account_holder_name?: string | null
          admin_allowance?: number | null
          apc_allowance?: number | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          created_at?: string | null
          custom_allowance?: number | null
          custom_deduction?: number | null
          daily_rate?: number | null
          date_joined?: string | null
          department?: string | null
          eis_employee?: number | null
          eis_employer?: number | null
          employee_id?: string | null
          employment_type?: string | null
          epf_employee?: number | null
          epf_employer?: number | null
          epf_reference?: string | null
          fixed_allowance?: number | null
          full_name?: string | null
          hourly_rate?: number | null
          hrdf?: number | null
          id?: string
          job_title?: string | null
          lateness_deduction?: number | null
          meal_allowance?: number | null
          mtd?: number | null
          nric_passport?: string | null
          oncall_allowance?: number | null
          other_allowance_amount?: number | null
          other_allowance_name?: string | null
          other_statutory_ref?: string | null
          overtime_eligible?: boolean | null
          overtime_rate?: number | null
          payroll_notes?: string | null
          payroll_status?: string | null
          project_allowance?: number | null
          resignation_date?: string | null
          salary_payment_type?: string | null
          socso_employee?: number | null
          socso_employer?: number | null
          socso_reference?: string | null
          tax_id?: string | null
          team_leader_allowance?: number | null
          telephone_allowance?: number | null
          transport_allowance?: number | null
          unpaid_leave_deduction?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          absence_deduction?: number | null
          account_holder_name?: string | null
          admin_allowance?: number | null
          apc_allowance?: number | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          created_at?: string | null
          custom_allowance?: number | null
          custom_deduction?: number | null
          daily_rate?: number | null
          date_joined?: string | null
          department?: string | null
          eis_employee?: number | null
          eis_employer?: number | null
          employee_id?: string | null
          employment_type?: string | null
          epf_employee?: number | null
          epf_employer?: number | null
          epf_reference?: string | null
          fixed_allowance?: number | null
          full_name?: string | null
          hourly_rate?: number | null
          hrdf?: number | null
          id?: string
          job_title?: string | null
          lateness_deduction?: number | null
          meal_allowance?: number | null
          mtd?: number | null
          nric_passport?: string | null
          oncall_allowance?: number | null
          other_allowance_amount?: number | null
          other_allowance_name?: string | null
          other_statutory_ref?: string | null
          overtime_eligible?: boolean | null
          overtime_rate?: number | null
          payroll_notes?: string | null
          payroll_status?: string | null
          project_allowance?: number | null
          resignation_date?: string | null
          salary_payment_type?: string | null
          socso_employee?: number | null
          socso_employer?: number | null
          socso_reference?: string | null
          tax_id?: string | null
          team_leader_allowance?: number | null
          telephone_allowance?: number | null
          transport_allowance?: number | null
          unpaid_leave_deduction?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_profile_submissions: {
        Row: {
          created_at: string | null
          id: string
          profile_data: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_data?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_data?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_roster_settings: {
        Row: {
          created_at: string
          hybrid_type: string | null
          id: string
          permanent_off_days: number[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hybrid_type?: string | null
          id?: string
          permanent_off_days?: number[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hybrid_type?: string | null
          id?: string
          permanent_off_days?: number[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_tasks: {
        Row: {
          assigned_to: string | null
          board_column: string
          color: string
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          end_date: string | null
          id: string
          is_completed: boolean
          last_edited_by: string | null
          start_date: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          assigned_to?: string | null
          board_column?: string
          color?: string
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_completed?: boolean
          last_edited_by?: string | null
          start_date: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          assigned_to?: string | null
          board_column?: string
          color?: string
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_completed?: boolean
          last_edited_by?: string | null
          start_date?: string
          title?: string
          updated_at?: string
          visibility?: string
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
      stock_take_counts: {
        Row: {
          actual_stock: number | null
          created_at: string
          id: string
          item_id: string
          status: string
          stock_take_id: string
        }
        Insert: {
          actual_stock?: number | null
          created_at?: string
          id?: string
          item_id: string
          status?: string
          stock_take_id: string
        }
        Update: {
          actual_stock?: number | null
          created_at?: string
          id?: string
          item_id?: string
          status?: string
          stock_take_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_take_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_counts_stock_take_id_fkey"
            columns: ["stock_take_id"]
            isOneToOne: false
            referencedRelation: "stock_takes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_takes: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          inventories: string | null
          name: string
          start_date: string | null
          status: string
          user_name: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          inventories?: string | null
          name: string
          start_date?: string | null
          status?: string
          user_name?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          inventories?: string | null
          name?: string
          start_date?: string | null
          status?: string
          user_name?: string | null
        }
        Relationships: []
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
      user_activity_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          user_id: string
          user_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          user_id?: string
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
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_profile"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      vital_signs: {
        Row: {
          blood_glucose: number | null
          bp_diastolic: number | null
          bp_systolic: number | null
          created_at: string
          heart_rate: number | null
          height_cm: number | null
          id: string
          patient_id: string
          queue_entry_id: string | null
          respiratory_rate: number | null
          spo2: number | null
          temperature_c: number | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          blood_glucose?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          heart_rate?: number | null
          height_cm?: number | null
          id?: string
          patient_id: string
          queue_entry_id?: string | null
          respiratory_rate?: number | null
          spo2?: number | null
          temperature_c?: number | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          blood_glucose?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          heart_rate?: number | null
          height_cm?: number | null
          id?: string
          patient_id?: string
          queue_entry_id?: string | null
          respiratory_rate?: number | null
          spo2?: number | null
          temperature_c?: number | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vital_signs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vital_signs_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "insight_financials_view"
            referencedColumns: ["queue_entry_id"]
          },
          {
            foreignKeyName: "vital_signs_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      insight_financials_view: {
        Row: {
          id: string | null
          item_name: string | null
          payment_method: string | null
          profit: number | null
          queue_entry_id: string | null
          revenue: number | null
          visit_date: string | null
        }
        Relationships: []
      }
      panel_claims_view: {
        Row: {
          amount: number | null
          claim_date: string | null
          claim_no: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          is_overdue: boolean | null
          panel_id: string | null
          patient_id: string | null
          queue_entry_id: string | null
          received_amount: number | null
          remarks: string | null
          status: Database["public"]["Enums"]["panel_claim_status"] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          claim_date?: string | null
          claim_no?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          is_overdue?: never
          panel_id?: string | null
          patient_id?: string | null
          queue_entry_id?: string | null
          received_amount?: number | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["panel_claim_status"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          claim_date?: string | null
          claim_no?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          is_overdue?: never
          panel_id?: string | null
          patient_id?: string | null
          queue_entry_id?: string | null
          received_amount?: number | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["panel_claim_status"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_panel_claims_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_claims_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_claims_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_claims_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "insight_financials_view"
            referencedColumns: ["queue_entry_id"]
          },
          {
            foreignKeyName: "panel_claims_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _resolve_inventory_item_id: {
        Args: { _item_name: string }
        Returns: string
      }
      admin_assign_role: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      available_quantity: { Args: { _item_id: string }; Returns: number }
      cleanup_appointment_submission_log: { Args: never; Returns: undefined }
      commit_inventory: {
        Args: { _item_id: string; _qty: number }
        Returns: undefined
      }
      get_doctor_id_for_user: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      intake_appointment_to_queue: {
        Args: {
          p_appointment_id: string
          p_notes?: string
          p_patient_id: string
          p_visit_purpose?: string
        }
        Returns: string
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_ops_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_special_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
      record_appointment_submission: {
        Args: {
          _ip_hash: string
          _message: string
          _name: string
          _phone: string
          _preferred_date: string
          _preferred_time: string
          _service: string
        }
        Returns: string
      }
      release_inventory: {
        Args: { _item_id: string; _qty: number }
        Returns: undefined
      }
      reserve_inventory: {
        Args: { _item_id: string; _qty: number }
        Returns: undefined
      }
      safe_reset_queue_number_seq: { Args: never; Returns: undefined }
      sync_roster_zone_assignments: {
        Args: { _month: number; _year: number }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "guest" | "special_admin" | "operations"
      clinic_appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      clinic_status:
        | "registered"
        | "ready_for_doctor"
        | "on_hold"
        | "with_doctor"
        | "sent_to_dispensary"
        | "dispensing_payment"
        | "completed"
      panel_claim_status:
        | "pending"
        | "submitted"
        | "approved"
        | "rejected"
        | "received"
        | "cancelled"
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
      app_role: ["admin", "staff", "guest", "special_admin", "operations"],
      clinic_appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      clinic_status: [
        "registered",
        "ready_for_doctor",
        "on_hold",
        "with_doctor",
        "sent_to_dispensary",
        "dispensing_payment",
        "completed",
      ],
      panel_claim_status: [
        "pending",
        "submitted",
        "approved",
        "rejected",
        "received",
        "cancelled",
      ],
    },
  },
} as const
