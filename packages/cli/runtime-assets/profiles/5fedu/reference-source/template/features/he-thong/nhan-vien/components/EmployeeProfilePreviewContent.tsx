/**
 * Nội dung xem/in hồ sơ nhân viên – layout đồng bộ với buildEmployeeProfileDocumentHTML.
 */
import { txt } from '@/lib/text';
import { formatDateTime } from '@/lib/utils';
import { getSignatureFooterRoles } from '@/lib/print-document/signature-footer';
import { PRINT_PREVIEW_PADDING_CLASS } from '@/lib/print-document/print-styles';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/useStore';
import { buildEmployeeProfileSections } from '../utils/print-employee-pdf';
import type { Employee } from '../core/types';

interface Props {
  employee: Employee;
}

const signatureLabels = () => ({
  preparer: txt('employee.pdf.signPreparer'),
  reviewer: txt('employee.pdf.signReviewer'),
  related: txt('employee.pdf.signRelated'),
  approver: txt('employee.pdf.signApprover'),
  hint: txt('employee.pdf.signHint'),
});

const EmployeeProfilePreviewContent: React.FC<Props> = ({ employee }) => {
  const companyInfo = useUIStore((s) => s.companyInfo);
  const sections = buildEmployeeProfileSections(employee);
  const printedAt = formatDateTime(new Date());
  const signRoles = getSignatureFooterRoles(signatureLabels());

  return (
    <div
      className={cn(
        'employee-profile-preview-content epdoc-root bg-white text-gray-900 font-sans text-[10pt] min-h-full leading-[1.45]',
        PRINT_PREVIEW_PADDING_CLASS
      )}
    >
      <div className="epdoc-header flex items-start gap-4 pb-4 mb-4 border-b-2 border-gray-800">
        {companyInfo.appLogo && (
          <img
            src={companyInfo.appLogo}
            alt="Logo"
            className="epdoc-header-logo w-16 h-16 object-contain shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="epdoc-company-name text-[14pt] font-bold text-gray-900 uppercase tracking-tight">
            {companyInfo.companyName}
          </h2>
          {companyInfo.address && (
            <p className="epdoc-company-meta text-[9pt] text-gray-600 mt-0.5">
              {txt('company.address')}: {companyInfo.address}
            </p>
          )}
          {(companyInfo.email || companyInfo.phone) && (
            <p className="epdoc-company-meta text-[9pt] text-gray-600">
              {companyInfo.email && <span>{txt('company.email')}: {companyInfo.email}</span>}
              {companyInfo.email && companyInfo.phone && ' · '}
              {companyInfo.phone && <span>{txt('company.phone')}: {companyInfo.phone}</span>}
            </p>
          )}
        </div>
      </div>

      <h1 className="epdoc-title text-center text-[16pt] font-bold mb-1">{txt('employee.pdf.title')}</h1>
      <p className="epdoc-subtitle text-center text-[10pt] text-gray-500 mb-3">
        ID {employee.id}  ·  {employee.ho_ten}
      </p>
      <hr className="epdoc-divider border-t border-gray-300 my-3" />

      {sections.map((section) => (
        <table
          key={section.title}
          className="epdoc-section w-full border-collapse mt-3 text-[10pt] break-inside-avoid"
        >
          <thead>
            <tr>
              <th
                colSpan={2}
                className="bg-primary text-white p-1.5 text-left text-[9pt] font-bold"
              >
                {section.title}
              </th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.label}>
                <td className="epdoc-section-label w-[40%] border border-gray-300 p-1.5 font-semibold text-gray-600 bg-gray-50/80">
                  {row.label}
                </td>
                <td className="border border-gray-300 p-1.5 text-gray-900">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      <div className="epdoc-sign-footer flex gap-3 mt-6 break-inside-avoid">
        {signRoles.map((role) => (
          <div key={role.key} className="epdoc-sign-box flex-1 min-w-0 text-center text-[9pt] leading-[1.45]">
            <p className="epdoc-sign-box-title font-bold uppercase m-0">{role.title}</p>
            <p className="epdoc-sign-box-hint text-[8pt] text-gray-600 mt-0.5 mb-0">{role.hint}</p>
            <div className="epdoc-sign-space h-[50mm]" aria-hidden="true" />
          </div>
        ))}
      </div>

      <p className="epdoc-printed-at text-[7pt] text-gray-500 mt-5">
        {txt('employee.pdf.printedAt')} {printedAt}
      </p>
    </div>
  );
};

export default EmployeeProfilePreviewContent;
