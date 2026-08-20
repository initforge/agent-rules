-- var_chuc_vu: master data Chức vụ

CREATE TABLE IF NOT EXISTS public.var_chuc_vu (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_chuc_vu    text NOT NULL,
  ten_chuc_vu   text NOT NULL,
  cap_bac       smallint,
  phong_ban_id  bigint REFERENCES public.var_phong_ban (id) ON DELETE RESTRICT,
  mo_ta         text,
  thu_tu        integer NOT NULL DEFAULT 1,
  trang_thai    text NOT NULL DEFAULT 'Đang hoạt động'
                CHECK (trang_thai IN ('Ngừng hoạt động', 'Đang hoạt động')),
  tg_tao        timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.var_chuc_vu IS 'Danh mục chức vụ — liên kết phòng ban';

CREATE UNIQUE INDEX IF NOT EXISTS var_chuc_vu_ma_lower_idx
  ON public.var_chuc_vu (lower(ma_chuc_vu));

CREATE INDEX IF NOT EXISTS var_chuc_vu_phong_ban_id_idx
  ON public.var_chuc_vu (phong_ban_id);

CREATE INDEX IF NOT EXISTS var_chuc_vu_trang_thai_idx
  ON public.var_chuc_vu (trang_thai);

CREATE OR REPLACE FUNCTION public.set_var_chuc_vu_tg_cap_nhat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tg_cap_nhat := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS var_chuc_vu_set_tg_cap_nhat ON public.var_chuc_vu;
CREATE TRIGGER var_chuc_vu_set_tg_cap_nhat
  BEFORE UPDATE ON public.var_chuc_vu
  FOR EACH ROW
  EXECUTE FUNCTION public.set_var_chuc_vu_tg_cap_nhat();

ALTER TABLE public.var_chuc_vu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_chuc_vu_select_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_select_authenticated
  ON public.var_chuc_vu
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS var_chuc_vu_insert_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_insert_authenticated
  ON public.var_chuc_vu
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/chuc-vu', 'create')
  );

DROP POLICY IF EXISTS var_chuc_vu_update_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_update_authenticated
  ON public.var_chuc_vu
  FOR UPDATE
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/chuc-vu', 'update')
  )
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/chuc-vu', 'update')
  );

DROP POLICY IF EXISTS var_chuc_vu_delete_authenticated ON public.var_chuc_vu;
CREATE POLICY var_chuc_vu_delete_authenticated
  ON public.var_chuc_vu
  FOR DELETE
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/chuc-vu', 'delete')
  );
