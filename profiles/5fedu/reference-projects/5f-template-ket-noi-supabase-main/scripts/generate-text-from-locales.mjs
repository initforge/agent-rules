import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const loc = path.join(root, 'locales');

if (!fs.existsSync(loc)) {
  console.error('Thiếu thư mục locales/. Chuỗi nằm trong lib/text/*.ts và features/**/text.ts — không cần script này nữa.');
  process.exit(1);
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(loc, name), 'utf8'));
}

/** Gộp key phẳng thành cây — xử lý xung đột key lá vs tiền tố (vd. nav.changePassword vs nav.changePassword.title). */
function nestFlat(flat) {
  const keys = Object.keys(flat).sort((a, b) => b.split('.').length - a.split('.').length);
  const root = {};
  for (const key of keys) {
    const value = flat[key];
    const parts = key.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) {
        cur[p] = {};
      }
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

function stripPrefixNest(flat, prefix) {
  const sub = {};
  const pl = prefix + '.';
  for (const [key, value] of Object.entries(flat)) {
    if (!key.startsWith(pl)) continue;
    const rest = key.slice(pl.length);
    const parts = rest.split('.');
    let cur = sub;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return sub;
}

function emitTsConst(name, obj, outPath, comment) {
  const body = JSON.stringify(obj, null, 2);
  const src = `/** ${comment} */\nexport const ${name} = ${body} as const;\n`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, src, 'utf8');
  console.log('wrote', path.relative(root, outPath));
}

const common = readJson('common.json');
const pages = readJson('pages.json');
const uiFlat = { ...common, ...pages };
if (uiFlat['nav.changePassword'] != null && uiFlat['nav.changePassword.title'] != null) {
  uiFlat['nav.changePasswordLabel'] = uiFlat['nav.changePassword'];
  delete uiFlat['nav.changePassword'];
}

emitTsConst('ui', nestFlat(uiFlat), path.join(root, 'lib/text/ui.ts'), 'Chữ giao diện dùng chung (nav, trang, lỗi, …)');

emitTsConst('tenure', stripPrefixNest(readJson('tenure.json'), 'tenure'), path.join(root, 'lib/text/tenure.ts'), 'Thâm niên');

emitTsConst(
  'taiLieu',
  stripPrefixNest(readJson('tai-lieu.json'), 'taiLieu'),
  path.join(root, 'lib/text/tai-lieu.ts'),
  'Tài liệu',
);

emitTsConst(
  'employee',
  stripPrefixNest(readJson('employee.json'), 'employee'),
  path.join(root, 'features/he-thong/nhan-vien/text.ts'),
  'Nhân viên',
);

emitTsConst(
  'department',
  stripPrefixNest(readJson('department.json'), 'department'),
  path.join(root, 'features/he-thong/phong-ban/text.ts'),
  'Phòng ban',
);

emitTsConst(
  'position',
  stripPrefixNest(readJson('position.json'), 'position'),
  path.join(root, 'features/he-thong/chuc-vu/text.ts'),
  'Chức vụ',
);

emitTsConst(
  'permission',
  stripPrefixNest(readJson('permission.json'), 'permission'),
  path.join(root, 'features/he-thong/phan-quyen/text.ts'),
  'Phân quyền',
);

emitTsConst(
  'company',
  stripPrefixNest(readJson('company.json'), 'company'),
  path.join(root, 'features/he-thong/thong-tin-cong-ty/text.ts'),
  'Thông tin công ty',
);

console.log('done');
