-- =============================================================================
-- Migration: var_phan_quyen → một dòng / (chuc_vu + module), cột quyen CSV
-- =============================================================================
-- Chạy file NÀY trên DB đã có bảng (schema cũ hoặc bootstrap lỗi giữa chừng).
-- Idempotent — có thể chạy lại nhiều lần.
--
-- Không cần chạy nếu fresh DB + bootstrap mới đã tạo đúng unique (chuc_vu_id, module_key).
--
-- Thứ tự gợi ý:
--   1) bootstrap-var-he-thong.sql  (nếu chưa có bảng)
--   2) migrate-var-phan-quyen-csv.sql  ← file này (DB cũ / sửa quyền)
--   3) seed-var-he-thong.sql + seed-demo-*.sql
-- =============================================================================

DO $migrate$
DECLARE
  v_has_old_unique boolean;
  v_has_duplicates boolean;
BEGIN
  IF to_regclass('public.var_phan_quyen') IS NULL THEN
    RAISE EXCEPTION
      'Chưa có bảng public.var_phan_quyen. Chạy scripts/bootstrap-var-he-thong.sql trước.';
  END IF;

  ALTER TABLE public.var_phan_quyen
    DROP CONSTRAINT IF EXISTS var_phan_quyen_quyen_check;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'var_phan_quyen_chuc_vu_module_quyen_unique'
      AND conrelid = 'public.var_phan_quyen'::regclass
  ) INTO v_has_old_unique;

  SELECT EXISTS (
    SELECT 1
    FROM public.var_phan_quyen
    GROUP BY chuc_vu_id, module_key
    HAVING count(*) > 1
  ) INTO v_has_duplicates;

  IF v_has_old_unique OR v_has_duplicates THEN
    DROP TABLE IF EXISTS _var_pq_merged;

    CREATE TEMP TABLE _var_pq_merged AS
    SELECT
      chuc_vu_id,
      module_key,
      string_agg(q, ',' ORDER BY q) AS quyen,
      min(tg_tao) AS tg_tao,
      max(tg_cap_nhat) AS tg_cap_nhat
    FROM (
      SELECT DISTINCT
        chuc_vu_id,
        module_key,
        trim(both FROM quyen) AS q,
        tg_tao,
        tg_cap_nhat
      FROM public.var_phan_quyen
    ) AS tokens
    GROUP BY chuc_vu_id, module_key;

    TRUNCATE public.var_phan_quyen RESTART IDENTITY;

    INSERT INTO public.var_phan_quyen (module_key, chuc_vu_id, quyen, tg_tao, tg_cap_nhat)
    SELECT module_key, chuc_vu_id, quyen, tg_tao, tg_cap_nhat
    FROM _var_pq_merged;

    DROP TABLE _var_pq_merged;

    IF v_has_old_unique THEN
      ALTER TABLE public.var_phan_quyen
        DROP CONSTRAINT var_phan_quyen_chuc_vu_module_quyen_unique;
    END IF;

    RAISE NOTICE 'Đã gộp var_phan_quyen sang CSV (một dòng / chức vụ + module).';
  ELSE
    RAISE NOTICE 'Không cần gộp dòng — bảng đã đúng hoặc chưa có dữ liệu trùng.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'var_phan_quyen_chuc_vu_module_unique'
      AND conrelid = 'public.var_phan_quyen'::regclass
  ) THEN
    ALTER TABLE public.var_phan_quyen
      ADD CONSTRAINT var_phan_quyen_chuc_vu_module_unique UNIQUE (chuc_vu_id, module_key);
    RAISE NOTICE 'Đã thêm unique (chuc_vu_id, module_key).';
  END IF;
END $migrate$;

-- Cập nhật hàm kiểm tra quyền — đọc quyen CSV
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
