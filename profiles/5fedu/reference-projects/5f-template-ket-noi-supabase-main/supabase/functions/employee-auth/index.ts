import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  loginNameToSupabaseEmail,
  normalizeLoginName,
} from '../_shared/auth-email.ts';

type EmployeeAuthAction =
  | 'create'
  | 'change_login'
  | 'reset_password'
  | 'sync_metadata'
  | 'disable'
  | 'enable';

interface EmployeeAuthBody {
  action: EmployeeAuthAction;
  employee_id: string;
  ten_dang_nhap?: string;
  password?: string;
  ho_ten?: string;
  phong_ban_id?: string | null;
  chuc_vu_id?: string | null;
  ma_chuc_vu?: string | null;
  trang_thai?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function assertCallerHasNhanVienPermission(
  req: Request,
  action: EmployeeAuthAction,
  supabaseUrl: string,
  anonKey: string,
  serviceClient: ReturnType<typeof createClient>,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const pAction = action === 'create' ? 'create' : 'update';
  const { data: allowed, error: permError } = await userClient.rpc('has_module_permission', {
    p_module_key: 'he-thong/nhan-vien',
    p_action: pAction,
  });

  if (permError) {
    return jsonResponse({ error: permError.message }, 500);
  }
  if (!allowed) {
    return jsonResponse({ error: 'Forbidden — insufficient permission on nhan-vien module' }, 403);
  }

  return { userId: userData.user.id };
}

function buildMetadata(body: EmployeeAuthBody): Record<string, unknown> {
  return {
    employee_id: body.employee_id,
    full_name: body.ho_ten,
    id_phong_ban: body.phong_ban_id,
    id_chuc_vu: body.chuc_vu_id ? [body.chuc_vu_id] : [],
  };
}

async function findEmployeeByLoginName(
  adminClient: ReturnType<typeof createClient>,
  tenDangNhap: string,
): Promise<{ id: string } | null> {
  const loginName = normalizeLoginName(tenDangNhap);
  const { data, error } = await adminClient
    .from('var_nhan_vien')
    .select('id')
    .ilike('ten_dang_nhap', loginName)
    .maybeSingle();

  if (error || !data?.id) return null;
  return { id: String(data.id) };
}

/** Reject if login taken by another employee; delete orphan Auth user if safe. */
async function deleteOrphanAuthUserIfSafe(
  adminClient: ReturnType<typeof createClient>,
  tenDangNhap: string,
  employeeId: string,
): Promise<Response | null> {
  const loginName = normalizeLoginName(tenDangNhap);
  const existingEmployee = await findEmployeeByLoginName(adminClient, loginName);
  if (existingEmployee && existingEmployee.id !== String(employeeId)) {
    return jsonResponse({ error: 'LOGIN_NAME_TAKEN' }, 409);
  }

  const orphanAuthUserId = await resolveAuthUserByLoginName(adminClient, loginName);
  if (orphanAuthUserId) {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(orphanAuthUserId);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 400);
    }
  }

  return null;
}

async function resolveAuthUserByLoginName(
  adminClient: ReturnType<typeof createClient>,
  tenDangNhap: string,
): Promise<string | null> {
  const email = loginNameToSupabaseEmail(normalizeLoginName(tenDangNhap));
  let page = 1;
  const perPage = 200;

  while (page <= 50) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) return null;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match?.id) return match.id;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

function resolveLoginName(
  row: { ten_dang_nhap: string | null },
  body: EmployeeAuthBody,
): string | null {
  const raw = body.ten_dang_nhap ?? row.ten_dang_nhap;
  if (!raw?.trim()) return null;
  return normalizeLoginName(raw);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Server misconfigured' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = (await req.json()) as EmployeeAuthBody;
    if (!body.action || !body.employee_id) {
      return jsonResponse({ error: 'Missing action or employee_id' }, 400);
    }

    const authCheck = await assertCallerHasNhanVienPermission(
      req,
      body.action,
      supabaseUrl,
      anonKey,
      adminClient,
    );
    if (authCheck instanceof Response) return authCheck;

    const { data: employee, error: fetchError } = await adminClient
      .from('var_nhan_vien')
      .select('id, ten_dang_nhap, ho_ten, phong_ban_id, chuc_vu_id, trang_thai, var_chuc_vu(ma_chuc_vu)')
      .eq('id', body.employee_id)
      .maybeSingle();

    if (fetchError) return jsonResponse({ error: fetchError.message }, 500);
    if (!employee) return jsonResponse({ error: 'Employee not found' }, 404);

    const row = employee as {
      id: string;
      ten_dang_nhap: string | null;
      ho_ten: string;
      phong_ban_id: string | null;
      chuc_vu_id: string | null;
      trang_thai: string;
      var_chuc_vu?: { ma_chuc_vu?: string } | null;
    };

    const maChucVu = row.var_chuc_vu?.ma_chuc_vu ?? null;
    const nowIso = new Date().toISOString();

    switch (body.action) {
      case 'create': {
        if (row.ten_dang_nhap?.trim()) {
          return jsonResponse({ error: 'Employee already has auth account' }, 409);
        }
        if (!body.ten_dang_nhap || !body.password) {
          return jsonResponse({ error: 'Missing ten_dang_nhap or password' }, 400);
        }
        const loginName = normalizeLoginName(body.ten_dang_nhap);
        const email = loginNameToSupabaseEmail(loginName);

        const orphanCheck = await deleteOrphanAuthUserIfSafe(
          adminClient,
          loginName,
          body.employee_id,
        );
        if (orphanCheck) return orphanCheck;

        const metadata = buildMetadata({
          ...body,
          ho_ten: body.ho_ten ?? row.ho_ten,
          phong_ban_id: body.phong_ban_id ?? row.phong_ban_id,
          chuc_vu_id: body.chuc_vu_id ?? row.chuc_vu_id,
          ma_chuc_vu: maChucVu,
        });

        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: metadata,
        });

        if (createError) return jsonResponse({ error: createError.message }, 400);

        const authUserId = created.user?.id;
        if (!authUserId) return jsonResponse({ error: 'Auth user not created' }, 500);

        const { error: updateError } = await adminClient
          .from('var_nhan_vien')
          .update({
            ten_dang_nhap: loginName,
            must_change_password: true,
            tai_khoan_dang_hoat_dong: true,
            tg_cap_nhat: nowIso,
          })
          .eq('id', body.employee_id);

        if (updateError) return jsonResponse({ error: updateError.message }, 500);

        return jsonResponse({
          auth_user_id: authUserId,
          must_change_password: true,
          tai_khoan_dang_hoat_dong: true,
        });
      }

      case 'change_login': {
        if (!row.ten_dang_nhap?.trim()) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        if (!body.ten_dang_nhap || !body.password) {
          return jsonResponse({ error: 'Missing ten_dang_nhap or password' }, 400);
        }
        if (body.password.length < 6) {
          return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);
        }

        const oldLogin = normalizeLoginName(row.ten_dang_nhap);
        const newLogin = normalizeLoginName(body.ten_dang_nhap);
        if (oldLogin === newLogin) {
          return jsonResponse({ error: 'New login must differ from current' }, 400);
        }

        const oldAuthUserId = await resolveAuthUserByLoginName(adminClient, oldLogin);
        if (!oldAuthUserId) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }

        const orphanCheck = await deleteOrphanAuthUserIfSafe(
          adminClient,
          newLogin,
          body.employee_id,
        );
        if (orphanCheck) return orphanCheck;

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(oldAuthUserId);
        if (deleteError) {
          return jsonResponse({ error: deleteError.message }, 400);
        }

        const metadata = buildMetadata({
          ...body,
          employee_id: row.id,
          ho_ten: body.ho_ten ?? row.ho_ten,
          phong_ban_id: body.phong_ban_id ?? row.phong_ban_id,
          chuc_vu_id: body.chuc_vu_id ?? row.chuc_vu_id,
          ma_chuc_vu: maChucVu,
        });

        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email: loginNameToSupabaseEmail(newLogin),
          password: body.password,
          email_confirm: true,
          user_metadata: metadata,
        });

        if (createError) {
          return jsonResponse(
            {
              error: `Failed to create new auth user after deleting old account: ${createError.message}`,
              old_login: oldLogin,
            },
            500,
          );
        }

        const newAuthUserId = created.user?.id;
        if (!newAuthUserId) {
          return jsonResponse(
            { error: 'Auth user not created after delete', old_login: oldLogin },
            500,
          );
        }

        const { error: updateError } = await adminClient
          .from('var_nhan_vien')
          .update({
            ten_dang_nhap: newLogin,
            must_change_password: true,
            tai_khoan_dang_hoat_dong: true,
            tg_cap_nhat: nowIso,
          })
          .eq('id', body.employee_id);

        if (updateError) {
          return jsonResponse({ error: updateError.message }, 500);
        }

        return jsonResponse({
          auth_user_id: newAuthUserId,
          must_change_password: true,
          tai_khoan_dang_hoat_dong: true,
          ten_dang_nhap: newLogin,
        });
      }

      case 'reset_password': {
        const loginName = resolveLoginName(row, body);
        if (!loginName) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        if (!body.password) {
          return jsonResponse({ error: 'Missing password' }, 400);
        }
        const authUserId = await resolveAuthUserByLoginName(adminClient, loginName);
        if (!authUserId) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        const { error: resetError } = await adminClient.auth.admin.updateUserById(authUserId, {
          password: body.password,
        });
        if (resetError) return jsonResponse({ error: resetError.message }, 400);

        await adminClient
          .from('var_nhan_vien')
          .update({ must_change_password: true, tg_cap_nhat: nowIso })
          .eq('id', body.employee_id);

        return jsonResponse({
          auth_user_id: authUserId,
          must_change_password: true,
        });
      }

      case 'sync_metadata': {
        const loginName = resolveLoginName(row, body);
        if (!loginName) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        const authUserId = await resolveAuthUserByLoginName(adminClient, loginName);
        if (!authUserId) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        const metadata = buildMetadata({
          ...body,
          employee_id: row.id,
          ho_ten: body.ho_ten ?? row.ho_ten,
          phong_ban_id: body.phong_ban_id ?? row.phong_ban_id,
          chuc_vu_id: body.chuc_vu_id ?? row.chuc_vu_id,
          ma_chuc_vu: maChucVu,
        });
        const { error: syncError } = await adminClient.auth.admin.updateUserById(authUserId, {
          user_metadata: metadata,
        });
        if (syncError) return jsonResponse({ error: syncError.message }, 400);
        return jsonResponse({ auth_user_id: authUserId });
      }

      case 'disable': {
        const loginName = resolveLoginName(row, body);
        if (!loginName) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        const authUserId = await resolveAuthUserByLoginName(adminClient, loginName);
        if (!authUserId) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        await adminClient.auth.admin.updateUserById(authUserId, { ban_duration: '876000h' });
        await adminClient
          .from('var_nhan_vien')
          .update({
            tai_khoan_dang_hoat_dong: false,
            tg_cap_nhat: nowIso,
          })
          .eq('id', body.employee_id);
        return jsonResponse({ auth_user_id: authUserId, tai_khoan_dang_hoat_dong: false });
      }

      case 'enable': {
        const loginName = resolveLoginName(row, body);
        if (!loginName) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        const authUserId = await resolveAuthUserByLoginName(adminClient, loginName);
        if (!authUserId) {
          return jsonResponse({ error: 'No auth account linked' }, 404);
        }
        await adminClient.auth.admin.updateUserById(authUserId, { ban_duration: 'none' });
        await adminClient
          .from('var_nhan_vien')
          .update({
            tai_khoan_dang_hoat_dong: true,
            tg_cap_nhat: nowIso,
          })
          .eq('id', body.employee_id);
        return jsonResponse({ auth_user_id: authUserId, tai_khoan_dang_hoat_dong: true });
      }

      default:
        return jsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return jsonResponse({ error: message }, 500);
  }
});
