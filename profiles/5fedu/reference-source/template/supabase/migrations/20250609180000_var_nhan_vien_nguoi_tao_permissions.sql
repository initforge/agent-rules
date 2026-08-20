-- Permission: nguoi_tao on var_nhan_vien, cap_bac super-user bypass, row-level RLS

ALTER TABLE public.var_nhan_vien
  ADD COLUMN IF NOT EXISTS nguoi_tao bigint REFERENCES public.var_nhan_vien (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.var_nhan_vien.nguoi_tao IS 'NV tạo bản ghi — dùng RLS xem/sửa dòng mình tạo';

CREATE INDEX IF NOT EXISTS var_nhan_vien_nguoi_tao_idx
  ON public.var_nhan_vien (nguoi_tao);

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

GRANT EXECUTE ON FUNCTION public.current_user_cap_bac() TO authenticated;

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
