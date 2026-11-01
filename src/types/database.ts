
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_usage_months": {
                  Row: {
                    "business_id": string,"cost_usd_ticks": number,"imports_completed": number,"imports_failed": number,"input_tokens": number,"month": string,"output_tokens": number,"pages_reserved": number,"pages_used": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"cost_usd_ticks"?: number,"imports_completed"?: number,"imports_failed"?: number,"input_tokens"?: number,"month": string,"output_tokens"?: number,"pages_reserved"?: number,"pages_used"?: number,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"cost_usd_ticks"?: number,"imports_completed"?: number,"imports_failed"?: number,"input_tokens"?: number,"month"?: string,"output_tokens"?: number,"pages_reserved"?: number,"pages_used"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_months_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_kind": string,"branch_id": string | null,"business_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity_id": string | null,"entity_type": string | null,"id": number,"summary": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_kind"?: string,"branch_id"?: string | null,"business_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: never,"summary"?: string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_kind"?: string,"branch_id"?: string | null,"business_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: never,"summary"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "address": string,"business_id": string,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"name": string,"opening_hours": NonNullable<Json>,"phone": string,"public_note": string,"public_slug": string,"sort_order": number,"timezone": string,"updated_at": string,"whatsapp": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string,"business_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"opening_hours"?: NonNullable<Json>,"phone"?: string,"public_note"?: string,"public_slug": string,"sort_order"?: number,"timezone"?: string,"updated_at"?: string,"whatsapp"?: string
                  }
                  Update: {
                    "address"?: string,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"opening_hours"?: NonNullable<Json>,"phone"?: string,"public_note"?: string,"public_slug"?: string,"sort_order"?: number,"timezone"?: string,"updated_at"?: string,"whatsapp"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "brand_color": string | null,"cover_media_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"description": string,"id": string,"locale": string,"logo_media_id": string | null,"name": string,"slug": string,"status": string,"suspended_at": string | null,"suspended_by": string | null,"suspended_reason": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_color"?: string | null,"cover_media_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string,"id"?: string,"locale"?: string,"logo_media_id"?: string | null,"name": string,"slug": string,"status"?: string,"suspended_at"?: string | null,"suspended_by"?: string | null,"suspended_reason"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "brand_color"?: string | null,"cover_media_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string,"id"?: string,"locale"?: string,"logo_media_id"?: string | null,"name"?: string,"slug"?: string,"status"?: string,"suspended_at"?: string | null,"suspended_by"?: string | null,"suspended_reason"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "businesses_cover_fk"
      columns: ["id","cover_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "businesses_logo_fk"
      columns: ["id","logo_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "business_id": string,"created_at": string,"description": string,"id": string,"menu_id": string,"name": string,"name_key": string | null,"revision": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"description"?: string,"id"?: string,"menu_id": string,"name": string,"name_key"?: never,"revision"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"description"?: string,"id"?: string,"menu_id"?: string,"name"?: string,"name_key"?: never,"revision"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"import_branches": {
                  Row: {
                    "branch_id": string,"business_id": string,"import_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"import_id": string
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"import_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_branches_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "import_branches_business_id_import_id_fkey"
      columns: ["business_id","import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"import_categories": {
                  Row: {
                    "business_id": string,"category_id": string,"import_id": string,"menu_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"category_id": string,"import_id": string,"menu_id": string
                  }
                  Update: {
                    "business_id"?: string,"category_id"?: string,"import_id"?: string,"menu_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_categories_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "import_categories_menu_id_category_id_fkey"
      columns: ["menu_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["menu_id","id"]
    },{
      foreignKeyName: "import_categories_menu_id_import_id_fkey"
      columns: ["menu_id","import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["menu_id","id"]
    }
                  ]
                },"import_images": {
                  Row: {
                    "business_id": string,"bytes": number | null,"created_at": string,"declared_bytes": number,"declared_type": string,"detected_format": string | null,"error_code": string | null,"extracted_at": string | null,"extraction": Json | null,"height": number | null,"id": string,"import_id": string,"menu_id": string,"original_name": string,"page_number": number,"rotation": number,"sha256": string | null,"status": string,"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"bytes"?: number | null,"created_at"?: string,"declared_bytes": number,"declared_type": string,"detected_format"?: string | null,"error_code"?: string | null,"extracted_at"?: string | null,"extraction"?: Json | null,"height"?: number | null,"id"?: string,"import_id": string,"menu_id": string,"original_name"?: string,"page_number": number,"rotation"?: number,"sha256"?: string | null,"status"?: string,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "business_id"?: string,"bytes"?: number | null,"created_at"?: string,"declared_bytes"?: number,"declared_type"?: string,"detected_format"?: string | null,"error_code"?: string | null,"extracted_at"?: string | null,"extraction"?: Json | null,"height"?: number | null,"id"?: string,"import_id"?: string,"menu_id"?: string,"original_name"?: string,"page_number"?: number,"rotation"?: number,"sha256"?: string | null,"status"?: string,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_images_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "import_images_menu_id_import_id_fkey"
      columns: ["menu_id","import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["menu_id","id"]
    }
                  ]
                },"import_proposals": {
                  Row: {
                    "applicable": boolean,"applied_at": string | null,"base_revision": number | null,"business_id": string,"category_id": string | null,"corrected": boolean,"created_at": string,"current_value": Json | null,"decided_at": string | null,"decided_by": string | null,"detected_value": NonNullable<Json>,"flags": (string)[],"id": string,"import_id": string,"kind": string,"menu_id": string,"needs_review": boolean,"new_category_ref": string | null,"page_number": number | null,"position": number,"product_id": string | null,"proposed_value": Json | null,"reason": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applicable"?: boolean,"applied_at"?: string | null,"base_revision"?: number | null,"business_id": string,"category_id"?: string | null,"corrected"?: boolean,"created_at"?: string,"current_value"?: Json | null,"decided_at"?: string | null,"decided_by"?: string | null,"detected_value"?: NonNullable<Json>,"flags"?: (string)[],"id"?: string,"import_id": string,"kind": string,"menu_id": string,"needs_review"?: boolean,"new_category_ref"?: string | null,"page_number"?: number | null,"position": number,"product_id"?: string | null,"proposed_value"?: Json | null,"reason"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "applicable"?: boolean,"applied_at"?: string | null,"base_revision"?: number | null,"business_id"?: string,"category_id"?: string | null,"corrected"?: boolean,"created_at"?: string,"current_value"?: Json | null,"decided_at"?: string | null,"decided_by"?: string | null,"detected_value"?: NonNullable<Json>,"flags"?: (string)[],"id"?: string,"import_id"?: string,"kind"?: string,"menu_id"?: string,"needs_review"?: boolean,"new_category_ref"?: string | null,"page_number"?: number | null,"position"?: number,"product_id"?: string | null,"proposed_value"?: Json | null,"reason"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_proposals_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "import_proposals_menu_id_category_id_fkey"
      columns: ["menu_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["menu_id","id"]
    },{
      foreignKeyName: "import_proposals_menu_id_import_id_fkey"
      columns: ["menu_id","import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["menu_id","id"]
    },{
      foreignKeyName: "import_proposals_menu_id_product_id_fkey"
      columns: ["menu_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["menu_id","id"]
    }
                  ]
                },"imports": {
                  Row: {
                    "applied_by": string | null,"attempts": number,"base_menu_state": Json | null,"business_id": string,"cancelled_at": string | null,"cancelled_by": string | null,"completed_at": string | null,"created_at": string,"created_by": string,"error_code": string | null,"error_message": string | null,"extraction": Json | null,"failed_at": string | null,"id": string,"idempotency_key": string,"images_hash": string | null,"lock_token": string | null,"locked_by": string | null,"locked_until": string | null,"max_attempts": number,"menu_id": string,"model": string | null,"next_attempt_at": string | null,"page_count": number,"processed_at": string | null,"processing_started_at": string | null,"provider": string | null,"quota_month": string | null,"quota_reserved_pages": number,"quota_settled": boolean,"scope": string,"stage": string,"stage_page": number | null,"status": string,"submitted_at": string | null,"summary": NonNullable<Json>,"updated_at": string,"usage": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_by"?: string | null,"attempts"?: number,"base_menu_state"?: Json | null,"business_id": string,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by": string,"error_code"?: string | null,"error_message"?: string | null,"extraction"?: Json | null,"failed_at"?: string | null,"id"?: string,"idempotency_key": string,"images_hash"?: string | null,"lock_token"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"menu_id": string,"model"?: string | null,"next_attempt_at"?: string | null,"page_count"?: number,"processed_at"?: string | null,"processing_started_at"?: string | null,"provider"?: string | null,"quota_month"?: string | null,"quota_reserved_pages"?: number,"quota_settled"?: boolean,"scope": string,"stage"?: string,"stage_page"?: number | null,"status"?: string,"submitted_at"?: string | null,"summary"?: NonNullable<Json>,"updated_at"?: string,"usage"?: NonNullable<Json>
                  }
                  Update: {
                    "applied_by"?: string | null,"attempts"?: number,"base_menu_state"?: Json | null,"business_id"?: string,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"error_code"?: string | null,"error_message"?: string | null,"extraction"?: Json | null,"failed_at"?: string | null,"id"?: string,"idempotency_key"?: string,"images_hash"?: string | null,"lock_token"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"menu_id"?: string,"model"?: string | null,"next_attempt_at"?: string | null,"page_count"?: number,"processed_at"?: string | null,"processing_started_at"?: string | null,"provider"?: string | null,"quota_month"?: string | null,"quota_reserved_pages"?: number,"quota_settled"?: boolean,"scope"?: string,"stage"?: string,"stage_page"?: number | null,"status"?: string,"submitted_at"?: string | null,"summary"?: NonNullable<Json>,"updated_at"?: string,"usage"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "imports_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imports_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"invitation_branches": {
                  Row: {
                    "branch_id": string,"business_id": string,"invitation_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"invitation_id": string
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"invitation_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitation_branches_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "invitation_branches_business_id_invitation_id_fkey"
      columns: ["business_id","invitation_id"]
isOneToOne: false
      referencedRelation: "invitations"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"all_branches": boolean,"business_id": string,"can_publish": boolean,"created_at": string,"created_by": string | null,"created_by_platform": boolean,"email": string,"expires_at": string,"id": string,"revoked_at": string | null,"revoked_by": string | null,"role": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"all_branches"?: boolean,"business_id": string,"can_publish"?: boolean,"created_at"?: string,"created_by"?: string | null,"created_by_platform"?: boolean,"email": string,"expires_at": string,"id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role": string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"all_branches"?: boolean,"business_id"?: string,"can_publish"?: boolean,"created_at"?: string,"created_by"?: string | null,"created_by_platform"?: boolean,"email"?: string,"expires_at"?: string,"id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"media": {
                  Row: {
                    "bucket": string,"business_id": string,"bytes": number,"created_at": string,"created_by": string | null,"height": number,"id": string,"kind": string,"path_lg": string,"path_sm": string,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket"?: string,"business_id": string,"bytes": number,"created_at"?: string,"created_by"?: string | null,"height": number,"id"?: string,"kind": string,"path_lg": string,"path_sm": string,"width": number
                  }
                  Update: {
                    "bucket"?: string,"business_id"?: string,"bytes"?: number,"created_at"?: string,"created_by"?: string | null,"height"?: number,"id"?: string,"kind"?: string,"path_lg"?: string,"path_sm"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_branches": {
                  Row: {
                    "branch_id": string,"business_id": string,"created_at": string,"membership_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"created_at"?: string,"membership_id": string
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"created_at"?: string,"membership_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_branches_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "membership_branches_business_id_membership_id_fkey"
      columns: ["business_id","membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "all_branches": boolean,"business_id": string,"can_publish": boolean,"created_at": string,"created_by": string | null,"id": string,"revoked_at": string | null,"revoked_by": string | null,"role": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_branches"?: boolean,"business_id": string,"can_publish"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "all_branches"?: boolean,"business_id"?: string,"can_publish"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_branches": {
                  Row: {
                    "branch_id": string,"business_id": string,"created_at": string,"menu_id": string,"published_at": string | null,"published_version_id": string | null,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"created_at"?: string,"menu_id": string,"published_at"?: string | null,"published_version_id"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"created_at"?: string,"menu_id"?: string,"published_at"?: string | null,"published_version_id"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_branches_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "menu_branches_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "menu_branches_version_fk"
      columns: ["menu_id","branch_id","published_version_id"]
isOneToOne: false
      referencedRelation: "menu_versions"
      referencedColumns: ["menu_id","branch_id","id"]
    }
                  ]
                },"menu_versions": {
                  Row: {
                    "branch_id": string,"business_id": string,"change_summary": NonNullable<Json>,"content_hash": string,"created_at": string,"id": string,"menu_id": string,"product_count": number,"publication_id": string,"snapshot": NonNullable<Json>,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"change_summary"?: NonNullable<Json>,"content_hash": string,"created_at"?: string,"id"?: string,"menu_id": string,"product_count": number,"publication_id": string,"snapshot": NonNullable<Json>,"version_number": number
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"change_summary"?: NonNullable<Json>,"content_hash"?: string,"created_at"?: string,"id"?: string,"menu_id"?: string,"product_count"?: number,"publication_id"?: string,"snapshot"?: NonNullable<Json>,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_versions_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "menu_versions_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "menu_versions_business_id_publication_id_fkey"
      columns: ["business_id","publication_id"]
isOneToOne: false
      referencedRelation: "publications"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"menus": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"business_id": string,"created_at": string,"created_by": string | null,"description": string,"id": string,"kind": string,"name": string,"sort_order": number,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"business_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"kind"?: string,"name": string,"sort_order"?: number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"kind"?: string,"name"?: string,"sort_order"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menus_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_assignments": {
                  Row: {
                    "assigned_by": string | null,"business_id": string,"created_at": string,"ends_at": string | null,"id": string,"note": string,"plan_id": string,"starts_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_by"?: string | null,"business_id": string,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"note"?: string,"plan_id": string,"starts_at"?: string
                  }
                  Update: {
                    "assigned_by"?: string | null,"business_id"?: string,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"note"?: string,"plan_id"?: string,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_assignments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_assignments_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "ai_max_pages_per_import": number,"ai_pages_per_month": number,"code": string,"created_at": string,"description": string,"id": string,"is_active": boolean,"is_default": boolean,"max_branches": number,"max_members": number,"max_menus": number,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_max_pages_per_import": number,"ai_pages_per_month": number,"code": string,"created_at"?: string,"description"?: string,"id"?: string,"is_active"?: boolean,"is_default"?: boolean,"max_branches": number,"max_members": number,"max_menus": number,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "ai_max_pages_per_import"?: number,"ai_pages_per_month"?: number,"code"?: string,"created_at"?: string,"description"?: string,"id"?: string,"is_active"?: boolean,"is_default"?: boolean,"max_branches"?: number,"max_members"?: number,"max_menus"?: number,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "granted_at": string,"granted_by": string,"note": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by": string,"note"?: string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string,"note"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"price_bulk_operations": {
                  Row: {
                    "applied_at": string,"applied_by": string | null,"branch_id": string | null,"business_id": string,"change_count": number,"id": string,"idempotency_key": string,"menu_id": string,"rule": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string,"applied_by"?: string | null,"branch_id"?: string | null,"business_id": string,"change_count": number,"id"?: string,"idempotency_key": string,"menu_id": string,"rule"?: NonNullable<Json>
                  }
                  Update: {
                    "applied_at"?: string,"applied_by"?: string | null,"branch_id"?: string | null,"business_id"?: string,"change_count"?: number,"id"?: string,"idempotency_key"?: string,"menu_id"?: string,"rule"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_bulk_operations_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "price_bulk_operations_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_bulk_operations_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"product_branch_overrides": {
                  Row: {
                    "branch_id": string,"business_id": string,"menu_id": string,"price_minor": number | null,"product_id": string,"status": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"menu_id": string,"price_minor"?: number | null,"product_id": string,"status"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"menu_id"?: string,"price_minor"?: number | null,"product_id"?: string,"status"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_branch_overrides_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "product_branch_overrides_menu_id_branch_id_fkey"
      columns: ["menu_id","branch_id"]
isOneToOne: false
      referencedRelation: "menu_branches"
      referencedColumns: ["menu_id","branch_id"]
    },{
      foreignKeyName: "product_branch_overrides_menu_id_product_id_fkey"
      columns: ["menu_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["menu_id","id"]
    }
                  ]
                },"product_extras": {
                  Row: {
                    "business_id": string,"id": string,"menu_id": string,"name": string,"name_key": string | null,"price_minor": number,"product_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"id"?: string,"menu_id": string,"name": string,"name_key"?: never,"price_minor": number,"product_id": string,"sort_order"?: number
                  }
                  Update: {
                    "business_id"?: string,"id"?: string,"menu_id"?: string,"name"?: string,"name_key"?: never,"price_minor"?: number,"product_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_extras_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "product_extras_menu_id_product_id_fkey"
      columns: ["menu_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["menu_id","id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "business_id": string,"id": string,"menu_id": string,"name": string,"name_key": string | null,"price_minor": number | null,"product_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"id"?: string,"menu_id": string,"name": string,"name_key"?: never,"price_minor"?: number | null,"product_id": string,"sort_order"?: number
                  }
                  Update: {
                    "business_id"?: string,"id"?: string,"menu_id"?: string,"name"?: string,"name_key"?: never,"price_minor"?: number | null,"product_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "product_variants_menu_id_product_id_fkey"
      columns: ["menu_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["menu_id","id"]
    }
                  ]
                },"products": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"business_id": string,"category_id": string,"created_at": string,"created_by": string | null,"description": string,"id": string,"image_media_id": string | null,"menu_id": string,"name": string,"name_key": string | null,"price_minor": number | null,"revision": number,"sort_order": number,"status": string,"tags": (string)[],"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"business_id": string,"category_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"image_media_id"?: string | null,"menu_id": string,"name": string,"name_key"?: never,"price_minor"?: number | null,"revision"?: number,"sort_order"?: number,"status"?: string,"tags"?: (string)[],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"business_id"?: string,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"image_media_id"?: string | null,"menu_id"?: string,"name"?: string,"name_key"?: never,"price_minor"?: number | null,"revision"?: number,"sort_order"?: number,"status"?: string,"tags"?: (string)[],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_business_id_image_media_id_fkey"
      columns: ["business_id","image_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "products_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "products_menu_id_category_id_fkey"
      columns: ["menu_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["menu_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"promotion_branches": {
                  Row: {
                    "branch_id": string,"business_id": string,"promotion_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"promotion_id": string
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"promotion_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promotion_branches_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "promotion_branches_business_id_promotion_id_fkey"
      columns: ["business_id","promotion_id"]
isOneToOne: false
      referencedRelation: "promotions"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"promotions": {
                  Row: {
                    "business_id": string,"created_at": string,"created_by": string | null,"description": string,"end_time": string,"ends_on": string,"id": string,"items": NonNullable<Json>,"kind": string,"paused": boolean,"price_minor": number | null,"revision": number,"start_time": string,"starts_on": string,"title": string,"updated_at": string,"updated_by": string | null,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"end_time": string,"ends_on": string,"id"?: string,"items"?: NonNullable<Json>,"kind": string,"paused"?: boolean,"price_minor"?: number | null,"revision"?: number,"start_time": string,"starts_on": string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"weekdays": (number)[]
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"end_time"?: string,"ends_on"?: string,"id"?: string,"items"?: NonNullable<Json>,"kind"?: string,"paused"?: boolean,"price_minor"?: number | null,"revision"?: number,"start_time"?: string,"starts_on"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "promotions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"publications": {
                  Row: {
                    "business_id": string,"id": string,"idempotency_key": string,"import_id": string | null,"menu_id": string,"note": string,"published_at": string,"published_by": string | null,"restored_from_version_id": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"id"?: string,"idempotency_key": string,"import_id"?: string | null,"menu_id": string,"note"?: string,"published_at"?: string,"published_by"?: string | null,"restored_from_version_id"?: string | null,"source": string
                  }
                  Update: {
                    "business_id"?: string,"id"?: string,"idempotency_key"?: string,"import_id"?: string | null,"menu_id"?: string,"note"?: string,"published_at"?: string,"published_by"?: string | null,"restored_from_version_id"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "publications_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "publications_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "publications_import_fk"
      columns: ["business_id","import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "publications_restored_from_fk"
      columns: ["business_id","restored_from_version_id"]
isOneToOne: false
      referencedRelation: "menu_versions"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"stats_branch_hourly": {
                  Row: {
                    "branch_id": string,"business_id": string,"day": string,"hour": number,"menu_views": number,"product_views": number,"searches": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"day": string,"hour": number,"menu_views"?: number,"product_views"?: number,"searches"?: number
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"day"?: string,"hour"?: number,"menu_views"?: number,"product_views"?: number,"searches"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stats_branch_hourly_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"stats_product_daily": {
                  Row: {
                    "branch_id": string,"business_id": string,"day": string,"product_id": string,"views": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"day": string,"product_id": string,"views"?: number
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"day"?: string,"product_id"?: string,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stats_product_daily_business_id_branch_id_fkey"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "stats_product_daily_business_id_product_id_fkey"
      columns: ["business_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"variant_branch_prices": {
                  Row: {
                    "branch_id": string,"business_id": string,"menu_id": string,"price_minor": number,"updated_at": string,"updated_by": string | null,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_id": string,"menu_id": string,"price_minor": number,"updated_at"?: string,"updated_by"?: string | null,"variant_id": string
                  }
                  Update: {
                    "branch_id"?: string,"business_id"?: string,"menu_id"?: string,"price_minor"?: number,"updated_at"?: string,"updated_by"?: string | null,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "variant_branch_prices_business_id_menu_id_fkey"
      columns: ["business_id","menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "variant_branch_prices_business_id_variant_id_fkey"
      columns: ["business_id","variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "variant_branch_prices_menu_id_branch_id_fkey"
      columns: ["menu_id","branch_id"]
isOneToOne: false
      referencedRelation: "menu_branches"
      referencedColumns: ["menu_id","branch_id"]
    }
                  ]
                },"worker_heartbeats": {
                  Row: {
                    "ai_configured": boolean,"last_seen_at": string,"model": string | null,"provider": string,"started_at": string,"version": string | null,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_configured": boolean,"last_seen_at": string,"model"?: string | null,"provider": string,"started_at": string,"version"?: string | null,"worker_id": string
                  }
                  Update: {
                    "ai_configured"?: boolean,"last_seen_at"?: string,"model"?: string | null,"provider"?: string,"started_at"?: string,"version"?: string | null,"worker_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"accept_invitation_by_id":
{ Args: { "p_invitation_id": string }; Returns: Json
                           },
"admin_assign_plan":
{ Args: { "p_actor_id": string,"p_business_id": string,"p_note": string,"p_plan_id": string }; Returns: undefined
                           },
"admin_business_impact":
{ Args: { "p_actor_id": string,"p_business_id": string }; Returns: Json
                           },
"admin_create_business":
{ Args: { "p_actor_id": string,"p_branch_name": string,"p_branch_slug": string,"p_currency": string,"p_name": string,"p_owner_email": string,"p_plan_id": string,"p_slug": string,"p_timezone": string }; Returns: Json
                           },
"admin_invite_owner":
{ Args: { "p_actor_id": string,"p_business_id": string,"p_email": string }; Returns: Json
                           },
"admin_list_users":
{ Args: { "p_actor_id": string,"p_limit": number,"p_offset": number,"p_query": string }; Returns: Json
                           },
"admin_retry_import":
{ Args: { "p_actor_id": string,"p_import_id": string }; Returns: Json
                           },
"admin_save_plan":
{ Args: { "p_actor_id": string,"p_plan": Json }; Returns: string
                           },
"admin_set_business_status":
{ Args: { "p_actor_id": string,"p_business_id": string,"p_reason": string,"p_status": string }; Returns: Json
                           },
"apply_import":
{ Args: { "p_import_id": string }; Returns: Json
                           },
"apply_price_changes":
{ Args: { "p_branch_id": string,"p_changes": Json,"p_idempotency_key": string,"p_menu_id": string,"p_rule": Json }; Returns: Json
                           },
"archive_menu":
{ Args: { "p_menu_id": string }; Returns: Json
                           },
"archive_product":
{ Args: { "p_expected_revision"?: number,"p_product_id": string }; Returns: undefined
                           },
"bulk_decide_proposals":
{ Args: { "p_decision": string,"p_import_id": string,"p_kinds"?: (string)[] }; Returns: number
                           },
"cancel_import":
{ Args: { "p_import_id": string }; Returns: undefined
                           },
"create_branch":
{ Args: { "p_address": string,"p_business_id": string,"p_name": string,"p_opening_hours": Json,"p_phone": string,"p_public_note": string,"p_public_slug": string,"p_timezone": string,"p_whatsapp": string }; Returns: string
                           },
"create_business":
{ Args: { "p_address"?: string,"p_branch_name": string,"p_branch_slug": string,"p_currency": string,"p_menu_name"?: string,"p_name": string,"p_slug": string,"p_timezone": string }; Returns: Json
                           },
"create_category":
{ Args: { "p_description"?: string,"p_menu_id": string,"p_name": string }; Returns: string
                           },
"create_import":
{ Args: { "p_branch_ids": (string)[],"p_category_ids": (string)[],"p_files": Json,"p_idempotency_key": string,"p_menu_id": string,"p_scope": string }; Returns: Json
                           },
"create_invitation":
{ Args: { "p_all_branches": boolean,"p_branch_ids": (string)[],"p_business_id": string,"p_can_publish": boolean,"p_email": string,"p_expires_in_days"?: number,"p_role": string }; Returns: Json
                           },
"create_menu":
{ Args: { "p_branch_ids": (string)[],"p_business_id": string,"p_description": string,"p_kind"?: string,"p_name": string }; Returns: string
                           },
"decide_proposal":
{ Args: { "p_correction"?: Json,"p_decision": string,"p_proposal_id": string }; Returns: Json
                           },
"delete_category":
{ Args: { "p_category_id": string,"p_move_to_category_id"?: string }; Returns: undefined
                           },
"delete_promotion":
{ Args: { "p_promotion_id": string }; Returns: Json
                           },
"duplicate_menu":
{ Args: { "p_menu_id": string,"p_name": string }; Returns: string
                           },
"duplicate_product":
{ Args: { "p_product_id": string }; Returns: string
                           },
"get_ai_quota":
{ Args: { "p_business_id": string }; Returns: Json
                           },
"get_branch_stats":
{ Args: { "p_branch_id": string,"p_days": number }; Returns: Json
                           },
"get_draft_snapshot":
{ Args: { "p_branch_id": string,"p_menu_id": string }; Returns: Json
                           },
"get_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"get_menu_publish_status":
{ Args: { "p_menu_id": string }; Returns: {
              "branch_id": string,"branch_name": string,"draft_product_count": number,"has_changes": boolean,"public_slug": string,"published_at": string,"published_product_count": number,"published_version_id": string,"version_number": number
            }[]
                           },
"get_plan_overview":
{ Args: { "p_business_id": string }; Returns: Json
                           },
"get_processing_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_public_menu":
{ Args: { "p_slug": string }; Returns: Json
                           },
"list_promotions":
{ Args: { "p_business_id": string }; Returns: Json
                           },
"my_pending_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "business_name": string,"expires_at": string,"invitation_id": string,"role": string
            }[]
                           },
"publish_menu":
{ Args: { "p_branch_ids": (string)[],"p_idempotency_key": string,"p_import_id"?: string,"p_menu_id": string,"p_note"?: string,"p_source"?: string }; Returns: Json
                           },
"reorder_categories":
{ Args: { "p_category_ids": (string)[],"p_menu_id": string }; Returns: undefined
                           },
"reorder_products":
{ Args: { "p_category_id": string,"p_product_ids": (string)[] }; Returns: undefined
                           },
"restore_menu_version":
{ Args: { "p_idempotency_key": string,"p_restore_draft"?: boolean,"p_version_id": string }; Returns: Json
                           },
"retry_import":
{ Args: { "p_import_id": string }; Returns: Json
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"revoke_membership":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"save_product":
{ Args: { "p_payload": Json }; Returns: Json
                           },
"save_promotion":
{ Args: { "p_payload": Json }; Returns: Json
                           },
"server_create_media":
{ Args: { "p_actor_id": string,"p_business_id": string,"p_bytes": number,"p_height": number,"p_kind": string,"p_path_lg": string,"p_path_sm": string,"p_width": number }; Returns: string
                           },
"server_grant_platform_admin":
{ Args: { "p_email": string,"p_granted_by": string,"p_note"?: string }; Returns: Json
                           },
"server_revoke_platform_admin":
{ Args: { "p_email": string,"p_revoked_by": string }; Returns: boolean
                           },
"server_submit_import":
{ Args: { "p_actor_id": string,"p_import_id": string,"p_max_attempts"?: number,"p_pages": Json }; Returns: Json
                           },
"server_track_event":
{ Args: { "p_event": string,"p_product_id": string,"p_slug": string,"p_viewer_id": string }; Returns: string
                           },
"set_branch_override":
{ Args: { "p_branch_id": string,"p_price_minor": number,"p_product_id": string,"p_status": string,"p_variant_prices"?: Json }; Returns: undefined
                           },
"set_business_media":
{ Args: { "p_business_id": string,"p_kind": string,"p_media_id": string }; Returns: undefined
                           },
"set_menu_branches":
{ Args: { "p_branch_ids": (string)[],"p_menu_id": string }; Returns: Json
                           },
"set_product_status":
{ Args: { "p_product_id": string,"p_status": string }; Returns: number
                           },
"set_promotion_paused":
{ Args: { "p_paused": boolean,"p_promotion_id": string }; Returns: Json
                           },
"slug_available":
{ Args: { "p_kind": string,"p_slug": string }; Returns: boolean
                           },
"unarchive_menu":
{ Args: { "p_menu_id": string }; Returns: Json
                           },
"unarchive_product":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"update_branch":
{ Args: { "p_address": string,"p_branch_id": string,"p_is_active": boolean,"p_name": string,"p_opening_hours": Json,"p_phone": string,"p_public_note": string,"p_timezone": string,"p_whatsapp": string }; Returns: undefined
                           },
"update_business":
{ Args: { "p_brand_color": string,"p_business_id": string,"p_currency": string,"p_description": string,"p_locale": string,"p_name": string }; Returns: undefined
                           },
"update_category":
{ Args: { "p_category_id": string,"p_description": string,"p_expected_revision": number,"p_name": string }; Returns: number
                           },
"update_membership":
{ Args: { "p_all_branches": boolean,"p_branch_ids": (string)[],"p_can_publish": boolean,"p_membership_id": string,"p_role": string }; Returns: undefined
                           },
"update_menu":
{ Args: { "p_description": string,"p_menu_id": string,"p_name": string }; Returns: undefined
                           },
"update_my_profile":
{ Args: { "p_full_name": string }; Returns: undefined
                           },
"worker_claim_import":
{ Args: { "p_lease_seconds"?: number,"p_worker_id": string }; Returns: Json
                           },
"worker_complete_import":
{ Args: { "p_base_state": Json,"p_extraction": Json,"p_import_id": string,"p_lock_token": string,"p_proposals": Json,"p_summary": Json }; Returns: undefined
                           },
"worker_expire_uploads":
{ Args: { "p_limit"?: number,"p_older_than_minutes"?: number }; Returns: Json
                           },
"worker_fail_import":
{ Args: { "p_error_code": string,"p_error_message": string,"p_import_id": string,"p_lock_token": string,"p_retry_after_seconds"?: number,"p_retryable": boolean }; Returns: string
                           },
"worker_heartbeat":
{ Args: { "p_ai_configured": boolean,"p_model": string,"p_provider": string,"p_started_at": string,"p_version": string,"p_worker_id": string }; Returns: undefined
                           },
"worker_mark_page_failed":
{ Args: { "p_error_code": string,"p_image_id": string,"p_import_id": string,"p_lock_token": string }; Returns: undefined
                           },
"worker_progress":
{ Args: { "p_import_id": string,"p_lease_seconds"?: number,"p_lock_token": string,"p_stage": string,"p_stage_page"?: number }; Returns: string
                           },
"worker_save_page":
{ Args: { "p_extraction": Json,"p_image_id": string,"p_import_id": string,"p_lock_token": string,"p_model": string,"p_provider": string,"p_usage": Json }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
