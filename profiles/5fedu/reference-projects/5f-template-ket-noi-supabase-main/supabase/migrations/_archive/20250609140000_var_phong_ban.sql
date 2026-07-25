-- var_phong_ban: master data Phòng ban (2-level hierarchy)

-- RLS helpers (idempotent; full matrix version in 20250609130000 when phan_quyen exists)
CREATE OR REPLACE FUNCTION public.is_auth_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
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

GRANT EXECUTE ON FUNCTION public.is_auth_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_permission(text, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.var_phong_ban (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_phong_ban  text NOT NULL,
  ten_phong_ban text NOT NULL,
  mo_ta         text,
  cha_id        bigint REFERENCES public.var_phong_ban (id) ON DELETE RESTRICT,
  cap_do        smallint NOT NULL DEFAULT 1
                CHECK (cap_do >= 1 AND cap_do <= 2),
  duong_dan     text NOT NULL DEFAULT '',
  trang_thai    text NOT NULL DEFAULT 'Đang hoạt động'
                CHECK (trang_thai IN ('Ngừng hoạt động', 'Đang hoạt động')),
  thu_tu        integer NOT NULL DEFAULT 1,
  tg_tao        timestamptz NOT NULL DEFAULT now(),
  tg_cap_nhat   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT var_phong_ban_root_no_parent
    CHECK ((cha_id IS NULL AND cap_do = 1) OR (cha_id IS NOT NULL AND cap_do = 2))
);

COMMENT ON TABLE public.var_phong_ban IS 'Danh mục phòng ban — cây 2 cấp (phòng gốc + nhóm con)';

CREATE UNIQUE INDEX IF NOT EXISTS var_phong_ban_ma_lower_idx
  ON public.var_phong_ban (lower(ma_phong_ban));

CREATE INDEX IF NOT EXISTS var_phong_ban_cha_id_idx
  ON public.var_phong_ban (cha_id);

CREATE INDEX IF NOT EXISTS var_phong_ban_duong_dan_idx
  ON public.var_phong_ban (duong_dan);

CREATE INDEX IF NOT EXISTS var_phong_ban_trang_thai_idx
  ON public.var_phong_ban (trang_thai);

CREATE INDEX IF NOT EXISTS var_phong_ban_thu_tu_idx
  ON public.var_phong_ban (thu_tu);

CREATE OR REPLACE FUNCTION public.set_var_phong_ban_tg_cap_nhat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tg_cap_nhat := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS var_phong_ban_set_tg_cap_nhat ON public.var_phong_ban;
CREATE TRIGGER var_phong_ban_set_tg_cap_nhat
  BEFORE UPDATE ON public.var_phong_ban
  FOR EACH ROW
  EXECUTE FUNCTION public.set_var_phong_ban_tg_cap_nhat();

ALTER TABLE public.var_phong_ban ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS var_phong_ban_select_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_select_authenticated
  ON public.var_phong_ban
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS var_phong_ban_insert_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_insert_authenticated
  ON public.var_phong_ban
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/phong-ban', 'create')
  );

DROP POLICY IF EXISTS var_phong_ban_update_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_update_authenticated
  ON public.var_phong_ban
  FOR UPDATE
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/phong-ban', 'update')
  )
  WITH CHECK (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/phong-ban', 'update')
  );

DROP POLICY IF EXISTS var_phong_ban_delete_authenticated ON public.var_phong_ban;
CREATE POLICY var_phong_ban_delete_authenticated
  ON public.var_phong_ban
  FOR DELETE
  TO authenticated
  USING (
    public.is_auth_admin()
    OR public.has_module_permission('he-thong/phong-ban', 'delete')
  );
