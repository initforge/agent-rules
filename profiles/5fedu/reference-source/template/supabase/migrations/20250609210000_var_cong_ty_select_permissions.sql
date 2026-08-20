-- Thông tin công ty: siết SELECT theo quyền view module

DROP POLICY IF EXISTS var_cong_ty_select_authenticated ON public.var_cong_ty;
CREATE POLICY var_cong_ty_select_authenticated
  ON public.var_cong_ty
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_permission('he-thong/thong-tin-cong-ty', 'view')
    OR public.has_module_permission('he-thong/thong-tin-cong-ty', 'update')
  );
