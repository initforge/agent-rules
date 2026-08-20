-- Chức vụ: nguoi_tao + row-level RLS (Strict SELECT)

ALTER TABLE public.var_chuc_vu
  ADD COLUMN IF NOT EXISTS nguoi_tao bigint REFERENCES public.var_nhan_vien (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.var_chuc_vu.nguoi_tao IS 'NV tạo bản ghi — RLS xem/sửa dòng mình tạo';

CREATE INDEX IF NOT EXISTS var_chuc_vu_nguoi_tao_idx
  ON public.var_chuc_vu (nguoi_tao);

DROP POLICY IF EXISTS var_chuc_vu_select_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_select_authenticated
  ON public.var_chuc_vu
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_permission('he-thong/chuc-vu', 'view')
    OR nguoi_tao::text = public.current_employee_id()
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
