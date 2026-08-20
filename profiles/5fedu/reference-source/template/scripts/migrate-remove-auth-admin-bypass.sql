-- Migration: remove JWT role (is_auth_admin) bypass — authorization only via var_phan_quyen.
-- Run on existing DB after bootstrap-var-he-thong.sql (idempotent).
-- Fresh DB: bootstrap-var-he-thong.sql already includes these changes.

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

GRANT EXECUTE ON FUNCTION public.has_module_permission(text, text) TO authenticated;

-- var_phong_ban
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
  )
  WITH CHECK (
    public.has_module_permission('he-thong/phong-ban', 'update')
  );

DROP POLICY IF EXISTS var_phong_ban_delete_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_delete_authenticated
  ON public.var_phong_ban
  FOR DELETE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/phong-ban', 'delete')
  );

-- var_chuc_vu
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
  )
  WITH CHECK (
    public.has_module_permission('he-thong/chuc-vu', 'update')
  );

DROP POLICY IF EXISTS var_chuc_vu_delete_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_delete_authenticated
  ON public.var_chuc_vu
  FOR DELETE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/chuc-vu', 'delete')
  );

-- var_nhan_vien
DROP POLICY IF EXISTS var_nhan_vien_select_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_select_authenticated
  ON public.var_nhan_vien
  FOR SELECT
  TO authenticated
  USING (
    lower(ten_dang_nhap) = public.jwt_login_name()
    OR public.has_module_permission('he-thong/nhan-vien', 'view')
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
  )
  WITH CHECK (
    public.has_module_permission('he-thong/nhan-vien', 'update')
  );

DROP POLICY IF EXISTS var_nhan_vien_delete_authenticated ON public.var_nhan_vien;
CREATE POLICY var_nhan_vien_delete_authenticated
  ON public.var_nhan_vien
  FOR DELETE
  TO authenticated
  USING (
    public.has_module_permission('he-thong/nhan-vien', 'delete')
  );

-- var_cong_ty
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

-- var_phan_quyen
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
