-- var_cong_ty + var_phan_quyen; thay phan_quyen (jsonb matrix)

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

GRANT EXECUTE ON FUNCTION public.map_module_key_to_db(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_action_to_quyen(text) TO authenticated;

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

ALTER TABLE public.var_cong_ty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_cong_ty_select_authenticated ON public.var_cong_ty;
CREATE POLICY var_cong_ty_select_authenticated
  ON public.var_cong_ty
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS var_cong_ty_write_authenticated ON public.var_cong_ty;
CREATE POLICY var_cong_ty_write_authenticated
  ON public.var_cong_ty
  FOR ALL
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/thong-tin-cong-ty', 'update')
  )
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/thong-tin-cong-ty', 'update')
  );

CREATE TABLE IF NOT EXISTS public.var_phan_quyen (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_key  text NOT NULL,
  chuc_vu_id  bigint NOT NULL REFERENCES public.var_chuc_vu (id) ON DELETE CASCADE,
  quyen       text NOT NULL
              CHECK (quyen IN ('xem', 'them', 'sua', 'xoa', 'admin', 'tat_ca')),
  tg_tao      timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT var_phan_quyen_chuc_vu_module_quyen_unique
    UNIQUE (chuc_vu_id, module_key, quyen)
);

COMMENT ON TABLE public.var_phan_quyen IS 'Phân quyền theo chức vụ — module_key snake (nhan_vien), quyen tiếng Việt';

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

ALTER TABLE public.var_phan_quyen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_phan_quyen_select_authenticated ON public.var_phan_quyen;
CREATE POLICY var_phan_quyen_select_authenticated
  ON public.var_phan_quyen
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS var_phan_quyen_write_authenticated ON public.var_phan_quyen;
CREATE POLICY var_phan_quyen_write_authenticated
  ON public.var_phan_quyen
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

DROP POLICY IF EXISTS phan_quyen_select_authenticated ON public.phan_quyen;
DROP POLICY IF EXISTS phan_quyen_write_admin ON public.phan_quyen;
DROP TABLE IF EXISTS public.phan_quyen CASCADE;

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
  IF public.is_auth_admin() THEN
    RETURN true;
  END IF;

  IF to_regclass('public.var_phan_quyen') IS NULL THEN
    RETURN false;
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
    WHERE pq.chuc_vu_id::text = v_chuc_vu_id
      AND pq.module_key = v_module_key
      AND (
        pq.quyen = v_quyen
        OR pq.quyen = 'tat_ca'
        OR pq.quyen = 'admin'
      )
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN false;
END;
$$;
