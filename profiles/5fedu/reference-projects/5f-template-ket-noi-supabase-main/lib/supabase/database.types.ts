/**
 * Hand-maintained Supabase Database types for var_* tables.
 * Regenerate full schema with: npm run types:supabase
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      var_phong_ban: {
        Row: {
          id: number;
          ma_phong_ban: string;
          ten_phong_ban: string;
          mo_ta: string | null;
          cha_id: number | null;
          cap_do: number;
          duong_dan: string;
          trang_thai: string;
          thu_tu: number;
          nguoi_tao: number | null;
          tg_tao: string;
          tg_cap_nhat: string;
        };
        Insert: {
          id?: never;
          ma_phong_ban: string;
          ten_phong_ban: string;
          mo_ta?: string | null;
          cha_id?: number | null;
          cap_do?: number;
          duong_dan?: string;
          trang_thai?: string;
          thu_tu?: number;
          nguoi_tao?: number | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Update: {
          id?: never;
          ma_phong_ban?: string;
          ten_phong_ban?: string;
          mo_ta?: string | null;
          cha_id?: number | null;
          cap_do?: number;
          duong_dan?: string;
          trang_thai?: string;
          thu_tu?: number;
          nguoi_tao?: number | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'var_phong_ban_cha_id_fkey';
            columns: ['cha_id'];
            isOneToOne: false;
            referencedRelation: 'var_phong_ban';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'var_phong_ban_nguoi_tao_fkey';
            columns: ['nguoi_tao'];
            isOneToOne: false;
            referencedRelation: 'var_nhan_vien';
            referencedColumns: ['id'];
          },
        ];
      };
      var_chuc_vu: {
        Row: {
          id: number;
          ma_chuc_vu: string;
          ten_chuc_vu: string;
          cap_bac: number | null;
          phong_ban_id: number | null;
          mo_ta: string | null;
          thu_tu: number;
          trang_thai: string;
          tg_tao: string;
          tg_cap_nhat: string;
          nguoi_tao: number | null;
        };
        Insert: {
          id?: never;
          ma_chuc_vu: string;
          ten_chuc_vu: string;
          cap_bac?: number | null;
          phong_ban_id?: number | null;
          mo_ta?: string | null;
          thu_tu?: number;
          trang_thai?: string;
          nguoi_tao?: number | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Update: {
          id?: never;
          ma_chuc_vu?: string;
          ten_chuc_vu?: string;
          cap_bac?: number | null;
          phong_ban_id?: number | null;
          mo_ta?: string | null;
          thu_tu?: number;
          trang_thai?: string;
          nguoi_tao?: number | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'var_chuc_vu_phong_ban_id_fkey';
            columns: ['phong_ban_id'];
            isOneToOne: false;
            referencedRelation: 'var_phong_ban';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'var_chuc_vu_nguoi_tao_fkey';
            columns: ['nguoi_tao'];
            isOneToOne: false;
            referencedRelation: 'var_nhan_vien';
            referencedColumns: ['id'];
          },
        ];
      };
      var_nhan_vien: {
        Row: {
          id: number;
          ho_ten: string;
          email: string;
          ten_dang_nhap: string | null;
          must_change_password: boolean;
          tai_khoan_dang_hoat_dong: boolean;
          so_dien_thoai: string;
          phong_ban_id: number | null;
          chuc_vu_id: number | null;
          gioi_tinh: string;
          trang_thai: string;
          anh_dai_dien: string | null;
          nguoi_tao: number | null;
          tg_tao: string;
          tg_cap_nhat: string;
        };
        Insert: {
          id?: never;
          ho_ten: string;
          email: string;
          ten_dang_nhap?: string | null;
          must_change_password?: boolean;
          tai_khoan_dang_hoat_dong?: boolean;
          so_dien_thoai?: string;
          phong_ban_id?: number | null;
          chuc_vu_id?: number | null;
          gioi_tinh?: string;
          trang_thai?: string;
          anh_dai_dien?: string | null;
          nguoi_tao?: number | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Update: {
          id?: never;
          ho_ten?: string;
          email?: string;
          ten_dang_nhap?: string | null;
          must_change_password?: boolean;
          tai_khoan_dang_hoat_dong?: boolean;
          so_dien_thoai?: string;
          phong_ban_id?: number | null;
          chuc_vu_id?: number | null;
          gioi_tinh?: string;
          trang_thai?: string;
          anh_dai_dien?: string | null;
          nguoi_tao?: number | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'var_nhan_vien_phong_ban_id_fkey';
            columns: ['phong_ban_id'];
            isOneToOne: false;
            referencedRelation: 'var_phong_ban';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'var_nhan_vien_chuc_vu_id_fkey';
            columns: ['chuc_vu_id'];
            isOneToOne: false;
            referencedRelation: 'var_chuc_vu';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'var_nhan_vien_nguoi_tao_fkey';
            columns: ['nguoi_tao'];
            isOneToOne: false;
            referencedRelation: 'var_nhan_vien';
            referencedColumns: ['id'];
          },
        ];
      };
      var_cong_ty: {
        Row: {
          id: number;
          ten_ung_dung: string;
          mo_ta_ung_dung: string | null;
          logo: string | null;
          ten_cong_ty: string;
          ma_so_thue: string;
          dia_chi: string | null;
          so_dien_thoai: string | null;
          email: string | null;
          website: string | null;
          tg_tao: string;
          tg_cap_nhat: string;
        };
        Insert: {
          id?: number;
          ten_ung_dung: string;
          mo_ta_ung_dung?: string | null;
          logo?: string | null;
          ten_cong_ty: string;
          ma_so_thue: string;
          dia_chi?: string | null;
          so_dien_thoai?: string | null;
          email?: string | null;
          website?: string | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Update: {
          id?: number;
          ten_ung_dung?: string;
          mo_ta_ung_dung?: string | null;
          logo?: string | null;
          ten_cong_ty?: string;
          ma_so_thue?: string;
          dia_chi?: string | null;
          so_dien_thoai?: string | null;
          email?: string | null;
          website?: string | null;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Relationships: [];
      };
      var_phan_quyen: {
        Row: {
          id: number;
          module_key: string;
          chuc_vu_id: number;
          quyen: string;
          tg_tao: string;
          tg_cap_nhat: string;
        };
        Insert: {
          id?: never;
          module_key: string;
          chuc_vu_id: number;
          quyen: string;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Update: {
          id?: never;
          module_key?: string;
          chuc_vu_id?: number;
          quyen?: string;
          tg_tao?: string;
          tg_cap_nhat?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'var_phan_quyen_chuc_vu_id_fkey';
            columns: ['chuc_vu_id'];
            isOneToOne: false;
            referencedRelation: 'var_chuc_vu';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      clear_must_change_password: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      check_login_username: {
        Args: {
          p_login_name: string;
        };
        Returns: string;
      };
      current_employee_id: {
        Args: Record<PropertyKey, never>;
        Returns: number | null;
      };
      current_user_chuc_vu_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_user_cap_bac: {
        Args: Record<PropertyKey, never>;
        Returns: number | null;
      };
      has_module_permission: {
        Args: {
          p_module_key: string;
          p_action: string;
        };
        Returns: boolean;
      };
      is_auth_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      jwt_login_name: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      map_action_to_quyen: {
        Args: {
          p_action: string;
        };
        Returns: string;
      };
      map_module_key_to_db: {
        Args: {
          p_module_key: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
