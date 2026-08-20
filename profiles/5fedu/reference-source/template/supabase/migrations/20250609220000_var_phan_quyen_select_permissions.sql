-- Phân quyền: siết SELECT ma trận theo quyền view/update/admin module

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
