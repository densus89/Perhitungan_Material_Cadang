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
      approval_events: {
        Row: {
          action: Database["public"]["Enums"]["approval_action"]
          actor_id: string
          created_at: string
          dataset_version_id: string
          id: string
          notes: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["approval_action"]
          actor_id: string
          created_at?: string
          dataset_version_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["approval_action"]
          actor_id?: string
          created_at?: string
          dataset_version_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_events_dataset_version_id_fkey"
            columns: ["dataset_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_class_mappings: {
        Row: {
          alias_key: string
          approval_evidence: string
          approved_at: string
          approved_by: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          useful_life_rule_id: string
        }
        Insert: {
          alias_key: string
          approval_evidence: string
          approved_at: string
          approved_by: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          useful_life_rule_id: string
        }
        Update: {
          alias_key?: string
          approval_evidence?: string
          approved_at?: string
          approved_by?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          useful_life_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_class_mappings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_class_mappings_useful_life_rule_id_fkey"
            columns: ["useful_life_rule_id"]
            isOneToOne: false
            referencedRelation: "useful_life_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_import_chunks: {
        Row: {
          chunk_index: number
          completed_at: string
          completed_by: string
          import_run_id: string
          row_count: number
          rows_hash: string
          start_ordinal: number
          unit_induk_id: string
          valuations_hash: string
        }
        Insert: {
          chunk_index: number
          completed_at?: string
          completed_by: string
          import_run_id: string
          row_count: number
          rows_hash: string
          start_ordinal: number
          unit_induk_id: string
          valuations_hash: string
        }
        Update: {
          chunk_index?: number
          completed_at?: string
          completed_by?: string
          import_run_id?: string
          row_count?: number
          rows_hash?: string
          start_ordinal?: number
          unit_induk_id?: string
          valuations_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_import_chunks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_import_chunks_import_run_id_unit_induk_id_fkey"
            columns: ["import_run_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "asset_import_runs"
            referencedColumns: ["id", "unit_induk_id"]
          },
        ]
      }
      asset_import_run_metadata: {
        Row: {
          comparison_base_version_id: string | null
          comparison_id: string | null
          comparison_ready: boolean
          created_at: string
          dataset_version_id: string
          diagnostics: Json
          import_run_id: string
          import_session_id: string
          import_sheet_id: string
          layout_hash: string
          mapping_revision: string
          summary: Json
          unit_induk_id: string
        }
        Insert: {
          comparison_base_version_id?: string | null
          comparison_id?: string | null
          comparison_ready?: boolean
          created_at?: string
          dataset_version_id: string
          diagnostics: Json
          import_run_id: string
          import_session_id: string
          import_sheet_id: string
          layout_hash: string
          mapping_revision: string
          summary: Json
          unit_induk_id: string
        }
        Update: {
          comparison_base_version_id?: string | null
          comparison_id?: string | null
          comparison_ready?: boolean
          created_at?: string
          dataset_version_id?: string
          diagnostics?: Json
          import_run_id?: string
          import_session_id?: string
          import_sheet_id?: string
          layout_hash?: string
          mapping_revision?: string
          summary?: Json
          unit_induk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_import_run_metadata_comparison_base_version_id_fkey"
            columns: ["comparison_base_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_import_run_metadata_comparison_id_unit_induk_id_fkey"
            columns: ["comparison_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "version_comparisons"
            referencedColumns: ["id", "unit_induk_id"]
          },
          {
            foreignKeyName: "asset_import_run_metadata_import_run_id_import_session_id__fkey"
            columns: ["import_run_id", "import_session_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "asset_import_runs"
            referencedColumns: ["id", "import_session_id", "unit_induk_id"]
          },
          {
            foreignKeyName: "asset_import_run_metadata_import_run_id_unit_induk_id_data_fkey"
            columns: ["import_run_id", "unit_induk_id", "dataset_version_id"]
            isOneToOne: false
            referencedRelation: "asset_import_runs"
            referencedColumns: ["id", "unit_induk_id", "dataset_version_id"]
          },
          {
            foreignKeyName: "asset_import_run_metadata_import_sheet_id_import_session_i_fkey"
            columns: ["import_sheet_id", "import_session_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "import_sheets"
            referencedColumns: ["id", "import_session_id", "unit_induk_id"]
          },
        ]
      }
      asset_import_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          dataset_version_id: string
          expected_row_count: number
          expected_rows_hash: string
          expected_valuation_count: number
          expected_valuations_hash: string
          failure_code: string | null
          finalized_rows_hash: string | null
          finalized_valuations_hash: string | null
          id: string
          import_session_id: string
          last_progress_at: string | null
          mapping_hash: string
          mapping_revision: string | null
          processing_attempts: number
          processing_lease_expires_at: string | null
          processing_lease_token: string | null
          processing_protocol_version: string
          rule_version: string
          source_hash: string
          status: Database["public"]["Enums"]["asset_import_run_status"]
          unit_induk_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          dataset_version_id: string
          expected_row_count: number
          expected_rows_hash: string
          expected_valuation_count: number
          expected_valuations_hash: string
          failure_code?: string | null
          finalized_rows_hash?: string | null
          finalized_valuations_hash?: string | null
          id?: string
          import_session_id: string
          last_progress_at?: string | null
          mapping_hash: string
          mapping_revision?: string | null
          processing_attempts?: number
          processing_lease_expires_at?: string | null
          processing_lease_token?: string | null
          processing_protocol_version?: string
          rule_version: string
          source_hash: string
          status?: Database["public"]["Enums"]["asset_import_run_status"]
          unit_induk_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          dataset_version_id?: string
          expected_row_count?: number
          expected_rows_hash?: string
          expected_valuation_count?: number
          expected_valuations_hash?: string
          failure_code?: string | null
          finalized_rows_hash?: string | null
          finalized_valuations_hash?: string | null
          id?: string
          import_session_id?: string
          last_progress_at?: string | null
          mapping_hash?: string
          mapping_revision?: string | null
          processing_attempts?: number
          processing_lease_expires_at?: string | null
          processing_lease_token?: string | null
          processing_protocol_version?: string
          rule_version?: string
          source_hash?: string
          status?: Database["public"]["Enums"]["asset_import_run_status"]
          unit_induk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_import_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_import_runs_import_session_id_unit_induk_id_dataset__fkey"
            columns: [
              "import_session_id",
              "unit_induk_id",
              "dataset_version_id",
            ]
            isOneToOne: false
            referencedRelation: "import_sessions"
            referencedColumns: ["id", "unit_induk_id", "dataset_version_id"]
          },
        ]
      }
      asset_snapshot_rows: {
        Row: {
          bay_penghantar: string | null
          created_at: string
          dataset_version_id: string
          error_codes: string[]
          harga_pengadaan_saat_ini: number | null
          id: string
          import_run_id: string
          import_sheet_id: string
          jumlah: number | null
          keterangan: string | null
          kode_class_asset: string | null
          kode_jenis: string | null
          kode_material: string | null
          kode_subjenis: string | null
          kondisi_aset: string | null
          nama_gi: string | null
          nama_peralatan: string | null
          nilai_abc_input: number | null
          nilai_buku_sap: number | null
          no_aset: string | null
          provenance: Json
          satuan: string | null
          source_row_number: number
          spesifikasi_mara: string | null
          tanggal_operasi: string | null
          tanggal_referensi_harga: string | null
          tid: string | null
          unit_induk: string | null
          unit_induk_id: string
          upt: string | null
          usia_aset_tahun: number | null
          warning_codes: string[]
        }
        Insert: {
          bay_penghantar?: string | null
          created_at?: string
          dataset_version_id: string
          error_codes?: string[]
          harga_pengadaan_saat_ini?: number | null
          id?: string
          import_run_id: string
          import_sheet_id: string
          jumlah?: number | null
          keterangan?: string | null
          kode_class_asset?: string | null
          kode_jenis?: string | null
          kode_material?: string | null
          kode_subjenis?: string | null
          kondisi_aset?: string | null
          nama_gi?: string | null
          nama_peralatan?: string | null
          nilai_abc_input?: number | null
          nilai_buku_sap?: number | null
          no_aset?: string | null
          provenance?: Json
          satuan?: string | null
          source_row_number: number
          spesifikasi_mara?: string | null
          tanggal_operasi?: string | null
          tanggal_referensi_harga?: string | null
          tid?: string | null
          unit_induk?: string | null
          unit_induk_id: string
          upt?: string | null
          usia_aset_tahun?: number | null
          warning_codes?: string[]
        }
        Update: {
          bay_penghantar?: string | null
          created_at?: string
          dataset_version_id?: string
          error_codes?: string[]
          harga_pengadaan_saat_ini?: number | null
          id?: string
          import_run_id?: string
          import_sheet_id?: string
          jumlah?: number | null
          keterangan?: string | null
          kode_class_asset?: string | null
          kode_jenis?: string | null
          kode_material?: string | null
          kode_subjenis?: string | null
          kondisi_aset?: string | null
          nama_gi?: string | null
          nama_peralatan?: string | null
          nilai_abc_input?: number | null
          nilai_buku_sap?: number | null
          no_aset?: string | null
          provenance?: Json
          satuan?: string | null
          source_row_number?: number
          spesifikasi_mara?: string | null
          tanggal_operasi?: string | null
          tanggal_referensi_harga?: string | null
          tid?: string | null
          unit_induk?: string | null
          unit_induk_id?: string
          upt?: string | null
          usia_aset_tahun?: number | null
          warning_codes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "asset_snapshot_rows_import_run_id_unit_induk_id_dataset_ve_fkey"
            columns: ["import_run_id", "unit_induk_id", "dataset_version_id"]
            isOneToOne: false
            referencedRelation: "asset_import_runs"
            referencedColumns: ["id", "unit_induk_id", "dataset_version_id"]
          },
          {
            foreignKeyName: "asset_snapshot_rows_import_sheet_id_fkey"
            columns: ["import_sheet_id"]
            isOneToOne: false
            referencedRelation: "import_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_valuations: {
        Row: {
          age_status: Database["public"]["Enums"]["asset_age_status"]
          age_years: number | null
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          as_of: string
          asset_row_id: string
          calculation_evidence: Json
          calculation_method: Database["public"]["Enums"]["asset_calculation_method"]
          created_at: string
          dataset_version_id: string
          donor_evidence: Json
          harga_pengadaan_saat_ini: number | null
          import_run_id: string
          manual_approval_required: boolean
          nilai_abc: number | null
          rule_version: string
          selected_donor_ids: string[]
          unit_induk_id: string
          useful_life_rule_id: string | null
          useful_life_years: number | null
          value_source: Database["public"]["Enums"]["asset_valuation_source"]
          warning_codes: string[]
        }
        Insert: {
          age_status: Database["public"]["Enums"]["asset_age_status"]
          age_years?: number | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          as_of: string
          asset_row_id: string
          calculation_evidence?: Json
          calculation_method: Database["public"]["Enums"]["asset_calculation_method"]
          created_at?: string
          dataset_version_id: string
          donor_evidence?: Json
          harga_pengadaan_saat_ini?: number | null
          import_run_id: string
          manual_approval_required?: boolean
          nilai_abc?: number | null
          rule_version: string
          selected_donor_ids?: string[]
          unit_induk_id: string
          useful_life_rule_id?: string | null
          useful_life_years?: number | null
          value_source: Database["public"]["Enums"]["asset_valuation_source"]
          warning_codes?: string[]
        }
        Update: {
          age_status?: Database["public"]["Enums"]["asset_age_status"]
          age_years?: number | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          as_of?: string
          asset_row_id?: string
          calculation_evidence?: Json
          calculation_method?: Database["public"]["Enums"]["asset_calculation_method"]
          created_at?: string
          dataset_version_id?: string
          donor_evidence?: Json
          harga_pengadaan_saat_ini?: number | null
          import_run_id?: string
          manual_approval_required?: boolean
          nilai_abc?: number | null
          rule_version?: string
          selected_donor_ids?: string[]
          unit_induk_id?: string
          useful_life_rule_id?: string | null
          useful_life_years?: number | null
          value_source?: Database["public"]["Enums"]["asset_valuation_source"]
          warning_codes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_valuations_asset_row_id_import_run_id_unit_induk_id__fkey"
            columns: [
              "asset_row_id",
              "import_run_id",
              "unit_induk_id",
              "dataset_version_id",
            ]
            isOneToOne: false
            referencedRelation: "asset_snapshot_rows"
            referencedColumns: [
              "id",
              "import_run_id",
              "unit_induk_id",
              "dataset_version_id",
            ]
          },
          {
            foreignKeyName: "asset_valuations_useful_life_rule_id_fkey"
            columns: ["useful_life_rule_id"]
            isOneToOne: false
            referencedRelation: "useful_life_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_version_changes: {
        Row: {
          change_kind: Database["public"]["Enums"]["asset_change_kind"]
          changed_fields: string[]
          comparison_id: string
          evidence: Json
          from_row_id: string | null
          id: string
          identity_key: string
          to_row_id: string | null
          unit_induk_id: string
        }
        Insert: {
          change_kind: Database["public"]["Enums"]["asset_change_kind"]
          changed_fields?: string[]
          comparison_id: string
          evidence?: Json
          from_row_id?: string | null
          id?: string
          identity_key: string
          to_row_id?: string | null
          unit_induk_id: string
        }
        Update: {
          change_kind?: Database["public"]["Enums"]["asset_change_kind"]
          changed_fields?: string[]
          comparison_id?: string
          evidence?: Json
          from_row_id?: string | null
          id?: string
          identity_key?: string
          to_row_id?: string | null
          unit_induk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_version_changes_comparison_id_unit_induk_id_fkey"
            columns: ["comparison_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "version_comparisons"
            referencedColumns: ["id", "unit_induk_id"]
          },
          {
            foreignKeyName: "asset_version_changes_from_row_id_fkey"
            columns: ["from_row_id"]
            isOneToOne: false
            referencedRelation: "asset_snapshot_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_version_changes_to_row_id_fkey"
            columns: ["to_row_id"]
            isOneToOne: false
            referencedRelation: "asset_snapshot_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_versions: {
        Row: {
          created_at: string
          created_by: string | null
          dataset_id: string
          id: string
          status: Database["public"]["Enums"]["dataset_status"]
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dataset_id: string
          id?: string
          status?: Database["public"]["Enums"]["dataset_status"]
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dataset_id?: string
          id?: string
          status?: Database["public"]["Enums"]["dataset_status"]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "dataset_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_versions_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          active_version_id: string | null
          created_at: string
          id: string
          type: Database["public"]["Enums"]["dataset_type"]
          unit_induk_id: string
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          id?: string
          type: Database["public"]["Enums"]["dataset_type"]
          unit_induk_id: string
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          id?: string
          type?: Database["public"]["Enums"]["dataset_type"]
          unit_induk_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "datasets_active_version_dataset_fkey"
            columns: ["id", "active_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["dataset_id", "id"]
          },
          {
            foreignKeyName: "datasets_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datasets_unit_induk_id_fkey"
            columns: ["unit_induk_id"]
            isOneToOne: false
            referencedRelation: "unit_induk"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_location_references: {
        Row: {
          created_at: string
          id: string
          latitude: number
          longitude: number
          nama_gi: string
          nama_gi_key: string | null
          source_hash: string
          source_version: string
          unit_induk_id: string
          unit_induk_key: string
          updated_at: string
          updated_by: string
          upt: string
          upt_key: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          nama_gi: string
          nama_gi_key?: string | null
          source_hash: string
          source_version: string
          unit_induk_id: string
          unit_induk_key: string
          updated_at?: string
          updated_by: string
          upt: string
          upt_key?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          nama_gi?: string
          nama_gi_key?: string | null
          source_hash?: string
          source_version?: string
          unit_induk_id?: string
          unit_induk_key?: string
          updated_at?: string
          updated_by?: string
          upt?: string
          upt_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gi_location_references_unit_induk_id_fkey"
            columns: ["unit_induk_id"]
            isOneToOne: false
            referencedRelation: "unit_induk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gi_location_references_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_column_mappings: {
        Row: {
          canonical_field: string | null
          confidence: number
          confirmed_at: string | null
          confirmed_by: string | null
          id: string
          import_session_id: string
          import_sheet_id: string
          mapping_profile_id: string | null
          source_column_index: number
          source_header: string
          unit_induk_id: string
        }
        Insert: {
          canonical_field?: string | null
          confidence: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          import_session_id: string
          import_sheet_id: string
          mapping_profile_id?: string | null
          source_column_index: number
          source_header: string
          unit_induk_id: string
        }
        Update: {
          canonical_field?: string | null
          confidence?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          import_session_id?: string
          import_sheet_id?: string
          mapping_profile_id?: string | null
          source_column_index?: number
          source_header?: string
          unit_induk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_column_mappings_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_column_mappings_import_sheet_id_import_session_id_u_fkey"
            columns: ["import_sheet_id", "import_session_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "import_sheets"
            referencedColumns: ["id", "import_session_id", "unit_induk_id"]
          },
          {
            foreignKeyName: "import_column_mappings_mapping_profile_id_unit_induk_id_fkey"
            columns: ["mapping_profile_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "mapping_profiles"
            referencedColumns: ["id", "unit_induk_id"]
          },
        ]
      }
      import_sessions: {
        Row: {
          created_at: string
          created_by: string
          current_run_id: string | null
          dataset_id: string
          dataset_version_id: string
          id: string
          mapping_revision: string
          source_file_id: string
          unit_induk_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_run_id?: string | null
          dataset_id: string
          dataset_version_id: string
          id?: string
          mapping_revision?: string
          source_file_id: string
          unit_induk_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_run_id?: string | null
          dataset_id?: string
          dataset_version_id?: string
          id?: string
          mapping_revision?: string
          source_file_id?: string
          unit_induk_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_sessions_current_run_fkey"
            columns: ["current_run_id", "id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "asset_import_runs"
            referencedColumns: ["id", "import_session_id", "unit_induk_id"]
          },
          {
            foreignKeyName: "import_sessions_dataset_id_dataset_version_id_fkey"
            columns: ["dataset_id", "dataset_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["dataset_id", "id"]
          },
          {
            foreignKeyName: "import_sessions_dataset_id_unit_induk_id_fkey"
            columns: ["dataset_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id", "unit_induk_id"]
          },
          {
            foreignKeyName: "import_sessions_source_file_id_unit_induk_id_fkey"
            columns: ["source_file_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "source_files"
            referencedColumns: ["id", "unit_induk_id"]
          },
        ]
      }
      import_sheets: {
        Row: {
          created_at: string
          diagnostics: Json
          header_row: number
          id: string
          import_session_id: string
          layout_hash: string | null
          selected: boolean
          sheet_name: string
          unit_induk_id: string
        }
        Insert: {
          created_at?: string
          diagnostics?: Json
          header_row: number
          id?: string
          import_session_id: string
          layout_hash?: string | null
          selected?: boolean
          sheet_name: string
          unit_induk_id: string
        }
        Update: {
          created_at?: string
          diagnostics?: Json
          header_row?: number
          id?: string
          import_session_id?: string
          layout_hash?: string | null
          selected?: boolean
          sheet_name?: string
          unit_induk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_sheets_import_session_id_unit_induk_id_fkey"
            columns: ["import_session_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "import_sessions"
            referencedColumns: ["id", "unit_induk_id"]
          },
        ]
      }
      mapping_profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          layout_hash: string
          mapping: Json | null
          name: string
          rule_version: string
          source_version_id: string | null
          unit_induk_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          layout_hash: string
          mapping?: Json | null
          name: string
          rule_version: string
          source_version_id?: string | null
          unit_induk_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          layout_hash?: string
          mapping?: Json | null
          name?: string
          rule_version?: string
          source_version_id?: string | null
          unit_induk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mapping_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapping_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapping_profiles_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapping_profiles_unit_induk_id_fkey"
            columns: ["unit_induk_id"]
            isOneToOne: false
            referencedRelation: "unit_induk"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email: string
          id: string
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: []
      }
      source_files: {
        Row: {
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          object_path: string
          original_name: string
          sha256: string
          unit_induk_id: string
          uploaded_by: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          id?: string
          mime_type?: string
          object_path: string
          original_name: string
          sha256: string
          unit_induk_id: string
          uploaded_by: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          id?: string
          mime_type?: string
          object_path?: string
          original_name?: string
          sha256?: string
          unit_induk_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_files_unit_induk_id_fkey"
            columns: ["unit_induk_id"]
            isOneToOne: false
            referencedRelation: "unit_induk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_induk: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      useful_life_rules: {
        Row: {
          class_code: string
          created_at: string
          effective_from: string
          effective_to: string | null
          function_code: string
          id: string
          rule_version: string
          source_document: string
          source_hash: string
          source_locator: string
          subtype_code: string
          type_code: string
          useful_life_years: number
        }
        Insert: {
          class_code: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          function_code: string
          id?: string
          rule_version: string
          source_document: string
          source_hash: string
          source_locator: string
          subtype_code: string
          type_code: string
          useful_life_years: number
        }
        Update: {
          class_code?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          function_code?: string
          id?: string
          rule_version?: string
          source_document?: string
          source_hash?: string
          source_locator?: string
          subtype_code?: string
          type_code?: string
          useful_life_years?: number
        }
        Relationships: []
      }
      user_role_assignments: {
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
            foreignKeyName: "user_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_unit_assignments: {
        Row: {
          created_at: string
          id: string
          unit_induk_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          unit_induk_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          unit_induk_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unit_assignments_unit_induk_id_fkey"
            columns: ["unit_induk_id"]
            isOneToOne: false
            referencedRelation: "unit_induk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unit_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      version_comparisons: {
        Row: {
          created_at: string
          created_by: string
          dataset_id: string
          from_run_id: string
          from_version_id: string
          id: string
          summary: Json
          to_run_id: string
          to_version_id: string
          unit_induk_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          dataset_id: string
          from_run_id: string
          from_version_id: string
          id?: string
          summary?: Json
          to_run_id: string
          to_version_id: string
          unit_induk_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dataset_id?: string
          from_run_id?: string
          from_version_id?: string
          id?: string
          summary?: Json
          to_run_id?: string
          to_version_id?: string
          unit_induk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "version_comparisons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "version_comparisons_dataset_id_from_version_id_fkey"
            columns: ["dataset_id", "from_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["dataset_id", "id"]
          },
          {
            foreignKeyName: "version_comparisons_dataset_id_to_version_id_fkey"
            columns: ["dataset_id", "to_version_id"]
            isOneToOne: false
            referencedRelation: "dataset_versions"
            referencedColumns: ["dataset_id", "id"]
          },
          {
            foreignKeyName: "version_comparisons_dataset_id_unit_induk_id_fkey"
            columns: ["dataset_id", "unit_induk_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id", "unit_induk_id"]
          },
          {
            foreignKeyName: "version_comparisons_from_run_id_unit_induk_id_from_version_fkey"
            columns: ["from_run_id", "unit_induk_id", "from_version_id"]
            isOneToOne: false
            referencedRelation: "asset_import_runs"
            referencedColumns: ["id", "unit_induk_id", "dataset_version_id"]
          },
          {
            foreignKeyName: "version_comparisons_to_run_id_unit_induk_id_to_version_id_fkey"
            columns: ["to_run_id", "unit_induk_id", "to_version_id"]
            isOneToOne: false
            referencedRelation: "asset_import_runs"
            referencedColumns: ["id", "unit_induk_id", "dataset_version_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_asset_version: {
        Args: { p_actor_id: string; p_notes: string; p_version_id: string }
        Returns: string
      }
      activate_my_profile: { Args: never; Returns: undefined }
      admin_replace_user_access: {
        Args: {
          p_actor_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_status: Database["public"]["Enums"]["account_status"]
          p_unit_induk_ids: string[]
          p_user_id: string
        }
        Returns: string
      }
      claim_asset_import_processing: {
        Args: {
          p_actor_id: string
          p_expected_revision: string
          p_import_id: string
          p_lease_token?: string
          p_run: Json
        }
        Returns: Json
      }
      commit_asset_import_chunk: {
        Args: {
          p_actor_id: string
          p_chunk_index: number
          p_lease_token: string
          p_rows: Json
          p_rows_hash: string
          p_run_id: string
          p_start_ordinal: number
          p_valuations: Json
          p_valuations_hash: string
        }
        Returns: number
      }
      complete_asset_import_comparison: {
        Args: {
          p_actor_id: string
          p_base_version_id: string
          p_comparison_id: string
          p_run_id: string
        }
        Returns: string
      }
      fail_asset_import_run:
        | { Args: { p_actor_id: string; p_run_id: string }; Returns: string }
        | {
            Args: {
              p_actor_id: string
              p_lease_token: string
              p_run_id: string
            }
            Returns: string
          }
      finalize_asset_import_run:
        | { Args: { p_actor_id: string; p_run_id: string }; Returns: string }
        | {
            Args: {
              p_actor_id: string
              p_lease_token: string
              p_run_id: string
            }
            Returns: string
          }
      get_asset_version_review_state: {
        Args: { p_version_id: string }
        Returns: Json
      }
      insert_asset_import_batch: {
        Args: {
          p_actor_id: string
          p_rows: Json
          p_run_id: string
          p_valuations: Json
        }
        Returns: number
      }
      list_asset_version_reviews: { Args: { p_filters: Json }; Returns: Json }
      release_asset_import_processing: {
        Args: { p_actor_id: string; p_lease_token: string; p_run_id: string }
        Returns: string
      }
      replace_asset_import_mapping: {
        Args: {
          p_actor_id: string
          p_canonical_hash: string
          p_expected_revision: string
          p_import_id: string
          p_layout_hash: string
          p_mapping: Json
          p_rule_version: string
          p_sheet_id: string
          p_source_hash: string
        }
        Returns: string
      }
      replace_gi_location_reference: {
        Args: {
          p_actor_id: string
          p_rows: Json
          p_source_hash: string
          p_source_version: string
        }
        Returns: Json
      }
      reserve_asset_import_run: {
        Args: {
          p_actor_id: string
          p_expected_revision: string
          p_import_id: string
          p_run: Json
        }
        Returns: string
      }
      return_asset_version: {
        Args: { p_actor_id: string; p_notes: string; p_version_id: string }
        Returns: string
      }
      review_asset_version: {
        Args: {
          p_action: string
          p_actor_id: string
          p_expected: Json
          p_filters: Json
          p_notes: string
          p_promote_mapping: boolean
          p_row_ids: string[]
          p_version_id: string
        }
        Returns: Json
      }
      submit_asset_version: {
        Args: {
          p_actor_id: string
          p_expected_base_version_id: string
          p_expected_comparison_id: string
          p_expected_layout_hash: string
          p_expected_mapping_revision: string
          p_expected_run_id: string
          p_version_id: string
        }
        Returns: string
      }
    }
    Enums: {
      account_status: "INVITED" | "ACTIVE" | "DISABLED"
      app_role: "RST_ADMIN" | "RST_REVIEWER" | "UNIT_OPERATOR" | "VIEWER"
      approval_action:
        | "SUBMITTED"
        | "APPROVED"
        | "REJECTED"
        | "RETURNED"
        | "ACTIVATED"
        | "RESTORED"
        | "TRASHED"
        | "PURGED"
      asset_age_status:
        | "OPERATION_DATE"
        | "PROVIDED_AGE"
        | "AGE_IMPUTED"
        | "UNRESOLVED"
      asset_calculation_method:
        | "DIRECT_BOOK_VALUE"
        | "STRAIGHT_LINE"
        | "UNRESOLVED"
      asset_change_kind:
        | "ADDED"
        | "REMOVED"
        | "CHANGED"
        | "UNCHANGED"
        | "AMBIGUOUS"
      asset_import_run_status: "PROCESSING" | "FAILED" | "COMPLETE"
      asset_valuation_source:
        | "SAP_BOOK_VALUE"
        | "PROVIDED_ADJUSTED_VALUE"
        | "SYSTEM_DEPRECIATION"
        | "ESTIMATED_SAME_GI"
        | "ESTIMATED_SAME_UPT"
        | "ESTIMATED_SAME_UNIT"
        | "ESTIMATED_NEAREST_LOCATION"
        | "ESTIMATED_NATIONAL"
        | "UNRESOLVED"
      dataset_status:
        | "DRAFT"
        | "NEEDS_FIX"
        | "READY_TO_SUBMIT"
        | "PENDING_RST"
        | "REJECTED"
        | "ACTIVE"
        | "HISTORICAL"
        | "TRASH"
      dataset_type:
        | "ASSET"
        | "HISTORY"
        | "PRICE"
        | "LEAD_TIME"
        | "LOCATION"
        | "RFQ_REFERENCE"
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
      account_status: ["INVITED", "ACTIVE", "DISABLED"],
      app_role: ["RST_ADMIN", "RST_REVIEWER", "UNIT_OPERATOR", "VIEWER"],
      approval_action: [
        "SUBMITTED",
        "APPROVED",
        "REJECTED",
        "RETURNED",
        "ACTIVATED",
        "RESTORED",
        "TRASHED",
        "PURGED",
      ],
      asset_age_status: [
        "OPERATION_DATE",
        "PROVIDED_AGE",
        "AGE_IMPUTED",
        "UNRESOLVED",
      ],
      asset_calculation_method: [
        "DIRECT_BOOK_VALUE",
        "STRAIGHT_LINE",
        "UNRESOLVED",
      ],
      asset_change_kind: [
        "ADDED",
        "REMOVED",
        "CHANGED",
        "UNCHANGED",
        "AMBIGUOUS",
      ],
      asset_import_run_status: ["PROCESSING", "FAILED", "COMPLETE"],
      asset_valuation_source: [
        "SAP_BOOK_VALUE",
        "PROVIDED_ADJUSTED_VALUE",
        "SYSTEM_DEPRECIATION",
        "ESTIMATED_SAME_GI",
        "ESTIMATED_SAME_UPT",
        "ESTIMATED_SAME_UNIT",
        "ESTIMATED_NEAREST_LOCATION",
        "ESTIMATED_NATIONAL",
        "UNRESOLVED",
      ],
      dataset_status: [
        "DRAFT",
        "NEEDS_FIX",
        "READY_TO_SUBMIT",
        "PENDING_RST",
        "REJECTED",
        "ACTIVE",
        "HISTORICAL",
        "TRASH",
      ],
      dataset_type: [
        "ASSET",
        "HISTORY",
        "PRICE",
        "LEAD_TIME",
        "LOCATION",
        "RFQ_REFERENCE",
      ],
    },
  },
} as const
