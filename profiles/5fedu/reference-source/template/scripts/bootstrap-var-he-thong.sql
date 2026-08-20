-- Bootstrap: var_phong_ban + var_chuc_vu + var_nhan_vien + var_cong_ty + var_phan_quyen + auth helpers
-- FRESH DB: (1) bootstrap-var-he-thong.sql  (2) seed-var-he-thong.sql
-- Hướng dẫn đầy đủ: docs/supabase-setup.md

-- =============================================================================
-- A. RLS / auth helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_auth_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Deprecated: authorization uses var_phan_quyen via has_module_permission(), not JWT role.
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.jwt_login_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(split_part(coalesce(auth.jwt()->>'email', ''), '@', 1));
$$;

CREATE OR REPLACE FUNCTION public.map_module_key_to_db(p_module_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_module_key
    WHEN 'he-thong/nhan-vien' THEN 'nhan_vien'
    WHEN 'he-thong/phong-ban' THEN 'phong_ban'
    WHEN 'he-thong/chuc-vu' THEN 'chuc_vu'
    WHEN 'he-thong/thong-tin-cong-ty' THEN 'thong_tin_cong_ty'
    WHEN 'he-thong/phan-quyen' THEN 'phan_quyen'
    ELSE replace(replace(p_module_key, 'he-thong/', ''), '-', '_')
  END;
$$;

CREATE OR REPLACE FUNCTION public.map_action_to_quyen(p_action text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(p_action)
    WHEN 'view' THEN 'xem'
    WHEN 'create' THEN 'them'
    WHEN 'update' THEN 'sua'
    WHEN 'delete' THEN 'xoa'
    WHEN 'admin' THEN 'admin'
    WHEN 'all' THEN 'tat_ca'
    ELSE lower(p_action)
  END;
$$;

GRANT EXECUTE ON FUNCTION public.is_auth_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jwt_login_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_module_key_to_db(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_action_to_quyen(text) TO authenticated;

-- (current_employee_id, current_user_chuc_vu_id, has_module_permission → sau khi tạo bảng, mục G)

-- =============================================================================
-- B. var_phong_ban
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.var_phong_ban (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_phong_ban  text NOT NULL,
  ten_phong_ban text NOT NULL,
  mo_ta         text,
  cha_id        bigint REFERENCES public.var_phong_ban (id) ON DELETE RESTRICT,
  cap_do        smallint NOT NULL DEFAULT 1
                CHECK (cap_do >= 1 AND cap_do <= 2),
  duong_dan     text NOT NULL DEFAULT '',
  trang_thai    text NOT NULL DEFAULT 'Đang hoạt động'
                CHECK (trang_thai IN ('Ngừng hoạt động', 'Đang hoạt động')),
  thu_tu        integer NOT NULL DEFAULT 1,
  nguoi_tao     bigint REFERENCES public.var_nhan_vien (id) ON DELETE SET NULL,
  tg_tao        timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT var_phong_ban_root_no_parent
    CHECK ((cha_id IS NULL AND cap_do = 1) OR (cha_id IS NOT NULL AND cap_do = 2))
);

COMMENT ON TABLE public.var_phong_ban IS 'Danh mục phòng ban — cây 2 cấp (phòng gốc + nhóm con)';
COMMENT ON COLUMN public.var_phong_ban.nguoi_tao IS 'NV tạo bản ghi — RLS xem/sửa dòng mình tạo';

CREATE UNIQUE INDEX IF NOT EXISTS var_phong_ban_ma_lower_idx
  ON public.var_phong_ban (lower(ma_phong_ban));

CREATE INDEX IF NOT EXISTS var_phong_ban_cha_id_idx
  ON public.var_phong_ban (cha_id);

CREATE INDEX IF NOT EXISTS var_phong_ban_duong_dan_idx
  ON public.var_phong_ban (duong_dan);

CREATE INDEX IF NOT EXISTS var_phong_ban_trang_thai_idx
  ON public.var_phong_ban (trang_thai);

CREATE INDEX IF NOT EXISTS var_phong_ban_thu_tu_idx
  ON public.var_phong_ban (thu_tu);

CREATE INDEX IF NOT EXISTS var_phong_ban_nguoi_tao_idx
  ON public.var_phong_ban (nguoi_tao);

CREATE OR REPLACE FUNCTION public.set_var_phong_ban_tg_cap_nhat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tg_cap_nhat := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS var_phong_ban_set_tg_cap_nhat ON public.var_phong_ban;
CREATE TRIGGER var_phong_ban_set_tg_cap_nhat
  BEFORE UPDATE ON public.var_phong_ban
  FOR EACH ROW
  EXECUTE FUNCTION public.set_var_phong_ban_tg_cap_nhat();

-- =============================================================================
-- C. var_chuc_vu
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.var_chuc_vu (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_chuc_vu    text NOT NULL,
  ten_chuc_vu   text NOT NULL,
  cap_bac       smallint,
  phong_ban_id  bigint REFERENCES public.var_phong_ban (id) ON DELETE RESTRICT,
  mo_ta         text,
  thu_tu        integer NOT NULL DEFAULT 1,
  trang_thai    text NOT NULL DEFAULT 'Đang hoạt động'
                CHECK (trang_thai IN ('Ngừng hoạt động', 'Đang hoạt động')),
  nguoi_tao     bigint REFERENCES public.var_nhan_vien (id) ON DELETE SET NULL,
  tg_tao        timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.var_chuc_vu IS 'Danh mục chức vụ — liên kết phòng ban';
COMMENT ON COLUMN public.var_chuc_vu.nguoi_tao IS 'NV tạo bản ghi — RLS xem/sửa dòng mình tạo';

CREATE UNIQUE INDEX IF NOT EXISTS var_chuc_vu_ma_lower_idx
  ON public.var_chuc_vu (lower(ma_chuc_vu));

CREATE INDEX IF NOT EXISTS var_chuc_vu_phong_ban_id_idx
  ON public.var_chuc_vu (phong_ban_id);

CREATE INDEX IF NOT EXISTS var_chuc_vu_trang_thai_idx
  ON public.var_chuc_vu (trang_thai);

CREATE INDEX IF NOT EXISTS var_chuc_vu_nguoi_tao_idx
  ON public.var_chuc_vu (nguoi_tao);

CREATE OR REPLACE FUNCTION public.set_var_chuc_vu_tg_cap_nhat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tg_cap_nhat := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS var_chuc_vu_set_tg_cap_nhat ON public.var_chuc_vu;
CREATE TRIGGER var_chuc_vu_set_tg_cap_nhat
  BEFORE UPDATE ON public.var_chuc_vu
  FOR EACH ROW
  EXECUTE FUNCTION public.set_var_chuc_vu_tg_cap_nhat();

-- =============================================================================
-- D. var_nhan_vien (auth: ten_dang_nhap → fake email Supabase Auth)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.var_nhan_vien (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ho_ten                   text NOT NULL,
  email                    text NOT NULL,
  ten_dang_nhap            text,
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
  nguoi_tao                bigint REFERENCES public.var_nhan_vien (id) ON DELETE SET NULL,
  tg_tao                   timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.var_nhan_vien.nguoi_tao IS 'NV tạo bản ghi — RLS xem/sửa dòng mình tạo';

COMMENT ON TABLE public.var_nhan_vien IS 'Hồ sơ nhân viên — đăng nhập qua ten_dang_nhap + fake email Auth';
COMMENT ON COLUMN public.var_nhan_vien.ten_dang_nhap IS 'Login username (local part); khớp local-part JWT email Auth = ten_dang_nhap + suffix';
COMMENT ON COLUMN public.var_nhan_vien.email IS 'Work/contact email — not used for Supabase Auth login';

CREATE UNIQUE INDEX IF NOT EXISTS var_nhan_vien_ten_dang_nhap_lower_idx
  ON public.var_nhan_vien (lower(ten_dang_nhap))
  WHERE ten_dang_nhap IS NOT NULL;

CREATE INDEX IF NOT EXISTS var_nhan_vien_phong_ban_id_idx
  ON public.var_nhan_vien (phong_ban_id);

CREATE INDEX IF NOT EXISTS var_nhan_vien_chuc_vu_id_idx
  ON public.var_nhan_vien (chuc_vu_id);

CREATE INDEX IF NOT EXISTS var_nhan_vien_trang_thai_idx
  ON public.var_nhan_vien (trang_thai);

CREATE INDEX IF NOT EXISTS var_nhan_vien_nguoi_tao_idx
  ON public.var_nhan_vien (nguoi_tao);

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

-- =============================================================================
-- E. var_cong_ty (singleton — thông tin doanh nghiệp)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.var_cong_ty (
  id              bigint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ten_ung_dung    text NOT NULL DEFAULT '',
  mo_ta_ung_dung  text,
  logo            text,
  ten_cong_ty     text NOT NULL DEFAULT '',
  ma_so_thue      text NOT NULL DEFAULT '',
  dia_chi         text,
  so_dien_thoai   text,
  email           text,
  website         text,
  tg_tao          timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.var_cong_ty IS 'Thông tin công ty — một dòng duy nhất (id = 1)';

CREATE OR REPLACE FUNCTION public.set_var_cong_ty_tg_cap_nhat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tg_cap_nhat := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS var_cong_ty_set_tg_cap_nhat ON public.var_cong_ty;
CREATE TRIGGER var_cong_ty_set_tg_cap_nhat
  BEFORE UPDATE ON public.var_cong_ty
  FOR EACH ROW
  EXECUTE FUNCTION public.set_var_cong_ty_tg_cap_nhat();

-- =============================================================================
-- F. var_phan_quyen (một dòng = một chức vụ + module; quyen CSV)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.var_phan_quyen (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_key  text NOT NULL,
  chuc_vu_id  bigint NOT NULL REFERENCES public.var_chuc_vu (id) ON DELETE CASCADE,
  quyen       text NOT NULL,
  tg_tao      timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT var_phan_quyen_chuc_vu_module_unique
    UNIQUE (chuc_vu_id, module_key)
);

COMMENT ON TABLE public.var_phan_quyen IS 'Phân quyền theo chức vụ — module_key snake; quyen là CSV tùy module (vd. xem,them,sua,xoa)';
COMMENT ON COLUMN public.var_phan_quyen.quyen IS 'Danh sách quyền phân tách bằng dấu phẩy — không giới hạn enum cố định';

-- DB cũ (nhiều dòng / CHECK enum): chạy scripts/migrate-var-phan-quyen-csv.sql (file riêng, idempotent)

CREATE INDEX IF NOT EXISTS var_phan_quyen_chuc_vu_id_idx
  ON public.var_phan_quyen (chuc_vu_id);

CREATE INDEX IF NOT EXISTS var_phan_quyen_module_key_idx
  ON public.var_phan_quyen (module_key);

CREATE OR REPLACE FUNCTION public.set_var_phan_quyen_tg_cap_nhat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tg_cap_nhat := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS var_phan_quyen_set_tg_cap_nhat ON public.var_phan_quyen;
CREATE TRIGGER var_phan_quyen_set_tg_cap_nhat
  BEFORE UPDATE ON public.var_phan_quyen
  FOR EACH ROW
  EXECUTE FUNCTION public.set_var_phan_quyen_tg_cap_nhat();

-- =============================================================================
-- G. Auth helpers (phụ thuộc bảng — chạy sau B–F)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id::text
  FROM public.var_nhan_vien
  WHERE lower(ten_dang_nhap) = public.jwt_login_name()
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
      WHERE lower(ten_dang_nhap) = public.jwt_login_name()
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_cap_bac()
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cv.cap_bac
  FROM public.var_chuc_vu cv
  WHERE cv.id::text = public.current_user_chuc_vu_id()
  LIMIT 1;
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
  v_module_key text;
  v_quyen text;
BEGIN
  IF public.current_user_cap_bac() = 1 THEN
    RETURN true;
  END IF;

  v_chuc_vu_id := public.current_user_chuc_vu_id();

  IF v_chuc_vu_id IS NULL THEN
    RETURN false;
  END IF;

  v_module_key := public.map_module_key_to_db(p_module_key);
  v_quyen := public.map_action_to_quyen(p_action);

  RETURN EXISTS (
    SELECT 1
    FROM public.var_phan_quyen pq
    CROSS JOIN LATERAL (
      SELECT trim(both FROM unnest(string_to_array(coalesce(pq.quyen, ''), ','))) AS token
    ) AS t
    WHERE pq.chuc_vu_id::text = v_chuc_vu_id
      AND pq.module_key = v_module_key
      AND (
        trim(both FROM pq.quyen) IN ('admin', 'tat_ca')
        OR trim(both FROM t.token) IN ('admin', 'tat_ca', v_quyen)
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_chuc_vu_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_cap_bac() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_permission(text, text) TO authenticated;

-- =============================================================================
-- H. Row Level Security
-- =============================================================================

ALTER TABLE public.var_phong_ban ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_phong_ban_select_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_select_authenticated
  ON public.var_phong_ban
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_permission('he-thong/phong-ban', 'view')
    OR nguoi_tao::text = public.current_employee_id()
  );

DROP POLICY IF EXISTS var_phong_ban_insert_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_insert_authenticated
  ON public.var_phong_ban
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_module_permission('he-thong/phong-ban', 'create')
  );

DROP POLICY IF EXISTS var_phong_ban_update_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_update_authenticated
  ON public.var_phong_ban
  FOR UPDATE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/phong-ban', 'update')
    OR nguoi_tao::text = public.current_employee_id()
  )
  WITH CHECK (
    public.has_module_permission('he-thong/phong-ban', 'update')
    OR nguoi_tao::text = public.current_employee_id()
  );

DROP POLICY IF EXISTS var_phong_ban_delete_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_delete_authenticated
  ON public.var_phong_ban
  FOR DELETE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/phong-ban', 'delete')
  );

ALTER TABLE public.var_chuc_vu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_chuc_vu_select_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_select_authenticated
  ON public.var_chuc_vu
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_permission('he-thong/chuc-vu', 'view')
    OR nguoi_tao::text = public.current_employee_id()
  );

DROP POLICY IF EXISTS var_chuc_vu_insert_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_insert_authenticated
  ON public.var_chuc_vu
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_module_permission('he-thong/chuc-vu', 'create')
  );

DROP POLICY IF EXISTS var_chuc_vu_update_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_update_authenticated
  ON public.var_chuc_vu
  FOR UPDATE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/chuc-vu', 'update')
    OR nguoi_tao::text = public.current_employee_id()
  )
  WITH CHECK (
    public.has_module_permission('he-thong/chuc-vu', 'update')
    OR nguoi_tao::text = public.current_employee_id()
  );

DROP POLICY IF EXISTS var_chuc_vu_delete_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_delete_authenticated
  ON public.var_chuc_vu
  FOR DELETE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/chuc-vu', 'delete')
  );

ALTER TABLE public.var_nhan_vien ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_nhan_vien_select_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_select_authenticated
  ON public.var_nhan_vien
  FOR SELECT
  TO authenticated
  USING (
    lower(ten_dang_nhap) = public.jwt_login_name()
    OR public.has_module_permission('he-thong/nhan-vien', 'view')
    OR nguoi_tao::text = public.current_employee_id()
  );

DROP POLICY IF EXISTS var_nhan_vien_insert_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_insert_authenticated
  ON public.var_nhan_vien
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_module_permission('he-thong/nhan-vien', 'create')
  );

DROP POLICY IF EXISTS var_nhan_vien_update_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_update_authenticated
  ON public.var_nhan_vien
  FOR UPDATE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/nhan-vien', 'update')
    OR nguoi_tao::text = public.current_employee_id()
  )
  WITH CHECK (
    public.has_module_permission('he-thong/nhan-vien', 'update')
    OR nguoi_tao::text = public.current_employee_id()
  );

DROP POLICY IF EXISTS var_nhan_vien_delete_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_delete_authenticated
  ON public.var_nhan_vien
  FOR DELETE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/nhan-vien', 'delete')
  );

ALTER TABLE public.var_cong_ty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_cong_ty_select_authenticated ON public.var_cong_ty;
CREATE POLICY var_cong_ty_select_authenticated
  ON public.var_cong_ty
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_permission('he-thong/thong-tin-cong-ty', 'view')
    OR public.has_module_permission('he-thong/thong-tin-cong-ty', 'update')
  );

DROP POLICY IF EXISTS var_cong_ty_write_authenticated ON public.var_cong_ty;
CREATE POLICY var_cong_ty_write_authenticated
  ON public.var_cong_ty
  FOR ALL
  TO authenticated
  USING (
    public.has_module_permission('he-thong/thong-tin-cong-ty', 'update')
  )
  WITH CHECK (
    public.has_module_permission('he-thong/thong-tin-cong-ty', 'update')
  );

ALTER TABLE public.var_phan_quyen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_phan_quyen_select_authenticated ON public.var_phan_quyen;
CREATE POLICY var_phan_quyen_select_authenticated
  ON public.var_phan_quyen
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_permission('he-thong/phan-quyen', 'view')
    OR public.has_module_permission('he-thong/phan-quyen', 'update')
    OR public.has_module_permission('he-thong/phan-quyen', 'admin')
  );

DROP POLICY IF EXISTS var_phan_quyen_write_authenticated ON public.var_phan_quyen;
CREATE POLICY var_phan_quyen_write_authenticated
  ON public.var_phan_quyen
  FOR ALL
  TO authenticated
  USING (
    public.has_module_permission('he-thong/phan-quyen', 'admin')
    OR public.has_module_permission('he-thong/phan-quyen', 'update')
  )
  WITH CHECK (
    public.has_module_permission('he-thong/phan-quyen', 'admin')
    OR public.has_module_permission('he-thong/phan-quyen', 'update')
  );

-- =============================================================================
-- I. RPC
-- =============================================================================

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
  WHERE lower(ten_dang_nhap) = public.jwt_login_name();
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_login_username(p_login_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_login text;
  v_row public.var_nhan_vien%ROWTYPE;
BEGIN
  v_login := lower(trim(coalesce(p_login_name, '')));
  IF v_login = '' THEN
    RETURN 'not_found';
  END IF;

  SELECT *
  INTO v_row
  FROM public.var_nhan_vien
  WHERE lower(ten_dang_nhap) = v_login
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_row.tai_khoan_dang_hoat_dong IS FALSE THEN
    RETURN 'inactive';
  END IF;

  IF v_row.trang_thai = 'Nghỉ việc' THEN
    RETURN 'resigned';
  END IF;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.check_login_username(text) IS
  'Pre-login username check (anon-safe). Returns: not_found | inactive | resigned | ok';

GRANT EXECUTE ON FUNCTION public.check_login_username(text) TO anon, authenticated;
