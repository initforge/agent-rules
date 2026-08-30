-- Employee auth: login username → Supabase Auth (fake email), separate from work email.

ALTER TABLE public.he_thong_nhan_vien
  ADD COLUMN IF NOT EXISTS ten_dang_nhap text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tai_khoan_dang_hoat_dong boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS he_thong_nhan_vien_ten_dang_nhap_lower_idx
  ON public.he_thong_nhan_vien (lower(ten_dang_nhap))
  WHERE ten_dang_nhap IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS he_thong_nhan_vien_auth_user_id_idx
  ON public.he_thong_nhan_vien (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id::text
  FROM public.he_thong_nhan_vien
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_auth_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

COMMENT ON COLUMN public.he_thong_nhan_vien.ten_dang_nhap IS 'Login username (local part); Auth email = ten_dang_nhap + suffix';
COMMENT ON COLUMN public.he_thong_nhan_vien.auth_user_id IS 'FK to auth.users — 1:1 login account';
COMMENT ON COLUMN public.he_thong_nhan_vien.email IS 'Work/contact email — not used for Supabase Auth login';

-- RLS skeleton (adjust policies when connecting production Supabase project)
ALTER TABLE public.he_thong_nhan_vien ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS he_thong_nhan_vien_select_authenticated ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_select_authenticated
  ON public.he_thong_nhan_vien
  FOR SELECT
  TO authenticated
  USING (
    public.is_auth_admin()
    OR auth_user_id = auth.uid()
    OR trang_thai <> 'Nghỉ việc'
  );

DROP POLICY IF EXISTS he_thong_nhan_vien_insert_admin ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_insert_admin
  ON public.he_thong_nhan_vien
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_auth_admin());

DROP POLICY IF EXISTS he_thong_nhan_vien_update_admin ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_update_admin
  ON public.he_thong_nhan_vien
  FOR UPDATE
  TO authenticated
  USING (public.is_auth_admin())
  WITH CHECK (public.is_auth_admin());

DROP POLICY IF EXISTS he_thong_nhan_vien_delete_admin ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_delete_admin
  ON public.he_thong_nhan_vien
  FOR DELETE
  TO authenticated
  USING (public.is_auth_admin());

-- phan_quyen: read for authenticated, write admin only
ALTER TABLE public.phan_quyen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phan_quyen_select_authenticated ON public.phan_quyen;
CREATE POLICY phan_quyen_select_authenticated
  ON public.phan_quyen
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS phan_quyen_write_admin ON public.phan_quyen;
CREATE POLICY phan_quyen_write_admin
  ON public.phan_quyen
  FOR ALL
  TO authenticated
  USING (public.is_auth_admin())
  WITH CHECK (public.is_auth_admin());

-- RPC: clear must_change_password after user sets new password (called from client with own session)
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.he_thong_nhan_vien
  SET must_change_password = false,
      updated_at = now()
  WHERE auth_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;
