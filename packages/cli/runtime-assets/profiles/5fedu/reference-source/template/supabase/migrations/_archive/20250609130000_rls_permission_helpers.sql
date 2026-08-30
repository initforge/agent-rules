-- RLS helpers aligned with phan_quyen matrix (module_key + vai_tro = chuc_vu id).

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
      FROM public.he_thong_nhan_vien
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_module_permission(p_module_key text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_auth_admin()
    OR EXISTS (
      SELECT 1
      FROM public.phan_quyen pq
      WHERE pq.vai_tro = public.current_user_chuc_vu_id()
        AND pq.module_key = p_module_key
        AND (
          pq.phan_quyen::jsonb @> to_jsonb(ARRAY[p_action])
          OR pq.phan_quyen::jsonb @> '["all"]'::jsonb
          OR pq.phan_quyen::jsonb @> '["admin"]'::jsonb
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_chuc_vu_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_permission(text, text) TO authenticated;

-- Tighten employee SELECT: admin, self, or module view permission
DROP POLICY IF EXISTS he_thong_nhan_vien_select_authenticated ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_select_authenticated
  ON public.he_thong_nhan_vien
  FOR SELECT
  TO authenticated
  USING (
    public.is_auth_admin()
    OR auth_user_id = auth.uid()
    OR public.has_module_permission('he-thong/nhan-vien', 'view')
  );

-- Employee writes: admin or module create/update/delete (HR operators)
DROP POLICY IF EXISTS he_thong_nhan_vien_insert_admin ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_insert_admin
  ON public.he_thong_nhan_vien
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/nhan-vien', 'create')
  );

DROP POLICY IF EXISTS he_thong_nhan_vien_update_admin ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_update_admin
  ON public.he_thong_nhan_vien
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

DROP POLICY IF EXISTS he_thong_nhan_vien_delete_admin ON public.he_thong_nhan_vien;
CREATE POLICY he_thong_nhan_vien_delete_admin
  ON public.he_thong_nhan_vien
  FOR DELETE
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/nhan-vien', 'delete')
  );

-- phan_quyen writes: admin or permissions module admin
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
