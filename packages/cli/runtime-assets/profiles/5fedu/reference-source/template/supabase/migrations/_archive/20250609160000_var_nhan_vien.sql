-- var_nhan_vien + phan_quyen + auth RPC (requires var_phong_ban, var_chuc_vu)

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id::text
  FROM public.var_nhan_vien
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_chuc_vu_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' -> 'id_chuc_vu' ->> 0),
    (
      SELECT chuc_vu_id::text
      FROM public.var_nhan_vien
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_module_permission(p_module_key text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chuc_vu_id text;
BEGIN
  IF public.is_auth_admin() THEN
    RETURN true;
  END IF;

  IF to_regclass('public.phan_quyen') IS NULL THEN
    RETURN false;
  END IF;

  v_chuc_vu_id := public.current_user_chuc_vu_id();

  IF v_chuc_vu_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.phan_quyen pq
    WHERE pq.vai_tro = v_chuc_vu_id
      AND pq.module_key = p_module_key
      AND (
        pq.phan_quyen::jsonb @> to_jsonb(ARRAY[p_action])
        OR pq.phan_quyen::jsonb @> '["all"]'::jsonb
        OR pq.phan_quyen::jsonb @> '["admin"]'::jsonb
      )
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_chuc_vu_id() TO authenticated;

CREATE TABLE IF NOT EXISTS public.var_nhan_vien (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ho_ten                   text NOT NULL,
  email                    text NOT NULL,
  ten_dang_nhap            text,
  auth_user_id             uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  must_change_password     boolean NOT NULL DEFAULT false,
  tai_khoan_dang_hoat_dong boolean NOT NULL DEFAULT true,
  so_dien_thoai            text NOT NULL DEFAULT '',
  phong_ban_id             bigint REFERENCES public.var_phong_ban (id) ON DELETE RESTRICT,
  chuc_vu_id               bigint REFERENCES public.var_chuc_vu (id) ON DELETE RESTRICT,
  gioi_tinh                text NOT NULL DEFAULT 'Nam'
                           CHECK (gioi_tinh IN ('Nam', 'Nữ', 'Khác')),
  trang_thai               text NOT NULL DEFAULT 'Đang làm việc'
                           CHECK (trang_thai IN ('Nghỉ việc', 'Đang làm việc', 'Thử việc', 'Nghỉ phép')),
  anh_dai_dien             text,
  tg_tao                   timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.var_nhan_vien IS 'Hồ sơ nhân viên — đăng nhập qua ten_dang_nhap + fake email Auth';
COMMENT ON COLUMN public.var_nhan_vien.ten_dang_nhap IS 'Login username (local part); Auth email = ten_dang_nhap + suffix';
COMMENT ON COLUMN public.var_nhan_vien.auth_user_id IS 'FK to auth.users — 1:1 login account';
COMMENT ON COLUMN public.var_nhan_vien.email IS 'Work/contact email — not used for Supabase Auth login';

CREATE UNIQUE INDEX IF NOT EXISTS var_nhan_vien_ten_dang_nhap_lower_idx
  ON public.var_nhan_vien (lower(ten_dang_nhap))
  WHERE ten_dang_nhap IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS var_nhan_vien_auth_user_id_idx
  ON public.var_nhan_vien (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS var_nhan_vien_phong_ban_id_idx
  ON public.var_nhan_vien (phong_ban_id);

CREATE INDEX IF NOT EXISTS var_nhan_vien_chuc_vu_id_idx
  ON public.var_nhan_vien (chuc_vu_id);

CREATE INDEX IF NOT EXISTS var_nhan_vien_trang_thai_idx
  ON public.var_nhan_vien (trang_thai);

CREATE OR REPLACE FUNCTION public.set_var_nhan_vien_tg_cap_nhat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tg_cap_nhat := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS var_nhan_vien_set_tg_cap_nhat ON public.var_nhan_vien;
CREATE TRIGGER var_nhan_vien_set_tg_cap_nhat
  BEFORE UPDATE ON public.var_nhan_vien
  FOR EACH ROW
  EXECUTE FUNCTION public.set_var_nhan_vien_tg_cap_nhat();

ALTER TABLE public.var_nhan_vien ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_nhan_vien_select_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_select_authenticated
  ON public.var_nhan_vien
  FOR SELECT
  TO authenticated
  USING (
    public.is_auth_admin()
    OR auth_user_id = auth.uid()
    OR public.has_module_permission('he-thong/nhan-vien', 'view')
  );

DROP POLICY IF EXISTS var_nhan_vien_insert_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_insert_authenticated
  ON public.var_nhan_vien
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/nhan-vien', 'create')
  );

DROP POLICY IF EXISTS var_nhan_vien_update_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_update_authenticated
  ON public.var_nhan_vien
  FOR UPDATE
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/nhan-vien', 'update')
  )
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/nhan-vien', 'update')
  );

DROP POLICY IF EXISTS var_nhan_vien_delete_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_delete_authenticated
  ON public.var_nhan_vien
  FOR DELETE
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/nhan-vien', 'delete')
  );

CREATE TABLE IF NOT EXISTS public.phan_quyen (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  vai_tro     text NOT NULL,
  module_key  text NOT NULL,
  phan_quyen  jsonb NOT NULL DEFAULT '[]'::jsonb,
  tg_cap_nhat timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phan_quyen_vai_tro_module_key_unique UNIQUE (vai_tro, module_key)
);

COMMENT ON TABLE public.phan_quyen IS 'Ma trận phân quyền — vai_tro = var_chuc_vu.id (text)';

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
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/phan-quyen', 'admin')
    OR public.has_module_permission('he-thong/phan-quyen', 'update')
  )
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/phan-quyen', 'admin')
    OR public.has_module_permission('he-thong/phan-quyen', 'update')
  );

CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.var_nhan_vien
  SET must_change_password = false,
      tg_cap_nhat = now()
  WHERE auth_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;
