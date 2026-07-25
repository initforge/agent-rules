import type { BadgeConfig } from '@/components/ui/EnumBadge';
import { txt } from '@/lib/text';
import { Gender } from './types';

/** Trạng thái nhân viên – giá trị tiếng Việt lưu DB */
export const TRANG_THAI_NHAN_VIEN = ['Nghỉ việc', 'Đang làm việc', 'Thử việc', 'Nghỉ phép'] as const;
export type TrangThaiNhanVien = (typeof TRANG_THAI_NHAN_VIEN)[number];

/** Trạng thái nhân viên – giá trị tiếng Việt lưu DB */
export const STATUS_OPTIONS: { label: string; value: TrangThaiNhanVien }[] = [
  { get label() { return txt('employee.statusActiveShort'); }, value: 'Đang làm việc' },
  { get label() { return txt('employee.statusInactiveShort'); }, value: 'Nghỉ việc' },
  { get label() { return txt('employee.statusProbation'); }, value: 'Thử việc' },
  { get label() { return txt('employee.statusLeave'); }, value: 'Nghỉ phép' },
];

export const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { get label() { return txt('employee.genderMale'); }, value: 'Nam' },
  { get label() { return txt('employee.genderFemale'); }, value: 'Nữ' },
  { get label() { return txt('employee.genderOther'); }, value: 'Khác' },
];

export const MARITAL_STATUS_OPTIONS = [
  { get label() { return txt('employee.maritalSingle'); }, value: 'Độc thân' },
  { get label() { return txt('employee.maritalMarried'); }, value: 'Đã kết hôn' },
  { get label() { return txt('employee.maritalDivorced'); }, value: 'Ly hôn' },
  { get label() { return txt('employee.maritalWidowed'); }, value: 'Góa' },
];

export const EDUCATION_LEVEL_OPTIONS = [
  { get label() { return txt('employee.eduHighSchool'); }, value: 'THPT' },
  { get label() { return txt('employee.eduCollege'); }, value: 'Trung cấp' },
  { get label() { return txt('employee.eduAssociate'); }, value: 'Cao đẳng' },
  { get label() { return txt('employee.eduBachelor'); }, value: 'Đại học' },
  { get label() { return txt('employee.eduMaster'); }, value: 'Thạc sĩ' },
  { get label() { return txt('employee.eduDoctor'); }, value: 'Tiến sĩ' },
];

export const CONTRACT_TYPE_OPTIONS = [
  { get label() { return txt('employee.contractProbation'); }, value: 'Thử việc' },
  { get label() { return txt('employee.contractFixed'); }, value: 'Có thời hạn' },
  { get label() { return txt('employee.contractIndefinite'); }, value: 'Không thời hạn' },
  { get label() { return txt('employee.contractSeasonal'); }, value: 'Thời vụ' },
];

export const RELATIONSHIP_OPTIONS = [
  { get label() { return txt('employee.relFather'); }, value: 'Cha' },
  { get label() { return txt('employee.relMother'); }, value: 'Mẹ' },
  { get label() { return txt('employee.relWife'); }, value: 'Vợ' },
  { get label() { return txt('employee.relHusband'); }, value: 'Chồng' },
  { get label() { return txt('employee.relSibling'); }, value: 'Anh/Chị/Em' },
  { get label() { return txt('employee.relOther'); }, value: 'Khác' },
];

/* ================================================================== */
/*  Badge Config Maps – dùng với component <EnumBadge />               */
/* ================================================================== */

/** Trạng thái nhân viên */
export const STATUS_BADGE_CONFIG: BadgeConfig<TrangThaiNhanVien> = {
  'Đang làm việc': { get label() { return txt('employee.statusActive'); }, color: 'emerald' },
  'Thử việc': { get label() { return txt('employee.statusProbation'); }, color: 'blue' },
  'Nghỉ phép': { get label() { return txt('employee.statusLeave'); }, color: 'amber' },
  'Nghỉ việc': { get label() { return txt('employee.statusResigned'); }, color: 'slate' },
};

/** Giới tính */
export const GENDER_BADGE_CONFIG: BadgeConfig<Gender> = {
  'Nam':   { get label() { return txt('employee.genderMale'); }, color: 'indigo' },
  'Nữ':   { get label() { return txt('employee.genderFemale'); }, color: 'pink' },
  'Khác': { get label() { return txt('employee.genderOther'); }, color: 'slate' },
};

/** Tình trạng hôn nhân */
export const MARITAL_BADGE_CONFIG: BadgeConfig = {
  'Độc thân':    { get label() { return txt('employee.maritalSingle'); }, color: 'sky' },
  'Đã kết hôn':  { get label() { return txt('employee.maritalMarried'); }, color: 'emerald' },
  'Ly hôn':      { get label() { return txt('employee.maritalDivorced'); }, color: 'amber' },
  'Góa':         { get label() { return txt('employee.maritalWidowed'); }, color: 'slate' },
};

/** Loại hợp đồng */
export const CONTRACT_BADGE_CONFIG: BadgeConfig = {
  'Thử việc':         { get label() { return txt('employee.contractProbation'); }, color: 'blue' },
  'Có thời hạn':      { get label() { return txt('employee.contractFixed'); }, color: 'violet' },
  'Không thời hạn':   { get label() { return txt('employee.contractIndefinite'); }, color: 'emerald' },
  'Thời vụ':          { get label() { return txt('employee.contractSeasonal'); }, color: 'amber' },
};

/** Trình độ học vấn */
export const EDUCATION_BADGE_CONFIG: BadgeConfig = {
  'THPT':       { get label() { return txt('employee.eduHighSchool'); }, color: 'slate' },
  'Trung cấp':  { get label() { return txt('employee.eduCollege'); }, color: 'sky' },
  'Cao đẳng':   { get label() { return txt('employee.eduAssociate'); }, color: 'blue' },
  'Đại học':    { get label() { return txt('employee.eduBachelor'); }, color: 'indigo' },
  'Thạc sĩ':   { get label() { return txt('employee.eduMaster'); }, color: 'violet' },
  'Tiến sĩ':   { get label() { return txt('employee.eduDoctor'); }, color: 'amber' },
};
