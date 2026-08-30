-- Phòng ban: nguoi_tao + row-level RLS (Strict SELECT)

ALTER TABLE public.var_phong_ban
  ADD COLUMN IF NOT EXISTS nguoi_tao bigint REFERENCES public.var_nhan_vien (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.var_phong_ban.nguoi_tao IS 'NV tạo bản ghi — RLS xem/sửa dòng mình tạo';

CREATE INDEX IF NOT EXISTS var_phong_ban_nguoi_tao_idx
  ON public.var_phong_ban (nguoi_tao);

DROP POLICY IF EXISTS var_phong_ban_select_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_select_authenticated
  ON public.var_phong_ban
  FOR SELECT
  TO authenticated
  USING (
    public.has_module_permission('he-thong/phong-ban', 'view')
    OR nguoi_tao::text = public.current_employee_id()
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
