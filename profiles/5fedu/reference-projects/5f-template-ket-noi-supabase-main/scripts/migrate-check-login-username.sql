-- Pre-login username status RPC (anon-safe) for Vietnamese login error messages.
-- Run on existing DBs that already have bootstrap-var-he-thong.sql applied.

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
