-- Drop auth_user_id — nhận diện nhân viên qua JWT email ↔ ten_dang_nhap

CREATE OR REPLACE FUNCTION public.jwt_login_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(split_part(coalesce(auth.jwt()->>'email', ''), '@', 1));
$$;

GRANT EXECUTE ON FUNCTION public.jwt_login_name() TO authenticated;

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

  v_chuc_vu_id := coalesce(
    (auth.jwt() -> 'user_metadata' -> 'id_chuc_vu' ->> 0),
    NULL
  );

  IF v_chuc_vu_id IS NULL AND to_regclass('public.var_nhan_vien') IS NOT NULL THEN
    SELECT chuc_vu_id::text
    INTO v_chuc_vu_id
    FROM public.var_nhan_vien
    WHERE lower(ten_dang_nhap) = public.jwt_login_name()
    LIMIT 1;
  END IF;

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

DROP POLICY IF EXISTS var_nhan_vien_select_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_select_authenticated
  ON public.var_nhan_vien
  FOR SELECT
  TO authenticated
  USING (
    public.is_auth_admin()
    OR lower(ten_dang_nhap) = public.jwt_login_name()
    OR public.has_module_permission('he-thong/nhan-vien', 'view')
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
  WHERE lower(ten_dang_nhap) = public.jwt_login_name();
END;
$$;

DROP INDEX IF EXISTS public.var_nhan_vien_auth_user_id_idx;

ALTER TABLE public.var_nhan_vien
  DROP COLUMN IF EXISTS auth_user_id;

COMMENT ON COLUMN public.var_nhan_vien.ten_dang_nhap IS
  'Login username (local part); khớp local-part JWT email Auth = ten_dang_nhap + suffix';
